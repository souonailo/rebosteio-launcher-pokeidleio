use serde_json::{json, Value};

/// Recognizes official PokeIdle Twitch Channel Point Rewards.
/// - 15% EXP: 300 points (requires 15% in title or prompt)
/// - Catch: 500 points (Capture/captura/catch)
/// - Secret Lure: 1000 points (Secret Lure/lure/isca)
///
/// Schema confirmed via official Twitch GQL ChannelPointsContext / customRewards.
fn is_uuid(id: &str) -> bool {
    id.len() == 36 && id.bytes().enumerate().all(|(i, b)| {
        if [8, 13, 18, 23].contains(&i) { b == b'-' } else { b.is_ascii_hexdigit() }
    })
}

fn duration_hours(text: &str) -> Option<u64> {
    let words: Vec<_> = text.split(|c: char| !c.is_ascii_alphanumeric()).filter(|w| !w.is_empty()).collect();
    let mut hours: Vec<u64> = words.iter().filter_map(|w| w.strip_suffix('h')?.parse().ok()).collect();
    for pair in words.windows(2) {
        if ["hora", "horas", "hour", "hours"].contains(&pair[1]) {
            if let Ok(value) = pair[0].parse() { hours.push(value); }
        }
    }
    let first = hours.first().copied().unwrap_or(1);
    ([1, 3, 5, 10].contains(&first) && hours.iter().all(|h| *h == first)).then_some(first)
}

/// Parses the `customRewards` array from the official Twitch GQL response.
///
/// Output per reward: `{ key, id, title, cost, available }`
pub fn catalog(raw: &Value) -> Vec<Value> {
    let items = if let Some(arr) = raw.as_array() {
        Some(arr)
    } else if let Some(arr) = raw.get("customRewards").and_then(Value::as_array) {
        Some(arr)
    } else if let Some(arr) = raw
        .pointer("/data/community/channel/communityPointsSettings/customRewards")
        .and_then(Value::as_array)
    {
        Some(arr)
    } else {
        raw.get("data").and_then(Value::as_array)
    };

    items
        .into_iter()
        .flatten()
        .filter_map(|r| {
            let id = r.get("id").and_then(Value::as_str)?;
            if !is_uuid(id) {
                return None;
            }

            let title_raw = r.get("title").and_then(Value::as_str)?;
            let prompt_raw = r.get("prompt").and_then(Value::as_str).unwrap_or("");
            let full_text = format!("{} {}", title_raw, prompt_raw).to_lowercase();

            // Must strictly belong to PokeIdle
            if !full_text.contains("pokeidle") {
                return None;
            }

            // Key, expected cost and specific requirement:
            // EXP requires 15% in title/prompt to prevent claiming wrong bonus
            let (key, expected_cost) = if (full_text.contains("15%") || full_text.contains("+15%"))
                && (full_text.contains("xp") || full_text.contains("exp"))
            {
                ("exp", 300u64)
            } else if full_text.contains("capture")
                || full_text.contains("captura")
                || full_text.contains("catch")
            {
                ("catch", 500u64)
            } else if full_text.contains("lure")
                || full_text.contains("secret")
                || full_text.contains("isca")
            {
                ("lure", 1000u64)
            } else {
                return None;
            };

            // Missing fields are never available.
            // Required: isEnabled == true, isPaused == false, isInStock == true,
            // isUserInputRequired == false, pricingType == "POINTS", cooldownExpiresAt == null
            let cost_val = r.get("cost").and_then(Value::as_u64).unwrap_or(0);
            let is_enabled = r.get("isEnabled").and_then(Value::as_bool) == Some(true);
            let is_paused = r.get("isPaused").and_then(Value::as_bool) == Some(false);
            let is_in_stock = r.get("isInStock").and_then(Value::as_bool) == Some(true);
            let is_user_input_required =
                r.get("isUserInputRequired").and_then(Value::as_bool) == Some(false);
            let is_points_pricing =
                r.get("pricingType").and_then(Value::as_str) == Some("POINTS");

            // Cooldown: any non-null is blocked until query confirms null
            let not_on_cooldown = r.get("cooldownExpiresAt").is_some_and(Value::is_null);

            let hours = duration_hours(&full_text);
            let available = hours.and_then(|h| expected_cost.checked_mul(h)) == Some(cost_val)
                && is_enabled
                && is_paused
                && is_in_stock
                && is_user_input_required
                && is_points_pricing
                && not_on_cooldown;

            Some(json!({
                "key": key,
                "id": id,
                "title": title_raw,
                "cost": cost_val,
                "prompt": r.get("prompt").cloned().unwrap_or(Value::Null),
                "durationHours": hours,
                "available": available
            }))
        })
        .collect()
}

