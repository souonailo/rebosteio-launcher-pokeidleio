use serde_json::{json, Value};
use futures_util::{stream, StreamExt};
use std::future::Future;
use std::{
    collections::BTreeSet,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::{Mutex, RwLock};

pub fn load_creds() -> Value {
    crate::social_store::load("twitch")
}

pub fn save_creds(data: Value) -> bool {
    crate::social_store::save("twitch", &data).is_ok()
}

#[derive(Clone, PartialEq, Eq, Default)]
pub struct AccountConfig {
    pub username: String,
    pub token: String,
    pub enabled: bool,
}

pub fn parse_configs(value: &Value) -> Vec<AccountConfig> {
    let master = value["masterEnabled"]
        .as_bool()
        .or_else(|| value["enabled"].as_bool())
        .unwrap_or(false);

    (0..4)
        .map(|i| {
            let acc = &value["accounts"][i];
            AccountConfig {
                username: crate::social_store::slug(acc["username"].as_str().unwrap_or(""))
                    .unwrap_or_default(),
                token: acc["token"].as_str().unwrap_or("").trim().to_string(),
                enabled: master && acc["enabled"].as_bool().unwrap_or(true),
            }
        })
        .collect()
}

pub fn is_enabled(config: &Value, index: usize) -> bool {
    config["masterEnabled"]
        .as_bool()
        .or_else(|| config["enabled"].as_bool())
        .unwrap_or(false)
        && config["accounts"][index]["enabled"]
            .as_bool()
            .unwrap_or(true)
}

fn empty_status() -> Value {
    json!({
        "status": "disconnected",
        "username": "",
        "channel": "",
        "lastError": "",
        "joinedChannels": []
    })
}

fn empty_points() -> Value {
    json!({
        "status": "disconnected",
        "username": "",
        "balances": {},
        "refreshing": false,
        "error": "",
        "activeRedemption": null
    })
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn error_status(code: u16) -> &'static str {
    match code {
        401 => "login_required",
        403 => "blocked",
        429 => "rate_limited",
        _ => "error",
    }
}

fn service_error(message: String) -> (String, String) {
    ("error".into(), message)
}

fn gql_data(response: &Value) -> Result<Value, (String, String)> {
    let code = response["status"].as_u64().unwrap_or(0) as u16;
    if code != 200 {
        return Err((
            error_status(code).into(),
            format!("Twitch respondeu HTTP {code}."),
        ));
    }
    if response["body"]["errors"]
        .as_array()
        .is_some_and(|errors| !errors.is_empty())
    {
        if response["body"]["errors"].as_array().is_some_and(|errors| errors.iter().any(|error|
            error["message"].as_str().is_some_and(|message| message.eq_ignore_ascii_case("Unauthenticated")))) {
            return Err(("login_required".into(), "Sessão Twitch expirada.".into()));
        }
        return Err(service_error(
            "A Twitch recusou a consulta de pontos.".into(),
        ));
    }
    response["body"]
        .get("data")
        .filter(|value| value.is_object())
        .cloned()
        .ok_or_else(|| service_error("Resposta Twitch inválida.".into()))
}

async fn query_gql(
    window: &tauri::Webview,
    token: &str,
    operation: &str,
    variables: &Value,
) -> Result<Value, (String, String)> {
    let script = crate::twitch_browser::gql_request_script(token, operation, variables)
        .map_err(service_error)?;
    let response = crate::twitch_browser::evaluate(window, script)
        .await
        .map_err(service_error)?;
    gql_data(&response)
}

// A shared legacy login is usable only after Twitch confirms the exact linked identity.
// Cookies never appear in emitted status or logs; no points query or redemption occurs here.
async fn matching_session<F, Fut>(
    expected: &str,
    candidates: Vec<tauri::webview::Cookie<'static>>,
    mut verify: F,
) -> Result<Option<(tauri::webview::Cookie<'static>, Value)>, (String, String)>
where
    F: FnMut(String) -> Fut,
    Fut: std::future::Future<Output = Result<Value, (String, String)>>,
{
    if expected.is_empty() { return Ok(None); }
    let mut tried = BTreeSet::new();
    for cookie in candidates {
        if !crate::twitch_browser::usable_session_cookie(&cookie) || !tried.insert(cookie.value().to_string()) { continue; }
        let data = match verify(cookie.value().to_string()).await {
            Ok(data) => data,
            Err((status, _)) if status == "login_required" => continue,
            Err(error) => return Err(error),
        };
        let user = &data["currentUser"];
        if user["id"].as_str().is_some_and(|id| !id.is_empty())
            && user["login"].as_str().is_some_and(|login| expected.eq_ignore_ascii_case(login)) {
            return Ok(Some((cookie, data)));
        }
    }
    Ok(None)
}

async fn resolve_saved_session(app: &AppHandle, view: &tauri::Webview, index: usize, expected: &str, allow_recovery: bool)
    -> Result<(tauri::webview::Cookie<'static>, Value, bool), (String, String)> {
    if expected.is_empty() {
        return Err(("account_mismatch".into(), "Aguardando a conta Twitch vinculada no jogo.".into()));
    }
    let primary = crate::twitch_browser::session_cookie(view).map_err(service_error)?;
    let primary_token = primary.as_ref().map(|cookie| cookie.value().to_string());
    let verify = |token: String| async move {
        query_gql(view, &token, "query { currentUser { id login } }", &json!({})).await
    };
    if let Some((cookie, data)) = matching_session(expected, primary.into_iter().collect(), verify).await? {
        return Ok((cookie, data, false));
    }
    if !allow_recovery {
        return Err(("account_mismatch".into(), "Aguardando o vínculo Twitch do jogo para recuperar a sessão correta.".into()));
    }
    let saved = crate::twitch_browser::saved_session_candidates(app, index).map_err(service_error)?
        .into_iter().filter(|cookie| Some(cookie.value()) != primary_token.as_deref()).collect();
    if let Some((cookie, data)) = matching_session(expected, saved, verify).await? {
        return Ok((cookie, data, true));
    }
    Err(("login_required".into(),
        "Não foi encontrada uma sessão Twitch válida para o vínculo desta conta. Abra a Twitch para conferir.".into()))
}

fn observed_balance(previous: &Value, points: u64, now: u64) -> Value {
    let increment = if previous["status"] == "verified" {
        previous["points"]
            .as_u64()
            .map(|old| points.saturating_sub(old))
            .unwrap_or(0)
    } else {
        0
    };
    json!({"status":"verified","points":points,"checkedAt":now,
        "earnedPoints":previous["earnedPoints"].as_u64().unwrap_or(0).saturating_add(increment)})
}

fn redemption_identity_matches(config: &Value, index: usize, username: &str) -> bool {
    let linked = crate::social_store::slug(config["accounts"][index]["linkedUsername"].as_str().unwrap_or(""));
    config["accounts"][index]["gameLinked"] == true && !username.is_empty() && linked.as_deref() == Some(username)
}

fn settle_redemption(receipt: &mut Value, response: &Value, after: Option<u64>) {
    receipt["httpStatus"] = response["status"].clone();
    let payload = &response["body"]["data"]["redeemCommunityPointsCustomReward"];
    receipt["errorCode"] = payload["error"]["code"].clone();
    let redemption_id = payload["redemption"]["id"].as_str().filter(|s| !s.is_empty());
    receipt["redemptionId"] = json!(redemption_id);
    let status = crate::twitch_rewards::response_status(response);
    if status == "rejected" {
        receipt["status"] = json!("rejected");
        receipt["message"] = json!(if receipt["reward"]["trialPaused"] == true {
            "A Twitch recusou a recompensa marcada como pausada. Não haverá nova tentativa desse item enquanto o catálogo continuar assim."
        } else {
            "A Twitch recusou o resgate. Nova tentativa em 5 minutos."
        });
    } else if status == "accepted" && (redemption_id.is_some() || receipt["before"].as_u64().zip(receipt["reward"]["cost"].as_u64())
        .is_some_and(|(before, cost)| cost > 0 && after.is_some() && before.checked_sub(cost) == after)) {
        receipt["status"] = json!("confirmed");
        receipt["message"] = json!("Resgate confirmado na Twitch. O jogo confirma a aplicação do bônus.");
    } else {
        receipt["status"] = json!("pending");
        receipt["message"] = json!(if receipt["reward"]["trialPaused"] == true {
            "Tentativa em recompensa com pausa informada ficou sem confirmação. Não será reenviada enquanto esse estado persistir."
        } else {
            "Resgate sem confirmação. Automático pausado para evitar duplicação; confira o histórico na Twitch."
        });
    }
}

/// Limits concurrent watched channels per account according to Twitch platform limits (max 2).
pub const MAX_TWITCH_WATCH_CHANNELS: usize = 2;
/// Max official balance inquiry channels tracked per account.
pub const MAX_TWITCH_QUERY_CHANNELS: usize = 40;
const TWITCH_QUERY_CONCURRENCY: usize = 4;
const TWITCH_QUERY_BUDGET: Duration = Duration::from_secs(32);

fn rotate_channels(channels: &[String], start: usize) -> Vec<String> {
    if channels.is_empty() { return Vec::new(); }
    let split = start % channels.len();
    channels[split..].iter().chain(&channels[..split]).cloned().collect()
}

fn account_buff_priority<'a>(config: &'a Value, index: usize) -> &'a str {
    let priority = config["accounts"][index]["claimPriority"].as_str()
        .or_else(|| config["claimPriority"].as_str()).unwrap_or("exp");
    match priority {
        "exp" | "catch" | "lure" | "all" => priority,
        _ => "exp",
    }
}

