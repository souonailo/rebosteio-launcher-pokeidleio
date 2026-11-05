use serde_json::{json, Value};
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
        receipt["message"] = json!("A Twitch recusou o resgate. Nova tentativa em 5 minutos.");
    } else if status == "accepted" && (redemption_id.is_some() || receipt["before"].as_u64().zip(receipt["reward"]["cost"].as_u64())
        .is_some_and(|(before, cost)| cost > 0 && after.is_some() && before.checked_sub(cost) == after)) {
        receipt["status"] = json!("confirmed");
        receipt["message"] = json!("Resgate confirmado na Twitch. O jogo confirma a aplicação do bônus.");
    } else {
        receipt["status"] = json!("pending");
        receipt["message"] = json!("Resgate sem confirmação. Automático pausado para evitar duplicação; confira o histórico na Twitch.");
    }
}

/// Limits concurrent watched channels per account according to Twitch platform limits (max 2).
pub const MAX_TWITCH_WATCH_CHANNELS: usize = 2;
/// Max official balance inquiry channels tracked per account.
pub const MAX_TWITCH_QUERY_CHANNELS: usize = 40;

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
    last_watch: Mutex<Vec<Option<Instant>>>,
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
            last_watch: Mutex::new(vec![None; 4]),
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
        names.truncate(20);

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
        let channels = self.channels.read().await[index].clone();
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
            tokio::time::timeout(Duration::from_secs(45), async {
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
                for channel in &channels {
                    if generation != self.revision.load(Ordering::SeqCst) {
                        return Ok(());
                    }
                    let data = query_gql(
                        &window,
                        &auth_token,
                        crate::twitch_browser::POINTS_CATALOG_QUERY,
                        &json!({"login":channel}),
                    )
                    .await?;
                    let value = data
                        .pointer("/user/channel/self/communityPoints/balance")
                        .and_then(Value::as_u64);
                    state["balances"][channel] = match value {
                        Some(points) => observed_balance(&previous[channel], points, now_ms()),
                        None => json!({"status":"unavailable","checkedAt":now_ms()}),
                    };
                    let rewards = data.pointer("/user/channel/communityPointsSettings/customRewards");
                    state["balances"][channel]["channelId"] = data["user"]["id"].clone();
                    state["balances"][channel]["catalogStatus"] = json!(if rewards.is_some_and(Value::is_array) { "verified" } else { "unavailable" });
                    state["balances"][channel]["rewards"] = json!(crate::twitch_rewards::catalog(rewards.unwrap_or(&Value::Null)));
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
                    for channel in channels
                        .iter()
                        .filter(|s| live_channels.contains(s))
                        .take(MAX_TWITCH_WATCH_CHANNELS)
                    {
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
        if previous["status"] == "pending" {
            state["redemption"] = json!({"status":"paused","message":"Resgate sem confirmação. Automático pausado para evitar duplicação; confira o histórico na Twitch."});
            return;
        }
        let elapsed = now_ms().saturating_sub(previous["at"].as_u64().unwrap_or(0));
        if (previous["status"] == "rejected" && elapsed < 300_000) || (previous["status"] == "confirmed" && elapsed < 55_000) {
            state["redemption"] = previous; return;
        }
        state["redemption"] = json!({"status":"waiting_points","message":"Automático ativo: aguardando saldo e recompensa disponíveis."});
        let priority = config["accounts"][index]["claimPriority"].as_str().or_else(||config["claimPriority"].as_str()).unwrap_or("exp");
        let candidate = state["balances"].as_object().into_iter().flatten().find_map(|(channel, balance)| {
            let reward = crate::twitch_rewards::eligible(balance, priority, now_ms())?;
            Some((channel.clone(), balance["channelId"].as_str()?.to_string(), reward.clone(), balance["points"].as_u64()?))
        });
        let Some((channel, channel_id, reward, before)) = candidate else { return; };
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
}