/// Evaluates if an account is eligible to redeem a reward based on verified balance and priority.
/// Model matches kick_rewards: verified status, fresh balance (<120s), sufficient points.
pub fn eligible<'a>(balance: &'a Value, priority: &str, now: u64) -> Option<&'a Value> {
    let checked = balance["checkedAt"].as_u64()?;
    if balance["status"] != "verified"
        || balance["catalogStatus"] != "verified"
        || now.checked_sub(checked)? >= 120_000
    {
        return None;
    }
    let points = balance["points"].as_u64()?;
    balance["rewards"].as_array()?.iter().filter(|r| {
        r["available"] == true
            && (priority == "all" || r["key"] == priority)
            && r["cost"].as_u64().map(|c| points >= c).unwrap_or(false)
    }).min_by_key(|r| (r["cost"].as_u64().unwrap_or(u64::MAX), r["durationHours"].as_u64().unwrap_or(u64::MAX)))
}

/// Classifies the outcome of a Twitch redemption response.
///
/// - "rejected": explicit refusal or mutation error code.
/// - "accepted": HTTP 200 with result object and explicit `error: null`.
/// - "unknown": other responses (e.g. HTTP 5xx or missing payload structure).
pub fn response_status(response: &Value) -> &'static str {
    // 1) HTTP status inspection
    let status_opt = response
        .get("status")
        .and_then(Value::as_u64)
        .or_else(|| response.get("statusCode").and_then(Value::as_u64));

    if let Some(status) = status_opt {
        if [400, 401, 403, 404, 429].contains(&status) {
            return "rejected";
        }
    }

    // A resolver may fail after spending points; ambiguous errors must never trigger retries.
    let errors = response
        .get("errors")
        .and_then(Value::as_array)
        .or_else(|| response.pointer("/body/errors").and_then(Value::as_array));

    if let Some(err_arr) = errors {
        if !err_arr.is_empty() {
            return "unknown";
        }
    }

    // 3) GQL mutation error code inspection
    let error_code = response
        .pointer("/data/redeemCommunityPointsCustomReward/error/code")
        .or_else(|| response.pointer("/body/data/redeemCommunityPointsCustomReward/error/code"))
        .and_then(Value::as_str);

    if error_code.is_some() {
        return "rejected";
    }

    // 4) Accepted check: HTTP 200 (if present) with result object and explicit error == null
    if let Some(status) = status_opt {
        if status != 200 {
            return "unknown";
        }
    }

    let payload = response
        .pointer("/data/redeemCommunityPointsCustomReward")
        .or_else(|| response.pointer("/body/data/redeemCommunityPointsCustomReward"));

    if let Some(obj) = payload {
        if obj.is_object() {
            let error_is_null = obj.get("error").map_or(false, Value::is_null);
            // The mutation selects only error { code }; no redemption/id is requested.
            if error_is_null {
                return "accepted";
            }
        }
    }

    "unknown"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn real_catalog_preserves_durations_prices_and_prompts() {
        let raw: Value = serde_json::from_str(include_str!("../../../test/fixtures/twitch-rewards-live.json")).unwrap();
        let rewards = catalog(&raw);
        assert_eq!(rewards.len(), 12);
        for (key, base) in [("exp",300), ("catch",500), ("lure",1000)] {
            for hours in [1,3,5,10] {
                let reward = rewards.iter().find(|r| r["key"] == key && r["durationHours"] == hours).unwrap();
                assert_eq!(reward["cost"], base * hours);
                assert_eq!(reward["available"], true);
                assert_eq!(reward["prompt"], raw.as_array().unwrap().iter().find(|r| r["id"] == reward["id"]).unwrap()["prompt"]);
            }
        }
        let mut reversed = rewards; reversed.reverse();
        let mut balance = json!({"status":"verified","catalogStatus":"verified","checkedAt":1000,"points":6000,"rewards":reversed});
        assert_eq!(eligible(&balance,"catch",1001).unwrap()["cost"],500);
        balance["points"] = json!(500);
        assert_eq!(eligible(&balance,"catch",1001).unwrap()["durationHours"],1);
        balance["points"] = json!(499);
        assert!(eligible(&balance,"catch",1001).is_none());
    }

    fn valid_reward() -> Value {
        json!({
            "id": "e885b54a-7140-410a-8d34-d0246a482b40",
            "title": "+15% EXP PokeIdle",
            "prompt": "1 hora de bônus PokeIdle",
            "cost": 300,
            "isEnabled": true,
            "isPaused": false,
            "isInStock": true,
            "isUserInputRequired": false,
            "pricingType": "POINTS",
            "cooldownExpiresAt": null
        })
    }

    #[test]
    fn parses_all_three_official_pokeidle_rewards() {
        let exp = valid_reward();
        let catch = json!({
            "id": "c1192e22-83b3-4029-a3e9-b530cbbe9618",
            "title": "Bônus de Captura PokeIdle",
            "prompt": "Aumento de catch",
            "cost": 500,
            "isEnabled": true,
            "isPaused": false,
            "isInStock": true,
            "isUserInputRequired": false,
            "pricingType": "POINTS",
            "cooldownExpiresAt": null
        });
        let lure = json!({
            "id": "f5509a24-9b88-4c6e-8e31-89d53c7c2b55",
            "title": "Secret Lure PokeIdle",
            "prompt": "Isca secreta",
            "cost": 1000,
            "isEnabled": true,
            "isPaused": false,
            "isInStock": true,
            "isUserInputRequired": false,
            "pricingType": "POINTS",
            "cooldownExpiresAt": null
        });

        let cat = catalog(&json!([exp, catch, lure]));
        assert_eq!(cat.len(), 3);

        assert_eq!(cat[0]["key"], "exp");
        assert_eq!(cat[0]["cost"], 300);
        assert_eq!(cat[0]["available"], true);
        assert_eq!(cat[0]["id"], "e885b54a-7140-410a-8d34-d0246a482b40");

        assert_eq!(cat[1]["key"], "catch");
        assert_eq!(cat[1]["cost"], 500);
        assert_eq!(cat[1]["available"], true);

        assert_eq!(cat[2]["key"], "lure");
        assert_eq!(cat[2]["cost"], 1000);
        assert_eq!(cat[2]["available"], true);
    }

    #[test]
    fn rejects_rewards_missing_fifteen_percent_for_exp() {
        let mut r = valid_reward();
        r["title"] = json!("+50% EXP PokeIdle"); // Wrong percentage
        let cat = catalog(&json!([r]));
        assert!(cat.is_empty());

        let mut r2 = valid_reward();
        r2["title"] = json!("Bônus EXP PokeIdle"); // Missing 15%
        let cat2 = catalog(&json!([r2]));
        assert!(cat2.is_empty());
    }

    #[test]
    fn rejects_unrelated_rewards_missing_pokeidle() {
        let mut r = valid_reward();
        r["title"] = json!("+15% EXP Discord Server");
        r["prompt"] = json!("Não relacionado");
        let cat = catalog(&json!([r]));
        assert!(cat.is_empty());
    }

    #[test]
    fn requires_valid_uuid() {
        let mut r = valid_reward();
        r["id"] = json!("invalid-not-uuid");
        let cat = catalog(&json!([r]));
        assert!(cat.is_empty());
    }

    #[test]
    fn marks_unavailable_when_cooldown_is_active() {
        let mut r = valid_reward();
        r["cooldownExpiresAt"] = json!("2026-11-04T19:30:00Z");
        let cat = catalog(&json!([r]));
        assert_eq!(cat.len(), 1);
        assert_eq!(cat[0]["available"], false);
    }

    #[test]
    fn marks_unavailable_when_pricing_type_not_points() {
        let mut r = valid_reward();
        r["pricingType"] = json!("BITS");
        let cat = catalog(&json!([r]));
        assert_eq!(cat.len(), 1);
        assert_eq!(cat[0]["available"], false);
    }

    #[test]
    fn marks_unavailable_when_any_required_flag_is_missing_or_false() {
        // isEnabled = false
        let mut r = valid_reward();
        r["isEnabled"] = json!(false);
        assert_eq!(catalog(&json!([r]))[0]["available"], false);

        // isPaused = true
        let mut r = valid_reward();
        r["isPaused"] = json!(true);
        assert_eq!(catalog(&json!([r]))[0]["available"], false);

        // isInStock = false
        let mut r = valid_reward();
        r["isInStock"] = json!(false);
        assert_eq!(catalog(&json!([r]))[0]["available"], false);

        // isUserInputRequired = true
        let mut r = valid_reward();
        r["isUserInputRequired"] = json!(true);
        assert_eq!(catalog(&json!([r]))[0]["available"], false);

        // Missing field (e.g. isInStock absent)
        let mut r = valid_reward();
        r.as_object_mut().unwrap().remove("isInStock");
        assert_eq!(catalog(&json!([r]))[0]["available"], false);

        // Wrong cost
        let mut r = valid_reward();
        r["cost"] = json!(301);
        assert_eq!(catalog(&json!([r]))[0]["available"], false);
    }

    #[test]
    fn eligible_checks_balance_recency_and_priority() {
        let now = 100_000u64;
        let mut b = json!({
            "status": "verified",
            "catalogStatus": "verified",
            "checkedAt": now - 10_000,
            "points": 500,
            "rewards": [
                { "key": "exp", "cost": 300, "available": true },
                { "key": "catch", "cost": 500, "available": true },
                { "key": "lure", "cost": 1000, "available": true }
            ]
        });

        assert_eq!(eligible(&b, "exp", now).unwrap()["key"], "exp");
        assert_eq!(eligible(&b, "catch", now).unwrap()["key"], "catch");
        assert!(eligible(&b, "lure", now).is_none()); // 500 < 1000

        // Priority "all" matches first affordable
        assert_eq!(eligible(&b, "all", now).unwrap()["key"], "exp");

        // Stale balance (> 120s)
        assert!(eligible(&b, "exp", now + 130_000).is_none());

        // Unverified balance
        b["status"] = json!("stale");
        assert!(eligible(&b, "exp", now).is_none());
        b["status"] = json!("verified");

        // Unverified catalog
        b["catalogStatus"] = json!("unavailable");
        assert!(eligible(&b, "exp", now).is_none());
    }

    #[test]
    fn response_status_identifies_rejected_accepted_and_unknown() {
        // HTTP 4xx rejected
        assert_eq!(response_status(&json!({ "status": 400 })), "rejected");
        assert_eq!(response_status(&json!({ "status": 403 })), "rejected");
        assert_eq!(response_status(&json!({ "status": 404 })), "rejected");
        assert_eq!(response_status(&json!({ "status": 429 })), "rejected");

        // GQL resolver errors remain ambiguous.
        assert_eq!(
            response_status(&json!({
                "status": 200,
                "errors": [{ "message": "Signature verification failed" }]
            })),
            "unknown"
        );

        // Mutation error code rejected
        assert_eq!(
            response_status(&json!({
                "status": 200,
                "data": {
                    "redeemCommunityPointsCustomReward": {
                        "error": { "code": "CREATE_REDEMPTION_NOT_ENOUGH_POINTS" }
                    }
                }
            })),
            "rejected"
        );

        // Accepted: HTTP 200 + result object + explicit error null
        assert_eq!(
            response_status(&json!({
                "status": 200,
                "data": {
                    "redeemCommunityPointsCustomReward": {
                        "redemption": { "id": "redemption-uuid-123", "status": "UNFULFILLED" },
                        "error": null
                    }
                }
            })),
            "accepted"
        );

        // Unknown on HTTP 500 or malformed
        assert_eq!(response_status(&json!({ "status": 500 })), "unknown");
        assert_eq!(response_status(&json!({ "status": 408 })), "unknown");
        assert_eq!(response_status(&json!({"status":200,"body":{"data":{"redeemCommunityPointsCustomReward":{"error":null}}}})), "accepted");
        assert_eq!(response_status(&json!({"status":200,"body":{"data":{"redeemCommunityPointsCustomReward":{}}}})), "unknown");
        assert_eq!(
            response_status(&json!({
                "status": 200,
                "data": { "otherQuery": {} }
            })),
            "unknown"
        );
    }
}
