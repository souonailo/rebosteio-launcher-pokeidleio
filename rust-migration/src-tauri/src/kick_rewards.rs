use serde_json::{json, Value};

pub fn matches_pokeidle(text: &str) -> bool {
    let lower = text.to_lowercase();
    let normalized = lower
        .replace('é', "e")
        .replace(['-', '_'], " ");
    normalized.contains("pokeidle") || normalized.contains("poke idle")
}

fn duration_hours(text: &str) -> Option<u64> {
    static DURATION: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let pattern = DURATION.get_or_init(|| regex::Regex::new(r"(?i)\b([0-9]+(?:[.,][0-9]+)?)\s*(horas?|hours?|hrs?|h|minutos?|minutes?|mins?)\b").unwrap());
    let mut found = None;
    for caps in pattern.captures_iter(text) {
        let minutes = caps[2].to_ascii_lowercase().starts_with('m');
        let amount: u64 = caps[1].parse().ok()?;
        let hours = if minutes && amount % 60 == 0 { amount / 60 } else if minutes { return None; } else { amount };
        if !matches!(hours, 1 | 3 | 5 | 10) || found.is_some_and(|previous| previous != hours) { return None; }
        found = Some(hours);
    }
    found
}
pub fn catalog(raw: &Value) -> Vec<Value> {
    raw["data"].as_array().into_iter().flatten().filter_map(|r| {
        let title = r.get("title").and_then(Value::as_str).unwrap_or("");
        let description = r.get("description").and_then(Value::as_str).unwrap_or("");
        let prompt = r.get("prompt").and_then(Value::as_str).unwrap_or("");
        let full_text = format!("{} {} {}", title, description, prompt);
        let hours = duration_hours(&full_text)?;
        if !matches_pokeidle(&full_text) { return None; }
        let full_lower = full_text.to_lowercase();
        let (key, hourly_cost) = if full_lower.contains("xp") || full_lower.contains("exp") { ("exp", if r["cost"] == 200 * hours { 200 } else { 300 }) }
            else if full_lower.contains("capture") || full_lower.contains("captura") || full_lower.contains("catch") { ("catch", 500) }
            else if full_lower.contains("lure") || full_lower.contains("secret") || full_lower.contains("isca") { ("lure", 1000) }
            else { return None; };
        let cost = hours * hourly_cost;
        let id = r.get("id").and_then(Value::as_str)?;
        if id.len() != 26 || !id.bytes().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()) { return None; }
        Some(json!({
            "key": key,
            "hours": hours,
            "id": id,
            "cost": cost,
            "available": r["cost"].as_u64() == Some(cost)
                && r["is_enabled"] == true
                && r["is_paused"] == false
                && r["is_user_input_required"] == false
        }))
    }).collect()
}

pub fn has_watch_reward(balance: &Value) -> bool {
    balance["catalogStatus"] == "verified" && balance["rewards"].as_array()
        .is_some_and(|rewards| rewards.iter().any(|r| r["hours"] == 1 && r["available"] == true))
}