fn relevant_live_channels(official: &[String], online: &[String], balances: &Value, priority: &str, now: u64) -> Vec<String> {
    let live: BTreeSet<_> = online.iter().map(String::as_str).collect();
    official.iter().filter(|channel| {
        live.contains(channel.as_str()) &&
        crate::twitch_rewards::offers_selected_buff(&balances[channel.as_str()], priority, now)
    }).cloned().collect()
}

fn account_live_targets(config: &Value, official: &[Vec<String>], online: &[String], points: &[Value], now: u64) -> Vec<Vec<String>> {
    (0..4).map(|index| {
        if !is_enabled(config, index) { return Vec::new(); }
        relevant_live_channels(&official[index], online, &points[index]["balances"],
            account_buff_priority(config, index), now)
    }).collect()
}

fn redemption_on_cooldown(receipt: &Value, now: u64) -> bool {
    let elapsed = now.saturating_sub(receipt["at"].as_u64().unwrap_or(0));
    (receipt["status"] == "pending" && elapsed < 120_000)
        || (receipt["status"] == "rejected" && elapsed < 300_000)
        || (receipt["status"] == "confirmed" && elapsed < 55_000)
}

fn migrate_redemption_history(journal: &mut Value, index: usize) {
    let previous = journal["accounts"][index].clone();
    if !journal["channels"].is_array() { journal["channels"] = json!([{}, {}, {}, {}]); }
    let channels = journal["channels"].as_array_mut().unwrap();
    while channels.len() < 4 { channels.push(json!({})); }
    if !channels[index].is_object() { channels[index] = json!({}); }
    if let Some(channel) = previous["channel"].as_str().filter(|s| crate::social_store::slug(s).as_deref() == Some(*s)).map(str::to_owned) {
        if channels[index].get(&channel).is_none() {
            channels[index][&channel] = previous;
        }
    }
}

async fn query_roster<F, Fut>(channels: &[String], budget: Duration, fetch: F)
    -> Vec<(String, Result<Value, (String, String)>)>
where F: Fn(String) -> Fut, Fut: Future<Output = Result<Value, (String, String)>>
{
    let requests = stream::iter(channels.iter().cloned()).map(|channel| {
        let result = fetch(channel.clone());
        async move { (channel, result.await) }
    });
    // `buffered` keeps the returned prefix ordered, which makes round-robin
    // continuation safe even if some channels take longer than others.
    let mut requests = requests.buffered(TWITCH_QUERY_CONCURRENCY);
    let deadline = tokio::time::Instant::now() + budget;
    let mut results = Vec::new();
    while let Ok(Some(result)) = tokio::time::timeout_at(deadline, requests.next()).await {
        results.push(result);
    }
    results
}

fn redemption_candidate(state: &Value, priority: &str, journal: &Value, index: usize, now: u64)
    -> Option<(String, String, Value, u64)>
{
    let balances = state["balances"].as_object()?;
    let last_channel = journal["accounts"][index]["channel"].as_str().unwrap_or("");
    let start = balances.keys().position(|channel| channel.as_str() > last_channel).unwrap_or(0);
    let select = |trial_paused: bool| {
        balances.iter().skip(start).chain(balances.iter().take(start)).find_map(|(channel, balance)| {
            let previous = &journal["channels"][index][channel];
            if redemption_on_cooldown(previous, now) { return None; }
            let reward = if trial_paused {
                crate::twitch_rewards::eligible_paused_trial(balance, priority, now)?
            } else {
                crate::twitch_rewards::eligible(balance, priority, now)?
            };
            // The API reports a pause. If a single trial was rejected or
            // remained uncertain, don't submit that reward again on the same
            // account/channel until Twitch reports it normally available.
            if trial_paused && previous["reward"]["id"] == reward["id"]
                && (previous["status"] == "rejected" || previous["status"] == "pending") {
                return None;
            }
            Some((channel.clone(), balance["channelId"].as_str()?.to_string(), reward.clone(), balance["points"].as_u64()?))
        })
    };
    // Prefer rewards that Twitch explicitly reports as available. A paused
    // flag alone cannot prove a manual redemption is impossible.
    select(false).or_else(|| select(true))
}

fn waiting_redemption_message(state: &Value, priority: &str, now: u64) -> String {
    let chosen = match priority {
        "exp" => "EXP",
        "catch" => "Captura",
        "lure" => "Lure",
        _ => "Qualquer buff",
    };
    let mut catalogs = 0usize;
    let mut alternatives = 0usize;
    let mut paused_trials = 0usize;
    let mut closest: Option<(u64, String)> = None;
    for (channel, balance) in state["balances"].as_object().into_iter().flatten() {
        let Some(checked) = balance["checkedAt"].as_u64() else { continue; };
        if balance["status"] != "verified" || balance["catalogStatus"] != "verified"
            || now.checked_sub(checked).is_none_or(|age| age >= 120_000) { continue; }
        catalogs += 1;
        let Some(points) = balance["points"].as_u64() else { continue; };
        if priority != "all" && crate::twitch_rewards::eligible(balance, "all", now).is_some() {
            alternatives += 1;
        }
        if crate::twitch_rewards::eligible_paused_trial(balance, priority, now).is_some() {
            paused_trials += 1;
        }
        for reward in balance["rewards"].as_array().into_iter().flatten() {
            if reward["available"] != true || (priority != "all" && reward["key"] != priority) { continue; }
            let Some(cost) = reward["cost"].as_u64() else { continue; };
            if cost > points {
                let missing = cost - points;
                if closest.as_ref().is_none_or(|(best, _)| missing < *best) {
                    closest = Some((missing, channel.clone()));
                }
            }
        }
    }
    if catalogs == 0 {
        return "Aguardando catálogo de recompensas confirmado pela Twitch.".into();
    }
    let mut message = format!("{chosen}: nenhuma recompensa resgatável com o saldo atual.");
    if let Some((missing, channel)) = closest {
        message.push_str(&format!(" Faltam pelo menos {missing} pts em @{channel} para uma opção ativa."));
    } else {
        message.push_str(" A recompensa selecionada pode estar desativada nos canais consultados.");
    }
    if alternatives > 0 {
        message.push_str(&format!(" Há {alternatives} canal(is) com outro buff já disponível; selecione 'Qualquer buff' se quiser resgatá-los."));
    }
    if paused_trials > 0 {
        message.push_str(&format!(" Em {paused_trials} canal(is), a Twitch sinalizou pausa, mas essa informação diverge de resgates manuais; a tentativa automática é controlada e não se repete após recusa ou resultado incerto para a mesma recompensa."));
    }
    message
}