pub fn eligible<'a>(balance: &'a Value, priority: &str, now: u64) -> Option<&'a Value> {
    let checked = balance["checkedAt"].as_u64()?;
    if balance["status"]!="verified" || balance["catalogStatus"]!="verified" || now.checked_sub(checked)? >=120_000 {return None;}
    let points=balance["points"].as_u64()?;
    balance["rewards"].as_array()?.iter().filter(|r| r["available"]==true
        && (priority=="all" || r["key"]==priority) && r["cost"].as_u64().map(|c|points>=c).unwrap_or(false))
        .min_by_key(|r| r["cost"].as_u64())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recognizes_only_unambiguous_supported_durations() {
        for text in ["1 hora de XP", "1h", "60 minutos", "1 hour"] { assert_eq!(duration_hours(text), Some(1)); }
        for text in ["", "2h", "1.5 horas", "30 minutos", "XP (3h) 1 hora"] { assert_eq!(duration_hours(text), None); }
    }

    #[test]
    fn three_hours_can_be_bought_without_qualifying_for_viewing() {
        let rewards = catalog(&json!({"data":[{"id":"01M3WZ35RA642BBYFZ89CDQ23N","title":"XP PokeIdle (3h)","description":"3 horas","cost":600,"is_enabled":true,"is_paused":false,"is_user_input_required":false}]}));
        let mut balance = json!({"checkedAt":1,"catalogStatus":"verified","status":"verified","points":600,"rewards":rewards});
        assert!(!has_watch_reward(&balance));
        assert_eq!(eligible(&balance, "exp", 1).unwrap()["hours"], 3);
        balance["points"] = json!(599);
        assert!(eligible(&balance, "exp", 1).is_none());
    }

    #[test]
    fn rejects_paused_wrong_price_and_unrelated_rewards() {
        let mut r=json!({"id":"01M3WZ35RA642BBYFZ89CDQ23N","title":"Bônus +15% XP PokeIdle","description":"1 hora no PokeIdle","cost":300,"is_enabled":true,"is_paused":false,"is_user_input_required":false});
        assert_eq!(catalog(&json!({"data":[r.clone()]}))[0]["available"],true);
        r["cost"]=json!(200);
        let discounted = catalog(&json!({"data":[r.clone()]}));
        assert_eq!(discounted[0]["available"], true);
        assert_eq!(discounted[0]["cost"], 200);
        r["is_paused"]=json!(true);
        assert_eq!(catalog(&json!({"data":[r.clone()]}))[0]["available"],false);
        r["is_paused"]=json!(false);r["cost"]=json!(301);
        assert_eq!(catalog(&json!({"data":[r.clone()]}))[0]["available"],false);
        r["title"]=json!("Sound effect");r["description"]=json!("sound effect");assert!(catalog(&json!({"data":[r]})).is_empty());

        let lure = json!({"id":"01M3WZ35RA642BBYFZ89CDQ23X","title":"Secret Lure","description":"1 hora no PokeIdle","cost":1000,"is_enabled":true,"is_paused":false,"is_user_input_required":false});
        let cat = catalog(&json!({"data":[lure]}));
        assert_eq!(cat.len(), 1);
        assert_eq!(cat[0]["key"], "lure");
        assert_eq!(cat[0]["cost"], 1000);
        assert_eq!(cat[0]["available"], true);
    }
    #[test]
    fn accepts_pokeidle_variants_in_title_and_description() {
        let r1 = json!({"id":"01M3WZ35RA642BBYFZ89CDQ23N","title":"Bônus +15% XP Poke Idle","description":"1 hora de buff","cost":300,"is_enabled":true,"is_paused":false,"is_user_input_required":false});
        assert_eq!(catalog(&json!({"data":[r1]}))[0]["key"], "exp");

        let r2 = json!({"id":"01M3WZ35RA642BBYFZ89CDQ23N","title":"Secret Lure (poke-idle)","description":"Isca secreta por 1h","cost":1000,"is_enabled":true,"is_paused":false,"is_user_input_required":false});
        assert_eq!(catalog(&json!({"data":[r2]}))[0]["key"], "lure");

        let r3 = json!({"id":"01M3WZ35RA642BBYFZ89CDQ23N","title":"Capture Boost","description":"1 hora no PokéIdle","cost":500,"is_enabled":true,"is_paused":false,"is_user_input_required":false});
        assert_eq!(catalog(&json!({"data":[r3]}))[0]["key"], "catch");

        let r4 = json!({"id":"01M3WZ35RA642BBYFZ89CDQ23N","title":"Capture Boost Discord","description":"Apenas no discord","cost":500,"is_enabled":true,"is_paused":false,"is_user_input_required":false});
        assert!(catalog(&json!({"data":[r4]})).is_empty());
    }
    #[test]
    fn requires_fresh_balance_catalog_selected_kind_and_sufficient_points() {
        let mut b=json!({"status":"verified","catalogStatus":"verified","checkedAt":1000,"points":300,"rewards":[{"key":"exp","available":true,"cost":300}]});
        assert!(eligible(&b,"exp",1000).is_some());assert!(eligible(&b,"catch",1000).is_none());
        assert!(eligible(&b,"all",121000).is_none());b["points"]=json!(299);assert!(eligible(&b,"exp",1000).is_none());
        b["points"]=json!(9999);b["catalogStatus"]=json!("unavailable");assert!(eligible(&b,"exp",1000).is_none());
    }
}