pub struct TwitchServiceManager {
    config: RwLock<Value>,
    pub save_lock: Mutex<()>,
    status: RwLock<Vec<Value>>,
    points: RwLock<Vec<Value>>,
    channels: RwLock<Vec<Vec<String>>>,
    lives: RwLock<Vec<String>>,
    revision: AtomicU64,
    configure_lock: Mutex<()>,
    redemption_lock: Mutex<()>,
    jobs: Vec<Mutex<()>>,
    last_refresh: Mutex<Vec<Option<Instant>>>,
    next_channel: Mutex<Vec<usize>>,
    last_watch: Mutex<Vec<Option<Instant>>>,
    watch_cursor: Mutex<Vec<usize>>,
    spade_cache: Mutex<Vec<Option<(Instant, String)>>>,
}

impl TwitchServiceManager {
    pub fn new() -> Self {
        Self {
            config: RwLock::new(json!({
                "masterEnabled": false,
                "autoClaim": false,
                "autoClaimProtocol": 1,
                "claimPriority": "exp",
                "accounts": []
            })),
            save_lock: Mutex::new(()),
            status: RwLock::new((0..4).map(|_| empty_status()).collect()),
            points: RwLock::new((0..4).map(|_| empty_points()).collect()),
            channels: RwLock::new(vec![Vec::new(); 4]),
            lives: RwLock::new(Vec::new()),
            revision: AtomicU64::new(0),
            configure_lock: Mutex::new(()),
            redemption_lock: Mutex::new(()),
            jobs: (0..4).map(|_| Mutex::new(())).collect(),
            last_refresh: Mutex::new(vec![None; 4]),
            next_channel: Mutex::new(vec![0; 4]),
            last_watch: Mutex::new(vec![None; 4]),
            watch_cursor: Mutex::new(vec![0; 4]),
            spade_cache: Mutex::new(vec![None; 4]),
        }
    }

    pub async fn get_status(&self) -> Value {
        let config = self.config.read().await;
        let accounts = self.status.read().await.clone();
        let lives = self.lives.read().await.clone();
        json!({
            "masterEnabled": (0..4).any(|i| is_enabled(&config, i)),
            "liveChannels": lives,
            "accounts": accounts
        })
    }

    pub async fn get_points(&self) -> Value {
        json!({
            "accounts": self.points.read().await.clone()
        })
    }

    pub async fn emit(&self, app: &AppHandle) {
        let _ = app.emit_to("main", "twitch:status", self.get_status().await);
        let _ = app.emit_to("main", "twitch:points", self.get_points().await);
    }

    /// Compute each account's IRC target list from the catalog actually
    /// checked by the native supervisor. This is independent of the HTML
    /// view, so changing the selected buff also works in headless/tray mode.
    pub async fn sync_chat_targets(&self, app: &AppHandle) {
        let config = self.config.read().await.clone();
        let official = self.channels.read().await.clone();
        let online = self.lives.read().await.clone();
        let points = self.points.read().await.clone();
        let now = now_ms();
        let targets = account_live_targets(&config, &official, &online, &points, now);
        if let Some(chat) = app.try_state::<Arc<crate::twitch_chat::TwitchChatServiceManager>>() {
            chat.inner().sync_lives(targets).await;
        }
    }

    pub fn start(self: &Arc<Self>, app: AppHandle) {
        let manager = self.clone();
        tauri::async_runtime::spawn(async move {
            let mut timer = tokio::time::interval(Duration::from_secs(60));
            loop {
                timer.tick().await;
                for index in 0..4 {
                    if is_enabled(&*manager.config.read().await, index) {
                        let m = manager.clone();
                        let a = app.clone();
                        tokio::spawn(async move {
                            let _ = m.refresh(&a, index, false).await;
                        });
                    }
                }
            }
        });
    }

    pub async fn configure(&self, app: &AppHandle, value: &Value) {
        let _guard = self.configure_lock.lock().await;
        let mut config = self.config.write().await;
        if *config == *value {
            return;
        }

        self.revision.fetch_add(1, Ordering::SeqCst);
        let mut status = self.status.write().await;
        let mut points = self.points.write().await;
        let mut last = self.last_refresh.lock().await;
        let cfgs = parse_configs(value);

        for i in 0..4 {
            let user_changed =
                config["accounts"][i]["username"] != value["accounts"][i]["username"];
            let now_enabled = is_enabled(value, i);
            let was_enabled = is_enabled(&config, i);
            if account_buff_priority(&config, i) != account_buff_priority(value, i) {
                // The catalog contains all reward types: switch chat targets
                // immediately, and allow the next watch poll to use new ones.
                self.last_watch.lock().await[i] = None;
            }

            if user_changed || was_enabled != now_enabled {
                // Invalidate balances and reset refreshing upon user change or toggle
                points[i] = empty_points();
                points[i]["username"] = json!(cfgs[i].username);
                last[i] = None;
            }

            if !now_enabled {
                if let Some(window) = app.get_webview_window(&format!("twitch-session-{}", i)) {
                    let _ = window.destroy();
                }
                status[i] = json!({
                    "status": "disconnected",
                    "username": cfgs[i].username,
                    "channel": "",
                    "lastError": "",
                    "joinedChannels": []
                });
                points[i]["status"] = json!("disconnected");
            } else if !was_enabled || status[i]["status"] == "disconnected" {
                status[i] = json!({
                    "status": "waiting_watch",
                    "username": cfgs[i].username,
                    "channel": "",
                    "lastError": "",
                    "joinedChannels": []
                });
                points[i]["status"] = json!("waiting_watch");
            } else {
                status[i]["username"] = json!(cfgs[i].username);
                points[i]["username"] = json!(cfgs[i].username);
            }
        }

        *config = value.clone();
        drop(last);
        drop(status);
        drop(points);
        drop(config);

        self.sync_chat_targets(app).await;
        self.emit(app).await;
    }

    pub async fn sync_lives(&self, lives: Vec<String>) -> bool {
        let _guard = self.configure_lock.lock().await;
        let mut names: Vec<_> = lives
            .iter()
            .filter_map(|s| crate::social_store::slug(s))
            .collect();
        names.sort();
        names.dedup();
        names.truncate(MAX_TWITCH_QUERY_CHANNELS);

        let mut current = self.lives.write().await;
        if *current != names {
            *current = names;
            self.revision.fetch_add(1, Ordering::SeqCst);
        }
        true
    }

    pub async fn set_channels(&self, channels: Vec<Vec<String>>) {
        let _guard = self.configure_lock.lock().await;
        let next: Vec<Vec<String>> = (0..4)
            .map(|i| {
                channels
                    .get(i)
                    .into_iter()
                    .flatten()
                    .filter_map(|s| crate::social_store::slug(s))
                    .collect::<BTreeSet<_>>()
                    .into_iter()
                    .take(MAX_TWITCH_QUERY_CHANNELS)
                    .collect()
            })
            .collect();

        let mut current = self.channels.write().await;
        if *current != next {
            *current = next;
            self.revision.fetch_add(1, Ordering::SeqCst);
            *self.last_refresh.lock().await = vec![None; 4];
            *self.next_channel.lock().await = vec![0; 4];
        }
    }

    pub async fn open(&self, app: &AppHandle, index: usize, channel: &str) -> Result<bool, String> {
        if index >= 4 {
            return Err("Conta Twitch inválida".into());
        }
        let clean_channel = if !channel.is_empty() && channel != "login" {
            crate::social_store::slug(channel).ok_or("Canal Twitch inválido")?
        } else {
            String::new()
        };

        let target_url = crate::twitch_browser::official_url(&clean_channel)?;
        if clean_channel.is_empty() {
            // Recover an existing game login before displaying a login page unnecessarily.
            let _ = self.refresh(app, index, true).await;
        }
        self.ensure_session_window(app, index, true).await?;

        let label = format!("twitch-session-{}", index);
        let window = app
            .get_webview_window(&label)
            .ok_or("Janela Twitch indisponível")?;

        window.navigate(target_url).map_err(|e| e.to_string())?;
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;

        let username = self.status.read().await[index]["username"]
            .as_str()
            .unwrap_or("")
            .to_string();

        self.status.write().await[index] = json!({
            "status": "page_open",
            "username": username,
            "channel": clean_channel,
            "lastError": "",
            "joinedChannels": []
        });

        self.points.write().await[index]["status"] = json!("page_open");
        self.emit(app).await;
        Ok(true)
    }

    pub async fn close(&self, app: &AppHandle, index: usize) -> Result<bool, String> {
        if index >= 4 {
            return Err("Conta Twitch inválida".into());
        }
        let label = format!("twitch-session-{}", index);
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.destroy();
        }

        self.on_session_closed(app, index).await;
        Ok(true)
    }

    pub async fn on_session_closed(&self, app: &AppHandle, index: usize) {
        if index >= 4 {
            return;
        }
        let enabled = is_enabled(&*self.config.read().await, index);
        let username = self.status.read().await[index]["username"]
            .as_str()
            .unwrap_or("")
            .to_string();

        self.status.write().await[index] = json!({
            "status": if enabled { "waiting_watch" } else { "disconnected" },
            "username": username,
            "channel": "",
            "lastError": "",
            "joinedChannels": []
        });

        self.points.write().await[index]["status"] = json!(if enabled {
            "waiting_watch"
        } else {
            "disconnected"
        });

        self.emit(app).await;
    }

    async fn ensure_session_window(
        &self,
        app: &AppHandle,
        index: usize,
        visible: bool,
    ) -> Result<(), String> {
        let label = format!("twitch-session-{}", index);
        if app.get_webview_window(&label).is_some() {
            return Ok(());
        }

        let profile = crate::twitch_browser::profile(index);
        let proxy = crate::account_proxy::for_account(index)?;
        let mut builder = WebviewWindowBuilder::new(
            app,
            &label,
            WebviewUrl::External("about:blank".parse().unwrap()),
        );

        let proxy_url_ref = proxy.as_ref().map(|p| &p.url);
        builder =
            builder.additional_browser_args(&crate::webview_memory::browser_args(proxy_url_ref));
        if let Some(p) = &proxy {
            builder = builder.proxy_url(p.url.clone());
        }

        builder = builder
            .title(format!("Twitch — Conta {}", index + 1))
            .inner_size(1100.0, 780.0)
            .visible(visible)
            .focused(visible)
            .skip_taskbar(!visible)
            .data_directory(profile);

        builder.build().map_err(|e| e.to_string())?;

        if let Some(view) = app.get_webview(&label) {
            crate::account_proxy::authenticate(&view, proxy.as_ref()).await?;
            let _ = crate::twitch_browser::mute(&view).await;
        }

        let handle = app.clone();
        let manager = app.state::<Arc<Self>>().inner().clone();
        tauri::async_runtime::spawn(async move {
            for _ in 0..150 {
                tokio::time::sleep(Duration::from_secs(2)).await;
                let Some(window) = handle.get_webview_window(&format!("twitch-session-{}", index))
                else {
                    break;
                };
                let logged_in = window
                    .cookies_for_url("https://www.twitch.tv".parse().unwrap())
                    .ok()
                    .map(|cookies| cookies.iter().any(|c| c.name() == "auth-token"))
                    .unwrap_or(false);
                if logged_in {
                    let _ = manager.refresh(&handle, index, true).await;
                    break;
                }
            }
        });

        Ok(())
    }

    pub async fn refresh(
        &self,
        app: &AppHandle,
        index: usize,
        force: bool,
    ) -> Result<Value, String> {
        if index >= 4 {
            return Err("Conta Twitch inválida".into());
        }
        let Ok(_job) = self.jobs[index].try_lock() else {
            return Ok(self.get_points().await);
        };
        let generation = self.revision.load(Ordering::SeqCst);
        let config = self.config.read().await.clone();
        if !force && !is_enabled(&config, index) {
            return Ok(self.get_points().await);
        }
        {
            let mut last = self.last_refresh.lock().await;
            if last[index]
                .is_some_and(|t| t.elapsed() < Duration::from_secs(if force { 5 } else { 55 }))
            {
                drop(last);
                return Ok(self.get_points().await);
            }
            last[index] = Some(Instant::now());
        }
        let all_channels = self.channels.read().await[index].clone();
        let start_channel = self.next_channel.lock().await[index];
        let channels = rotate_channels(&all_channels, start_channel);
        let live_channels = self.lives.read().await.clone();
        let mut state = self.points.read().await[index].clone();
        {
            let _commit = self.configure_lock.lock().await;
            if generation != self.revision.load(Ordering::SeqCst) {
                return Ok(self.get_points().await);
            }
            self.points.write().await[index]["refreshing"] = json!(true);
        }
        self.emit(app).await;
        let result: Result<(), (String, String)> =
            tokio::time::timeout(Duration::from_secs(150), async {
                let query = crate::twitch_browser::query_window(app, index)
                    .await
                    .map_err(service_error)?;
                let window = query.view().map_err(service_error)?;
                let expected = crate::social_store::slug(config["accounts"][index]["username"].as_str().unwrap_or(""))
                    .unwrap_or_default();
                let allow_recovery = redemption_identity_matches(&config, index, &expected);
                let (cookie, identity, recovered) = resolve_saved_session(app, &window, index, &expected, allow_recovery).await?;
                let auth_token = cookie.value().to_string();
                if recovered {
                    let _configuration = self.configure_lock.lock().await;
                    if generation != self.revision.load(Ordering::SeqCst) { return Ok(()); }
                    window.set_cookie(cookie).map_err(|_| service_error("Não foi possível salvar a sessão Twitch recuperada.".into()))?;
                }
                let login = identity
                    .pointer("/currentUser/login")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                let user_id = identity
                    .pointer("/currentUser/id")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                if state["username"].as_str().unwrap_or("") != login {
                    state["balances"] = json!({});
                }
                state["username"] = json!(login);
                state["status"] = json!("authenticated");
                state["error"] = json!("");
                let previous = state["balances"].clone();
                state["balances"] = json!({});
                // Retain confirmed balances only for authorized channels; expiry is
                // enforced by eligible() and the HUD, even if a poll is deferred.
                for channel in &channels {
                    if let Some(balance) = previous.get(channel) {
                        state["balances"][channel] = balance.clone();
                    }
                }
                // A single slow or offline channel cannot exhaust the entire refresh.
                // Query the whole official roster with bounded concurrency; rotate the
                // starting point each cycle so large rosters receive fair coverage.
                let view = &window;
                let token = &auth_token;
                let scanned = query_roster(&channels, TWITCH_QUERY_BUDGET, |channel| async move {
                    query_gql(view, token, crate::twitch_browser::POINTS_CATALOG_QUERY,
                        &json!({"login":channel})).await
                }).await;
                let queried = scanned.len();
                for (channel, result) in scanned {
                    if generation != self.revision.load(Ordering::SeqCst) { return Ok(()); }
                    match result {
                        Ok(data) => {
                            let value = data.pointer("/user/channel/self/communityPoints/balance").and_then(Value::as_u64);
                            state["balances"][&channel] = match value {
                                Some(points) => observed_balance(&previous[&channel], points, now_ms()),
                                None => json!({"status":"unavailable","checkedAt":now_ms()}),
                            };
                            let rewards = data.pointer("/user/channel/communityPointsSettings/customRewards");
                            state["balances"][&channel]["channelId"] = data["user"]["id"].clone();
                            state["balances"][&channel]["catalogStatus"] = json!(if rewards.is_some_and(Value::is_array) { "verified" } else { "unavailable" });
                            state["balances"][&channel]["rewards"] = json!(crate::twitch_rewards::catalog(rewards.unwrap_or(&Value::Null)));
                        }
                        Err((status, message)) if status == "login_required" || status == "rate_limited" => {
                            return Err((status, message));
                        }
                        Err((_, message)) => {
                            state["balances"][&channel] = json!({"status":"unavailable","error":message,"checkedAt":now_ms()});
                        }
                    }
                }
                if !channels.is_empty() {
                    self.next_channel.lock().await[index] = (start_channel + queried) % channels.len();
                }
                self.auto_redeem(&window, &auth_token, index, generation, &config, &mut state).await;
                // An accepted analytics request is only an attempt, never proof of points or bonus time.
                let watch_due = {
                    let mut last = self.last_watch.lock().await;
                    let due = is_enabled(&config, index)
                        && last[index].is_none_or(|t| t.elapsed() >= Duration::from_secs(55));
                    if due {
                        last[index] = Some(Instant::now());
                    }
                    due
                };
                if watch_due {
                    state["attempts"] = json!({});
                    let live_targets = relevant_live_channels(&all_channels, &live_channels,
                        &state["balances"], account_buff_priority(&config, index), now_ms());
                    let mut watch_cursor = self.watch_cursor.lock().await;
                    let ordered = rotate_channels(&live_targets, watch_cursor[index]);
                    if !ordered.is_empty() {
                        watch_cursor[index] = (watch_cursor[index] + MAX_TWITCH_WATCH_CHANNELS) % ordered.len();
                    }
                    drop(watch_cursor);
                    for channel in ordered.iter().take(MAX_TWITCH_WATCH_CHANNELS) {
                        if generation != self.revision.load(Ordering::SeqCst) {
                            return Ok(());
                        }
                        let attempt: Result<Value, String> = async {
                        let info = query_gql(
                            &window,
                            &auth_token,
                            "query($login: String!) { user(login: $login) { id stream { id } } }",
                            &json!({"login":channel}),
                        )
                        .await
                        .map_err(|(_, message)| message)?;
                        let channel_id = info
                            .pointer("/user/id")
                            .and_then(Value::as_str)
                            .unwrap_or("");
                        let broadcast_id = info
                            .pointer("/user/stream/id")
                            .and_then(Value::as_str)
                            .unwrap_or("");
                        if channel_id.is_empty() || broadcast_id.is_empty() {
                            return Ok(json!({"status":"offline","at":now_ms()}));
                        }
                        let client = crate::account_proxy::http_client(
                            index,
                            reqwest::Client::builder()
                                .redirect(reqwest::redirect::Policy::none())
                                .timeout(Duration::from_secs(12)),
                        )?;
                        let cached = self.spade_cache.lock().await[index].clone();
                        let endpoint = if let Some((at, endpoint)) =
                            cached.filter(|(at, _)| at.elapsed() < Duration::from_secs(900))
                        {
                            let _ = at;
                            endpoint
                        } else {
                            let endpoint =
                                crate::twitch_browser::discover_spade_endpoint(&client, channel)
                                    .await?;
                            self.spade_cache.lock().await[index] =
                                Some((Instant::now(), endpoint.clone()));
                            endpoint
                        };
                        if generation != self.revision.load(Ordering::SeqCst) {
                            return Ok(json!({"status":"cancelled","at":now_ms()}));
                        }
                        let payload = crate::twitch_browser::encode_spade_payload(
                            user_id,
                            channel_id,
                            broadcast_id,
                            channel,
                        );
                        let accepted = crate::twitch_browser::send_spade_minute_watched(
                            &client, &endpoint, &payload,
                        )
                        .await?;
                        Ok(json!({"status":if accepted {"sent"} else {"rejected"},"at":now_ms()}))
                    }
                    .await;
                        state["attempts"][channel] =
                            attempt.unwrap_or_else(|_| json!({"status":"error","at":now_ms()}));
                    }
                }
                Ok(())
            })
            .await
            .unwrap_or_else(|_| {
                Err(service_error(
                    "Consulta Twitch excedeu o tempo limite.".into(),
                ))
            });
        {
            let _commit = self.configure_lock.lock().await;
            if generation == self.revision.load(Ordering::SeqCst) {
                if let Err((status, message)) = result {
                    // Keep old numbers only as explicitly stale; never leave a verified balance after failure.
                    state = self.points.read().await[index].clone();
                    state["status"] = json!(status);
                    state["error"] = json!(message);
                    if let Some(balances) = state["balances"].as_object_mut() {
                        for value in balances.values_mut() {
                            value["status"] = json!("stale");
                        }
                    }
                    state["attempts"] = json!({});
                }
                state["refreshing"] = json!(false);
                self.status.write().await[index] = json!({"status":state["status"],"username":state["username"],"lastError":state["error"],"joinedChannels":[]});
                self.points.write().await[index] = state;
            } else {
                // The per-account job lock prevents this from clearing a newer request's indicator.
                self.points.write().await[index]["refreshing"] = json!(false);
            }
        }
        self.emit(app).await;
        self.sync_chat_targets(app).await;
        Ok(self.get_points().await)
    }

    async fn auto_redeem(&self, view: &tauri::Webview, token: &str, index: usize, generation: u64, config: &Value, state: &mut Value) {
        state["redemption"] = json!({"status":"off","message":"Resgate automático desligado."});
        if config["autoClaim"] != true || config["autoClaimProtocol"] != 1 || !is_enabled(config, index) { return; }
        if !redemption_identity_matches(config, index, state["username"].as_str().unwrap_or("")) {
            state["redemption"] = json!({"status":"waiting_link","message":"Confirme o vínculo desta mesma conta Twitch no jogo para resgatar."});
            return;
        }
        // Read and write the journal under one lock, including different account slots.
        let _serial = self.redemption_lock.lock().await;
        let mut journal = match crate::social_store::try_load("twitch-redemptions") {
            Ok(value) => value,
            Err(_) => { state["redemption"] = json!({"status":"paused","message":"Não foi possível ler o registro de resgates. Automático pausado."}); return; }
        };
        let Some(accounts) = journal["accounts"].as_array_mut() else { return; };
        while accounts.len() < 4 { accounts.push(json!({})); }
        let previous = accounts[index].clone();
        let elapsed = now_ms().saturating_sub(previous["at"].as_u64().unwrap_or(0));
        // Legacy receipts without a known channel are ambiguous: never risk spending twice.
        if previous["status"] == "pending" && previous["channel"].as_str().is_none() && elapsed < 120_000 {
            state["redemption"] = json!({"status":"paused","message":"Resgate anterior sem canal identificado. Confira o histórico na Twitch."});
            return;
        }
        migrate_redemption_history(&mut journal, index);
        // A confirmed spend limits the next request for this account; an individual
        // rejected/pending channel must not hold up unrelated streamers.
        if previous["status"] == "confirmed" && elapsed < 55_000 {
            state["redemption"] = previous; return;
        }
        state["redemption"] = json!({"status":"waiting_points","message":"Automático ativo: verificando saldo e recompensas da preferência escolhida."});
        let priority = config["accounts"][index]["claimPriority"].as_str().or_else(||config["claimPriority"].as_str()).unwrap_or("exp");
        let candidate = redemption_candidate(state, priority, &journal, index, now_ms());
        let Some((channel, channel_id, reward, before)) = candidate else {
            state["redemption"]["message"] = json!(waiting_redemption_message(state, priority, now_ms()));
            if previous["status"] == "pending" && elapsed < 120_000 {
                state["redemption"] = previous;
                state["redemption"]["message"] = json!("Resgate anterior sem confirmação neste canal; outros canais serão consultados.");
            } else if previous["status"] == "rejected" && elapsed < 300_000 {
                state["redemption"] = previous;
            }
            return;
        };
        // Match the Kick flow: a setting change cannot race submission of a spend.
        let _configuration = self.configure_lock.lock().await;
        if generation != self.revision.load(Ordering::SeqCst) { return; }
        let transaction = match crate::twitch_browser::evaluate(view, "crypto.randomUUID()".into()).await {
            Ok(value) => value.as_str().unwrap_or("").to_string(), Err(_) => return
        };
        let script = match crate::twitch_browser::redemption_script(token, &channel_id, &reward, &transaction) {
            Ok(script) => script, Err(_) => return
        };
        let mut receipt = json!({"status":"pending","channel":channel,"reward":reward,"transaction":transaction,
            "username":state["username"],"before":before,"at":now_ms(),"message":"Resgate enviado; aguardando confirmação."});
        journal["accounts"][index] = receipt.clone();
        journal["channels"][index][&channel] = receipt.clone();
        if crate::social_store::save("twitch-redemptions", &journal).is_err() {
            state["redemption"] = json!({"status":"paused","message":"Falha ao registrar resgate; nenhum ponto foi gasto."}); return;
        }
        let response = crate::twitch_browser::evaluate(view, script).await.unwrap_or(Value::Null);
        let mut after = None;
        if crate::twitch_rewards::response_status(&response) == "accepted" {
            if let Ok(data) = query_gql(view, token, crate::twitch_browser::POINTS_CATALOG_QUERY, &json!({"login":channel})).await {
                after = data.pointer("/user/channel/self/communityPoints/balance").and_then(Value::as_u64);
            }
        }
        settle_redemption(&mut receipt, &response, after);
        if let Some(points) = after {
            state["balances"][&channel]["points"] = json!(points);
            state["balances"][&channel]["checkedAt"] = json!(now_ms());
        } else {
            state["balances"][&channel]["status"] = json!("stale");
        }
        journal["accounts"][index] = receipt.clone();
        journal["channels"][index][&channel] = receipt.clone();
        if crate::social_store::save("twitch-redemptions", &journal).is_err() {
            receipt["status"] = json!("paused");
            receipt["message"] = json!("Falha ao salvar a confirmação. Automático pausado; confira o histórico na Twitch.");
        }
        state["redemption"] = receipt;
    }

    pub async fn test_connection(username: String, token: String) -> Result<bool, String> {
        let clean = crate::social_store::slug(&username).ok_or("Usuário Twitch inválido")?;
        let clean_token = token.trim().trim_start_matches("oauth:").to_string();

        if clean_token.is_empty() {
            return Err("Para testar conexão informe um token OAuth Twitch.".into());
        }

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| e.to_string())?;

        let resp = client
            .get("https://id.twitch.tv/oauth2/validate")
            .header("Authorization", format!("OAuth {}", clean_token))
            .send()
            .await
            .map_err(|_| "Falha de rede ao conectar à Twitch.".to_string())?;

        if resp.status().as_u16() == 401 {
            return Err("Token Twitch inválido ou expirado.".into());
        }

        if !resp.status().is_success() {
            return Err(format!("Twitch respondeu HTTP {}.", resp.status().as_u16()));
        }

        let data: Value = resp.json().await.map_err(|_| "Resposta Twitch inválida.")?;
        let token_login = data["login"].as_str().unwrap_or("");

        if !clean.eq_ignore_ascii_case(token_login) {
            return Err(format!(
                "Token pertence a @{}, mas a conta configurada é @{}.",
                token_login, clean
            ));
        }

        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_cookie(token: &str) -> tauri::webview::Cookie<'static> {
        tauri::webview::Cookie::build(("auth-token", token.to_string()))
            .domain(".twitch.tv").path("/").secure(true).build()
    }

    #[tokio::test]
    async fn existing_game_session_is_reused_without_trying_other_sessions() {
        let mut calls = Vec::new();
        let result = matching_session("viewer", vec![fixture_cookie("game"), fixture_cookie("legacy")], |token| {
            calls.push(token);
            async { Ok(json!({"currentUser":{"id":"123","login":"Viewer"}})) }
        }).await.unwrap().unwrap();
        assert_eq!(result.0.value(), "game");
        assert_eq!(calls, vec!["game"]);
    }

    #[tokio::test]
    async fn only_the_matching_linked_identity_can_be_recovered() {
        let mut calls = Vec::new();
        let result = matching_session("viewer", vec![fixture_cookie("other"), fixture_cookie("expired"), fixture_cookie("saved")], |token| {
            calls.push(token.clone());
            async move {
                match token.as_str() {
                    "other" => Ok(json!({"currentUser":{"id":"789","login":"different"}})),
                    "expired" => Err(("login_required".into(), "expired".into())),
                    _ => Ok(json!({"currentUser":{"id":"123","login":"viewer"}})),
                }
            }
        }).await.unwrap().unwrap();
        assert_eq!(result.0.value(), "saved");
        assert_eq!(calls, vec!["other", "expired", "saved"]);
        let mismatch = matching_session("second", vec![fixture_cookie("saved")], |_| async {
            Ok(json!({"currentUser":{"id":"123","login":"viewer"}}))
        }).await.unwrap();
        assert!(mismatch.is_none());
    }

    #[tokio::test]
    async fn missing_identity_and_unrelated_cookies_cannot_be_migrated() {
        let unrelated = tauri::webview::Cookie::build(("auth-token", "unrelated"))
            .domain("twitch.tv.evil").build();
        let mut calls = 0;
        let selected = matching_session("viewer", vec![unrelated, fixture_cookie("missing"), fixture_cookie("missing")], |_| {
            calls += 1;
            async { Ok(json!({"currentUser":{"login":"viewer"}})) }
        }).await.unwrap();
        assert!(selected.is_none());
        assert_eq!(calls, 1);
        let missing_link = matching_session("", vec![fixture_cookie("saved")], |_| async {
            panic!("Unknown identity must not inspect a shared login");
        }).await.unwrap();
        assert!(missing_link.is_none());
    }

    #[tokio::test]
    async fn blocked_identity_check_does_not_claim_a_missing_login_or_try_more_accounts() {
        let mut calls = 0;
        let result = matching_session("viewer", vec![fixture_cookie("first"), fixture_cookie("second")], |_| {
            calls += 1;
            async { Err(("blocked".into(), "blocked".into())) }
        }).await;
        assert_eq!(result.unwrap_err().0, "blocked");
        assert_eq!(calls, 1);
        assert_eq!(gql_data(&json!({"status":200,"body":{"errors":[{"message":"Unauthenticated"}]}})).unwrap_err().0, "login_required");
    }

    #[test]
    fn redemption_requires_the_linked_verified_identity() {
        let config = json!({"accounts":[{"gameLinked":true,"linkedUsername":"viewer"}, {"gameLinked":false,"linkedUsername":"second"}]});
        assert!(redemption_identity_matches(&config, 0, "viewer"));
        assert!(!redemption_identity_matches(&config, 0, "another"));
        assert!(!redemption_identity_matches(&config, 1, "second"));
        assert!(!redemption_identity_matches(&config, 3, ""));
    }

    #[test]
    fn redemption_requires_success_and_an_observed_debit_without_fabricating_bonus_time() {
        let accepted = json!({"status":200,"body":{"data":{"redeemCommunityPointsCustomReward":{"error":null}}}});
        let original = json!({"status":"pending","before":350,"reward":{"cost":300}});
        for after in [None, Some(350), Some(0), Some(51)] {
            let mut receipt = original.clone();
            settle_redemption(&mut receipt, &accepted, after);
            assert_eq!(receipt["status"], "pending");
        }
        let mut receipt = original.clone();
        settle_redemption(&mut receipt, &accepted, Some(50));
        assert_eq!(receipt["status"], "confirmed");
        assert!(receipt.get("expiresAt").is_none());
        assert!(receipt.get("activeRedemption").is_none());
        settle_redemption(&mut receipt, &Value::Null, Some(50));
        assert_eq!(receipt["status"], "pending");
        settle_redemption(&mut receipt, &json!({"status":403}), None);
        assert_eq!(receipt["status"], "rejected");
    }

    #[test]
    fn trial_receipt_tells_user_when_an_api_pause_prevents_a_second_attempt() {
        let original = json!({"before":600,"reward":{"cost":500,"trialPaused":true}});
        let mut receipt = original.clone();
        settle_redemption(&mut receipt,&json!({"status":403}),None);
        assert_eq!(receipt["status"],"rejected");
        assert!(receipt["message"].as_str().unwrap().contains("Não haverá nova tentativa"));
        let mut receipt = original;
        settle_redemption(&mut receipt,&Value::Null,None);
        assert_eq!(receipt["status"],"pending");
        assert!(receipt["message"].as_str().unwrap().contains("Não será reenviada"));
    }

    #[test]
    fn points_require_an_observed_increase_and_errors_never_validate_data() {
        let first = observed_balance(&json!({}), 350, 1000);
        assert_eq!(first["earnedPoints"], 0);
        let next = observed_balance(&first, 400, 2000);
        assert_eq!(next["earnedPoints"], 50);
        assert_eq!(observed_balance(&next, 100, 3000)["earnedPoints"], 50);
        assert_eq!(
            observed_balance(&json!({"status":"stale","points":0}), 500, 4000)["earnedPoints"],
            0
        );
        assert!(gql_data(
            &json!({"status":200,"body":{"data":{},"errors":[{"message":"denied"}]}})
        )
        .is_err());
        assert_eq!(
            gql_data(&json!({"status":403,"body":{}})).unwrap_err().0,
            "blocked"
        );
        assert!(gql_data(&json!({"status":200,"body":{"data":null}})).is_err());
    }

    #[test]
    fn authoritative_redemption_id_confirms_even_when_points_arrive_concurrently() {
        let accepted = json!({"status":200,"body":{"data":{"redeemCommunityPointsCustomReward":{"error":null,"redemption":{"id":"confirmed-id"}}}}});
        let mut receipt = json!({"before":350,"reward":{"cost":300}});
        settle_redemption(&mut receipt,&accepted,Some(60));
        assert_eq!(receipt["status"],"confirmed");
        assert_eq!(receipt["redemptionId"],"confirmed-id");
        assert!(receipt.get("expiresAt").is_none());
        let rejected = json!({"status":200,"body":{"data":{"redeemCommunityPointsCustomReward":{"error":{"code":"PROPERTIES_MISMATCH"}}}}});
        settle_redemption(&mut receipt,&rejected,Some(350));
        assert_eq!(receipt["status"],"rejected");
        assert_eq!(receipt["errorCode"],"PROPERTIES_MISMATCH");
    }

    #[test]
    fn configuration_enforces_four_accounts_limit() {
        let conf = json!({
            "masterEnabled": true,
            "accounts": [
                {"username": "acc1", "enabled": true},
                {"username": "acc2", "enabled": false},
                {"username": "acc3", "enabled": true},
                {"username": "acc4", "enabled": true},
                {"username": "acc5", "enabled": true} // exceeds max 4
            ]
        });

        let parsed = parse_configs(&conf);
        assert_eq!(parsed.len(), 4);
        assert_eq!(parsed[0].username, "acc1");
        assert!(parsed[0].enabled);
        assert_eq!(parsed[1].username, "acc2");
        assert!(!parsed[1].enabled);
        assert_eq!(parsed[2].username, "acc3");
        assert_eq!(parsed[3].username, "acc4");
    }

    #[test]
    fn joined_channels_is_always_empty_and_status_is_waiting_watch() {
        let manager = TwitchServiceManager::new();
        let initial = tokio::runtime::Runtime::new()
            .unwrap()
            .block_on(manager.get_status());

        let accounts = initial["accounts"].as_array().unwrap();
        assert_eq!(accounts.len(), 4);
        for acc in accounts {
            assert_eq!(acc["status"], "disconnected");
            assert_eq!(acc["joinedChannels"], json!([]));
            assert_eq!(acc["channel"], "");
            assert_eq!(acc["lastError"], "");
        }
    }

    #[test]
    fn set_channels_supports_up_to_forty_for_inquiry() {
        let manager = TwitchServiceManager::new();
        let rt = tokio::runtime::Runtime::new().unwrap();
        let list: Vec<String> = (0..50).map(|i| format!("channel_{}", i)).collect();

        rt.block_on(manager.set_channels(vec![list, vec![], vec![], vec![]]));

        let channels = rt.block_on(manager.channels.read()).clone();
        assert_eq!(channels[0].len(), MAX_TWITCH_QUERY_CHANNELS);
        assert_eq!(channels[0].len(), 40);
    }

    #[test]
    fn sync_lives_normalizes_and_truncates() {
        let manager = TwitchServiceManager::new();
        let rt = tokio::runtime::Runtime::new().unwrap();

        let lives = vec![
            "Alpha".into(),
            "@alpha".into(),
            "#beta".into(),
            "gamma".into(),
            "invalid channel with spaces".into(),
        ];

        assert!(rt.block_on(manager.sync_lives(lives)));
        let stored = rt.block_on(manager.lives.read()).clone();
        assert_eq!(
            stored,
            vec!["alpha".to_string(), "beta".to_string(), "gamma".to_string()]
        );
    }

    #[test]
    fn test_connection_requires_token_and_rejects_empty() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        assert!(rt
            .block_on(TwitchServiceManager::test_connection(
                "validuser".into(),
                "".into()
            ))
            .is_err());
        assert!(rt
            .block_on(TwitchServiceManager::test_connection("".into(), "".into()))
            .is_err());
        assert!(rt
            .block_on(TwitchServiceManager::test_connection(
                "bad name with spaces".into(),
                "token".into()
            ))
            .is_err());
    }

    #[test]
    fn status_contract_has_required_fields_and_empty_joined_channels() {
        let manager = TwitchServiceManager::new();
        let rt = tokio::runtime::Runtime::new().unwrap();
        let st = rt.block_on(manager.get_status());

        assert!(st.get("masterEnabled").is_some());
        let accounts = st["accounts"].as_array().unwrap();
        assert_eq!(accounts.len(), 4);
        for acc in accounts {
            assert!(acc.get("status").is_some());
            assert!(acc.get("channel").is_some());
            assert!(acc.get("lastError").is_some());
            assert_eq!(acc["joinedChannels"], json!([]));
        }
    }

    #[test]
    fn points_contract_has_balances_and_redemption_field() {
        let manager = TwitchServiceManager::new();
        let rt = tokio::runtime::Runtime::new().unwrap();
        let pt = rt.block_on(manager.get_points());

        let accounts = pt["accounts"].as_array().unwrap();
        assert_eq!(accounts.len(), 4);
        for acc in accounts {
            assert_eq!(acc["status"], "disconnected");
            assert!(acc["balances"].is_object());
            assert_eq!(acc["refreshing"], false);
            assert!(acc.get("activeRedemption").is_some());
        }
    }

    #[test]
    fn pending_redemption_times_out_after_two_minutes() {
        let current = now_ms();
        let recent_pending = json!({"status": "pending", "at": current - 60_000});
        let elapsed_recent = current.saturating_sub(recent_pending["at"].as_u64().unwrap_or(0));
        assert!(recent_pending["status"] == "pending" && elapsed_recent < 120_000);

        let expired_pending = json!({"status": "pending", "at": current - 130_000});
        let elapsed_expired = current.saturating_sub(expired_pending["at"].as_u64().unwrap_or(0));
        assert!(!(expired_pending["status"] == "pending" && elapsed_expired < 120_000));
    }

    #[tokio::test]
    async fn roster_queries_remain_fair_with_many_online_and_offline_channels() {
        let channels: Vec<_> = (0..40).map(|n| format!("partner_{n:02}")).collect();
        let first = rotate_channels(&channels, 0);
        let scanned = query_roster(&first, Duration::from_millis(35), |channel| async move {
            tokio::time::sleep(Duration::from_millis(12)).await;
            Ok(json!({"name":channel}))
        }).await;
        assert!(scanned.len() >= TWITCH_QUERY_CONCURRENCY);
        assert!(scanned.len() < channels.len(), "bounded scan cannot stall redeem behind 40 channel queries");
        assert_eq!(scanned[0].0, "partner_00");
        let continued = rotate_channels(&channels, scanned.len());
        assert_eq!(continued[0], channels[scanned.len()]);

        let results = query_roster(&["offline".into(), "online".into(), "other_offline".into()],
            Duration::from_secs(1), |channel| async move {
                if channel == "online" { Err(("error".into(), "channel unavailable".into())) }
                else { Ok(json!({"channel":channel})) }
            }).await;
        assert_eq!(results.len(), 3);
        assert!(results[0].1.is_ok());
        assert!(results[1].1.is_err());
        assert!(results[2].1.is_ok());
    }

    #[test]
    fn rejected_channel_does_not_block_other_partner_with_points() {
        let now = 500_000;
        let balance = |points| json!({
            "status":"verified", "catalogStatus":"verified", "checkedAt":now - 1_000,
            "points": points, "channelId":"12345",
            "rewards":[{"key":"exp","available":true,"cost":300,"durationHours":1}]
        });
        let state = json!({"balances":{
            "offline_a":balance(450), "online_b":balance(300), "offline_c":balance(600)
        }});
        let mut journal = json!({"accounts":[
            {"channel":"offline_a", "status":"rejected", "at":now - 1_000},{},{},{}
        ]});
        migrate_redemption_history(&mut journal, 0);
        assert_eq!(redemption_candidate(&state, "exp", &journal, 0, now).unwrap().0, "offline_c");
        journal["channels"][0]["offline_c"] = json!({"status":"pending","at":now - 500});
        assert_eq!(redemption_candidate(&state, "exp", &journal, 0, now).unwrap().0, "online_b");
        journal["channels"][0]["offline_c"] = Value::Null;
        journal["accounts"][0] = json!({"channel":"offline_c","status":"confirmed","at":now - 60_000});
        assert_eq!(redemption_candidate(&state, "exp", &journal, 0, now).unwrap().0, "online_b", "alternate streamers receive their turn before returning to the first channel");
        assert!(redemption_on_cooldown(&journal["channels"][0]["offline_a"], now));
        assert!(!redemption_on_cooldown(&journal["channels"][0]["offline_a"], now + 301_000));
    }

    #[test]
    fn migration_preserves_legacy_pending_without_overwriting_newer_channel_history() {
        let mut journal = json!({"accounts":[
            {"channel":"offline_a","status":"pending","at":100},{},{},{}
        ], "channels":[{"offline_a":{"status":"confirmed","at":200}}, {}, {}, {}]});
        migrate_redemption_history(&mut journal, 0);
        assert_eq!(journal["channels"][0]["offline_a"]["status"], "confirmed");
        journal["accounts"][0] = json!({"channel":"offline_b","status":"pending","at":300});
        migrate_redemption_history(&mut journal, 0);
        assert_eq!(journal["channels"][0]["offline_b"]["status"], "pending");
    }

    #[test]
    fn paused_reward_trial_prefers_confirmed_options_and_never_repeats_uncertain_or_rejected_spend() {
        let now = 900_000u64;
        let reward_id = "147118bf-b3fb-4b34-8666-4d673fb1a5c1";
        let pending = json!({"key":"catch","id":reward_id,"cost":500,"available":false,"trialPaused":true});
        let mut state = json!({"balances":{
            "tftoddy":{"status":"verified","catalogStatus":"verified","checkedAt":now-1000,
                "points":900,"channelId":"123","rewards":[pending]},
            "zzactive":{"status":"verified","catalogStatus":"verified","checkedAt":now-1000,
                "points":550,"channelId":"456","rewards":[
                    {"key":"catch","id":"12345678-1234-1234-1234-123456789abc","cost":500,"available":true}
                ]}
        }});
        let mut journal = json!({"accounts":[{},{},{},{}], "channels":[{},{},{},{}]});
        assert_eq!(redemption_candidate(&state,"catch",&journal,0,now).unwrap().0,"zzactive");
        state["balances"].as_object_mut().unwrap().remove("zzactive");
        assert_eq!(redemption_candidate(&state,"catch",&journal,0,now).unwrap().0,"tftoddy");

        journal["channels"][0]["tftoddy"] = json!({"status":"rejected","at":now-600_000,
          "reward":{"id":reward_id}});
        assert!(redemption_candidate(&state,"catch",&journal,0,now).is_none(),
          "an API-rejected paused reward is never retried while its flag remains unchanged");
        journal["channels"][0]["tftoddy"]["status"] = json!("pending");
        assert!(redemption_candidate(&state,"catch",&journal,0,now).is_none(),
          "unknown outcome never triggers another paused trial");
        state["balances"]["tftoddy"]["rewards"][0]["trialPaused"] = json!(false);
        state["balances"]["tftoddy"]["rewards"][0]["available"] = json!(true);
        assert_eq!(redemption_candidate(&state,"catch",&journal,0,now).unwrap().0,"tftoddy",
          "a later authoritative available status can be considered normally after cooldown");
    }

    #[test]
    fn real_channel_catalog_does_not_spend_points_on_disabled_one_hour_capture() {
        let now = 900_000;
        let reward = |key: &str, cost: u64, available: bool| {
            json!({"key":key,"cost":cost,"available":available,"durationHours": if cost >= 1500 {3} else {1}})
        };
        // Observed catalogue: denissnidertv has the 500-point Capture reward
        // disabled, while its 1500-point Capture and 900-point EXP are enabled.
        let state = json!({"balances":{
            "denissnidertv":{
                "status":"verified","catalogStatus":"verified","checkedAt":now-500,
                "channelId":"123","points":1140,
                "rewards":[reward("catch",500,false),reward("catch",1500,true),reward("exp",900,true)]
            },
            "clovaobengala":{
                "status":"verified","catalogStatus":"verified","checkedAt":now-500,
                "channelId":"456","points":410,
                "rewards":[reward("catch",500,true),reward("exp",300,true)]
            }
        }});
        let journal = json!({"accounts":[{},{},{},{}],"channels":[{},{},{},{}]});
        assert!(redemption_candidate(&state,"catch",&journal,0,now).is_none());
        assert_eq!(redemption_candidate(&state,"all",&journal,0,now).unwrap().0,"clovaobengala");
        assert_eq!(redemption_candidate(&state,"exp",&journal,0,now).unwrap().0,"clovaobengala");
        let message = waiting_redemption_message(&state,"catch",now);
        assert!(message.contains("Captura"));
        assert!(message.contains("90 pts em @clovaobengala"));
        assert!(message.contains("2 canal(is) com outro buff"));
        assert!(message.contains("Qualquer buff"));
    }

    #[test]
    fn per_account_live_targets_follow_chosen_buff_and_game_live_status() {
        let now = 200_000;
        let cat = |key: &str, available: bool, trial: bool| json!({
            "catalogStatus":"verified","checkedAt":now-500,"status":"verified","points":0,
            "rewards":[{"key":key,"cost":match key { "exp" => 300, "lure" => 1000, _ => 500 },
                "available":available,"trialPaused":trial}]
        });
        let points = vec![
            json!({"balances":{
                "catchlive":cat("catch",true,false),
                "explive":cat("exp",true,false),
                "pausedlive":cat("catch",false,true),
                "disabled":cat("catch",false,false),
                "offline":cat("catch",true,false),
                "missing":{"status":"verified","points":2000},
                "longonly":{"catalogStatus":"verified","checkedAt":now-500,"status":"verified",
                    "points":1800,"rewards":[{"key":"catch","cost":1500,"available":true}]},
                "uncatalogued":cat("catch",true,false)
            }}),
            json!({"balances":{"catchlive":cat("catch",true,false),"explive":cat("exp",true,false)}}),
            json!({"balances":{"pausedlive":cat("catch",false,true),"explive":cat("exp",true,false)}}),
            json!({"balances":{"catchlive":cat("catch",true,false)}}),
        ];
        let official = vec![
            vec!["catchlive".into(),"disabled".into(),"explive".into(),"longonly".into(),"missing".into(),"offline".into(),"pausedlive".into()],
            vec!["catchlive".into(),"explive".into()],
            vec!["explive".into(),"pausedlive".into()],
            vec!["catchlive".into()]
        ];
        let online = vec!["catchlive".into(),"disabled".into(),"explive".into(),"missing".into(),
            "longonly".into(),"pausedlive".into(),"uncatalogued".into()];
        let mut config = json!({"masterEnabled":true,"accounts":[
            {"enabled":true,"claimPriority":"catch"},
            {"enabled":true,"claimPriority":"exp"},
            {"enabled":true,"claimPriority":"lure"},
            {"enabled":false,"claimPriority":"catch"}
        ]});
        let targets = account_live_targets(&config,&official,&online,&points,now);
        assert_eq!(targets[0],vec!["catchlive","pausedlive"],
            "offline, disabled, missing and non-official channels must not receive a connection");
        assert_eq!(targets[1],vec!["explive"]);
        assert!(targets[2].is_empty());
        assert!(targets[3].is_empty());

        config["accounts"][0]["claimPriority"] = json!("exp");
        config["accounts"][2]["claimPriority"] = json!("catch");
        let targets = account_live_targets(&config,&official,&online,&points,now);
        assert_eq!(targets[0],vec!["explive"]);
        assert_eq!(targets[1],vec!["explive"], "one account's change cannot alter another");
        assert_eq!(targets[2],vec!["pausedlive"]);

        config["accounts"][0]["claimPriority"] = json!("all");
        assert_eq!(account_live_targets(&config,&official,&online,&points,now)[0],
            vec!["catchlive","explive","pausedlive"]);
        assert!(account_live_targets(&config,&official,&online,&points,now+121_000)[0].is_empty(),
            "stale catalogs must disconnect previously selected lives");
        assert_eq!(rotate_channels(&targets[0],1),vec!["explive"]);
    }

    #[test]
    fn watch_rotation_covers_more_than_two_eligible_lives_without_selecting_others() {
        let eligible = vec!["one".to_string(),"two".to_string(),"three".to_string(),"four".to_string()];
        let first: Vec<_> = rotate_channels(&eligible,0).into_iter().take(MAX_TWITCH_WATCH_CHANNELS).collect();
        let second: Vec<_> = rotate_channels(&eligible,2).into_iter().take(MAX_TWITCH_WATCH_CHANNELS).collect();
        assert_eq!(first,vec!["one","two"]);
        assert_eq!(second,vec!["three","four"]);
    }
}
