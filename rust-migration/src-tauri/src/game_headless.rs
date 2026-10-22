use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{mpsc, RwLock};

use tokio_tungstenite::tungstenite::protocol::Message;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PokemonTeamMember {
    pub id: Option<serde_json::Value>,
    pub sid: Option<u32>,
    pub name: Option<String>,
    pub level: Option<u32>,
    pub shiny: Option<bool>,
    pub ld: Option<bool>,
    pub hp: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HeadlessMetrics {
    pub seconds: u64,
    #[serde(rename = "xpg")]
    pub xp: u64,
    pub xph: u64,
    pub gph: u64,
    pub kph: u64,
    pub shiny_cap: u32,
    pub shiny_found: u32,
    pub kills: u32,
    #[serde(rename = "ballsUsed")]
    pub balls: u32,
    pub captures: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeadlessState {
    #[serde(skip)]
    pub daily_pass: crate::daily_pass::DailyPass,
    #[serde(skip)]
    pub auto_depot: crate::auto_depot::AutoDepot,
    pub ok: bool,
    pub live: bool,
    pub i: usize,
    pub name: String,
    pub cid: String,
    pub hunt: String,
    pub in_center: Option<bool>,
    #[serde(skip)]
    pub last_hunt_slug: String,
    pub balls_known: bool,
    pub inventory_known: bool,
    pub ball_catalog: Vec<serde_json::Value>,
    pub automation: serde_json::Value,
    pub last_ball_id: Option<serde_json::Value>,
    pub ball_map: serde_json::Map<String, serde_json::Value>,
    pub inv_map: serde_json::Map<String, serde_json::Value>,
    #[serde(default)]
    pub raw_drops: serde_json::Map<String, serde_json::Value>,
    pub gold: i64,
    pub diamonds: i64,
    pub level: u32,
    pub active_id: Option<serde_json::Value>,
    pub team: Vec<PokemonTeamMember>,
    pub twitch: Option<serde_json::Value>,
    pub kick: Option<serde_json::Value>,
    pub a: HeadlessMetrics,
    pub sess_start: u64,
    #[serde(skip)]
    pub initial_gold: Option<i64>,
    #[serde(skip)]
    pub session_gold: i64,
    #[serde(skip)]
    pub start_time: Option<std::time::Instant>,
}

impl HeadlessState {
    pub fn new(index: usize, nick: String) -> Self {
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let cid = String::new();
        Self {
            daily_pass: Default::default(),
            auto_depot: Default::default(),
            ok: true,
            live: false,
            i: index,
            name: nick,
            cid,
            hunt: String::new(),
            in_center: None,
            last_hunt_slug: String::new(),
            balls_known: false,
            inventory_known: false,
            ball_catalog: Vec::new(),
            automation: json!({}),
            last_ball_id: None,
            ball_map: Default::default(),
            inv_map: Default::default(),
            raw_drops: Default::default(),
            gold: 0,
            diamonds: 0,
            level: 0,
            active_id: None,
            team: Vec::new(),
            twitch: None,
            kick: None,
            a: HeadlessMetrics::default(),
            sess_start: now_ms,
            initial_gold: None,
            session_gold: 0,
            start_time: Some(std::time::Instant::now()),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct BlasterConfig {
    pub token: Option<String>,
    pub nick: Option<String>,
    #[serde(alias = "wsUrl")]
    pub ws_url: Option<String>,
    pub hunt: Option<String>,
}

pub struct BlasterHandle {
    stop_tx: mpsc::Sender<()>,
    out_tx: mpsc::Sender<Message>,
    task: tokio::task::JoinHandle<()>,
}

#[derive(Default)]
pub struct GameHeadlessManager {
    pub auth_locks: [tokio::sync::Mutex<()>; 4],
    clients: RwLock<HashMap<usize, BlasterHandle>>,
    tokens: RwLock<HashMap<usize, String>>,
    nicks: RwLock<HashMap<usize, String>>,
    states: RwLock<HashMap<usize, HeadlessState>>,
    ws_urls: RwLock<HashMap<usize,String>>,
}

impl GameHeadlessManager {
    pub fn new() -> Self {
        let sessions = crate::credentials::load_sessions();
        Self {
            auth_locks: std::array::from_fn(|_| tokio::sync::Mutex::new(())),
            clients: RwLock::new(HashMap::new()),
            tokens: RwLock::new(sessions.iter().map(|(i,s)| (*i, s.token.clone())).collect()),
            nicks: RwLock::new(sessions.iter().filter_map(|(i,s)| s.nick.clone().map(|n| (*i,n))).collect()),
            states: RwLock::new(HashMap::new()),
            ws_urls: RwLock::new(HashMap::new()),
        }
    }

    pub async fn set_token(&self, index: usize, token: String, nick: Option<String>) {
        let (token, nick) = normalize_session_token(token, nick);
        if !token.is_empty() {
            let mut tokens = self.tokens.write().await;
            tokens.insert(index, token.clone());
        }
        if let Some(n) = nick {
            if !n.is_empty() {
                let mut nicks = self.nicks.write().await;
                nicks.insert(index, n);
            }
        }
        if !token.is_empty() {
            let nick = self.get_nick(index).await;
            let _ = crate::credentials::save_session(index, token, nick);
        }
    }

    pub async fn get_token(&self, index: usize) -> Option<String> {
        let tokens = self.tokens.read().await;
        tokens.get(&index).cloned()
    }

    pub async fn get_ws_url(&self,index:usize)->Option<String>{self.ws_urls.read().await.get(&index).cloned()}

    pub async fn get_nick(&self, index: usize) -> Option<String> {
        let nicks = self.nicks.read().await;
        nicks.get(&index).cloned()
    }

    pub async fn update_telemetry_event(
        &self,
        app: &AppHandle,
        index: usize,
        event: &serde_json::Value,
    ) {
        let t = event.get("t").and_then(|v| v.as_str()).unwrap_or("");
        let data = event.get("data").unwrap_or(event);

        if t == "session_token" {
            if let Some(token) = data.get("token").and_then(|v| v.as_str()) {
                let nick = data.get("nick").and_then(|v| v.as_str()).map(|s| s.to_string());
                self.set_token(index, token.to_string(), nick.clone()).await;
                let _ = app.emit(
                    "session:token",
                    serde_json::json!({
                        "index": index,
                        "token": token,
                        "nick": nick
                    }),
                );
            }
            return;
        }

        let mut states = self.states.write().await;
        let nick = self
            .get_nick(index)
            .await
            .unwrap_or_else(|| format!("Conta {}", index + 1));
        let state = states
            .entry(index)
            .or_insert_with(|| HeadlessState::new(index, nick));

        if parse_game_message(event, state) {
            if state.start_time.is_none() {
                state.start_time = Some(std::time::Instant::now());
            }
            if let Some(st) = state.start_time {
                state.a.seconds = st.elapsed().as_secs();
                if state.a.seconds > 0 {
                    state.a.xph = (state.a.xp * 3600) / state.a.seconds;
                    state.a.kph = (state.a.kills as u64 * 3600) / state.a.seconds;
                    state.a.gph = (state.session_gold.max(0) as u64 * 3600) / state.a.seconds;
                }
            }

            let state_val = serde_json::to_value(&*state).unwrap_or_default();
            let _ = app.emit(
                "st:push",
                json!({
                    "index": index,
                    "state": state_val
                }),
            );

        }
    }

    pub async fn stop(&self, index: usize) -> bool {
        let mut map = self.clients.write().await;
        if let Some(handle) = map.remove(&index) {
            let _ = handle.stop_tx.send(()).await;
            let _ = handle.task.await;
            true
        } else {
            false
        }
    }

    pub async fn is_running(&self, index: usize) -> bool {
        let map = self.clients.read().await;
        map.get(&index).map(|h| !h.task.is_finished()).unwrap_or(false)
    }

    pub async fn send_message(&self, index: usize, val: serde_json::Value) -> Result<bool, String> {
        let map = self.clients.read().await;
        if let Some(handle) = map.get(&index) {
            let msg = Message::Text(val.to_string().into());
            handle.out_tx.send(msg).await.map_err(|e| e.to_string())?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub async fn start(
        &self,
        app: AppHandle,
        index: usize,
        config: BlasterConfig,
    ) -> Result<(), String> {
        self.stop(index).await;

        let (stop_tx, mut stop_rx) = mpsc::channel(1);
        let (out_tx, mut out_rx) = mpsc::channel::<Message>(32);
        let ws_url = config
            .ws_url
            .unwrap_or_else(|| "wss://pokeidle.io/ws".to_string());

        self.ws_urls.write().await.insert(index, ws_url.clone());
        let mut token = config.token.filter(|t| !t.is_empty()).or_else(|| None);

        if token.is_none() {
            token = self.get_token(index).await;
        }

        let token = token.ok_or_else(|| "token_required".to_string())?;

        let nick = self
            .get_nick(index)
            .await
            .or(config.nick.filter(|n| !n.is_empty()))
            .ok_or("Nick autenticado indisponivel")?;

        let mut state = self
            .states
            .read()
            .await
            .get(&index)
            .cloned()
            .unwrap_or_else(|| HeadlessState::new(index, nick.clone()));

        let target_hunt = config
            .hunt
            .clone()
            .filter(|s| !s.is_empty())
            .or_else(|| {
                if !state.hunt.is_empty() && state.hunt != "centro" {
                    Some(state.hunt.clone())
                } else if !state.last_hunt_slug.is_empty() && state.last_hunt_slug != "centro" {
                    Some(state.last_hunt_slug.clone())
                } else {
                    None
                }
            });

        let _ = app.emit("blaster:status", json!({"index":index,"status":"connecting"}));
        let socket = connect_and_handshake(
            index,
            &ws_url,
            &nick,
            &token,
            &mut state,
            target_hunt.as_deref(),
        )
        .await?;
        let _ = app.emit("blaster:status", json!({"index":index,"status":"connected"}));

        let app_handle = app.clone();
        let ws_url_clone = ws_url.clone();
        let nick_clone = nick.clone();
        let initial_hunt = target_hunt.clone();

        let task = tokio::spawn(async move {
            let mut current_socket = Some(socket);
            let start_time = state.start_time.unwrap_or_else(Instant::now);
            let mut backoff_secs = 2u64;

            'reconnect_loop: loop {
                let socket = match current_socket.take() {
                    Some(s) => s,
                    None => {
                        let _ = app_handle.emit(
                            "blaster:status",
                            json!({ "index": index, "status": "connecting" }),
                        );

                        tokio::select! {
                            _ = stop_rx.recv() => {
                                break 'reconnect_loop;
                            }
                            _ = tokio::time::sleep(Duration::from_secs(backoff_secs)) => {}
                        }

                        let manager_opt = app_handle.try_state::<std::sync::Arc<GameHeadlessManager>>();
                        let token_to_use = if let Some(ref m) = manager_opt {
                            m.get_token(index).await
                        } else {
                            None
                        };
                        let token_to_use = match token_to_use {
                            Some(t) if !t.is_empty() => t,
                            _ => {
                                backoff_secs = (backoff_secs * 2).min(30);
                                continue 'reconnect_loop;
                            }
                        };

                        let nick_to_use = if let Some(ref m) = manager_opt {
                            m.get_nick(index).await.unwrap_or_else(|| nick_clone.clone())
                        } else {
                            nick_clone.clone()
                        };

                        let hunt_to_resume = if !state.hunt.is_empty() && state.hunt != "centro" {
                            Some(state.hunt.clone())
                        } else if !state.last_hunt_slug.is_empty() && state.last_hunt_slug != "centro" {
                            Some(state.last_hunt_slug.clone())
                        } else {
                            initial_hunt.clone()
                        };

                        match connect_and_handshake(
                            index,
                            &ws_url_clone,
                            &nick_to_use,
                            &token_to_use,
                            &mut state,
                            hunt_to_resume.as_deref(),
                        )
                        .await
                        {
                            Ok(new_socket) => {
                                backoff_secs = 2;
                                state.live = true;
                                if let Some(ref m) = manager_opt {
                                    m.states.write().await.insert(index, state.clone());
                                }
                                let _ = app_handle.emit(
                                    "blaster:status",
                                    json!({ "index": index, "status": "connected" }),
                                );
                                let _ = app_handle.emit(
                                    "blaster:update",
                                    json!({ "index": index, "state": &state }),
                                );
                                new_socket
                            }
                            Err(_) => {
                                backoff_secs = (backoff_secs * 2).min(30);
                                continue 'reconnect_loop;
                            }
                        }
                    }
                };

                let (mut write, mut read) = socket.split();
                let mut ping_interval = tokio::time::interval(Duration::from_secs(25));
                let mut sec_interval = tokio::time::interval(Duration::from_secs(1));
                let mut last_activity = Instant::now();
                let mut user_stopped = false;

                loop {
                    tokio::select! {
                        _ = stop_rx.recv() => {
                            let _ = write.send(Message::Close(None)).await;
                            user_stopped = true;
                            break;
                        }
                        Some(outgoing) = out_rx.recv() => {
                            if write.send(outgoing).await.is_err() {
                                break;
                            }
                        }
                        _ = ping_interval.tick() => {
                            let ping = json!({ "t": "ping" });
                            if write.send(Message::Text(ping.to_string().into())).await.is_err() {
                                break;
                            }
                            if last_activity.elapsed() > Duration::from_secs(60) {
                                break;
                            }
                        }
                        _ = sec_interval.tick() => {
                            if let Ok(Some(command)) = state.auto_depot.next_command(crate::auto_depot::now_ms()) {
                                if write.send(Message::Text(command.to_string().into())).await.is_err() { break; }
                            }
                            if let Some(command) = state.daily_pass.command(crate::daily_pass::now_ms()) {
                                if write.send(Message::Text(command.to_string().into())).await.is_err() { break; }
                            }
                            state.a.seconds = start_time.elapsed().as_secs();
                            if state.a.seconds > 0 {
                                state.a.xph = (state.a.xp * 3600) / state.a.seconds;
                                state.a.kph = (state.a.kills as u64 * 3600) / state.a.seconds;
                                state.a.gph = (state.session_gold.max(0) as u64 * 3600) / state.a.seconds;
                            }
                            let _ = app_handle.emit("blaster:update", json!({
                                "index": index,
                                "state": &state
                            }));
                        }
                        msg = read.next() => {
                            match msg {
                                Some(Ok(Message::Text(txt))) => {
                                    last_activity = Instant::now();
                                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&txt) {
                                        if parse_game_message(&val, &mut state) {
                                            let _ = app_handle.emit("blaster:update", json!({
                                                "index": index,
                                                "state": &state
                                            }));
                                        }
                                    }
                                }
                                Some(Ok(Message::Ping(data))) => {
                                    last_activity = Instant::now();
                                    let _ = write.send(Message::Pong(data)).await;
                                }
                                Some(Ok(Message::Pong(_))) => {
                                    last_activity = Instant::now();
                                }
                                Some(Ok(Message::Close(_))) | None => {
                                    break;
                                }
                                Some(Err(_)) => {
                                    break;
                                }
                                _ => {}
                            }
                        }
                    }
                }

                if user_stopped {
                    break 'reconnect_loop;
                }

                state.live = false;
                if let Some(m) = app_handle.try_state::<std::sync::Arc<GameHeadlessManager>>() {
                    m.states.write().await.insert(index, state.clone());
                }
                let _ = app_handle.emit("blaster:update", json!({ "index": index, "state": &state }));
                let _ = app_handle.emit(
                    "blaster:status",
                    json!({
                        "index": index,
                        "status": "connecting"
                    }),
                );
            }

            parse_game_message(&json!({"t":"disconnected"}), &mut state);
            if let Some(m) = app_handle.try_state::<std::sync::Arc<GameHeadlessManager>>() {
                m.states.write().await.insert(index, state.clone());
            }
            let _ = app_handle.emit("blaster:update", json!({ "index": index, "state": state }));
            let _ = app_handle.emit(
                "blaster:status",
                json!({
                    "index": index,
                    "status": "disconnected"
                }),
            );
        });

        let mut map = self.clients.write().await;
        map.insert(index, BlasterHandle { stop_tx, out_tx, task });
        Ok(())
    }
}

async fn connect_and_handshake(
    index: usize,
    ws_url: &str,
    nick: &str,
    token: &str,
    state: &mut HeadlessState,
    hunt_slug: Option<&str>,
) -> Result<tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>, String> {
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;
    let mut request = ws_url.into_client_request().map_err(|e| e.to_string())?;
    request.headers_mut().insert("Origin", "https://pokeidle.io".parse().unwrap());
    request.headers_mut().insert("User-Agent", crate::webview_manager::CHROME_USER_AGENT.parse().unwrap());

    let (mut socket, _) = tokio::time::timeout(
        Duration::from_secs(20),
        crate::account_proxy::websocket_request(index, request),
    )
    .await
    .map_err(|_| "Tempo limite de conexao ao servidor".to_string())?
    .map_err(|e| e.to_string())?;

    socket
        .send(Message::Text(
            json!({"t":"hello","nick":nick,"token":token,"delta":1})
                .to_string()
                .into(),
        ))
        .await
        .map_err(|e| e.to_string())?;

    tokio::time::timeout(Duration::from_secs(20), async {
        while let Some(message) = socket.next().await {
            match message.map_err(|e| e.to_string())? {
                Message::Text(text) => {
                    let value: serde_json::Value =
                        serde_json::from_str(&text).map_err(|e| e.to_string())?;
                    if value["t"] == "erro" {
                        return Err(format!(
                            "Sessao headless recusada: {}",
                            value["msg"]
                                .as_str()
                                .or(value["chave"].as_str())
                                .unwrap_or("erro de autenticacao")
                        ));
                    }
                    if value["t"] == "welcome" {
                        parse_game_message(&value, state);
                        return Ok(());
                    }
                }
                Message::Close(_) => return Err("Servidor encerrou a conexao".into()),
                _ => {}
            }
        }
        Err("Conexao encerrada antes de autenticar".into())
    })
    .await
    .map_err(|_| "Servidor nao confirmou a sessao headless".to_string())??;

    let _ = socket
        .send(Message::Text(
            json!({"t":"client.visibility","foreground":true})
                .to_string()
                .into(),
        ))
        .await;

    if let Some(hunt) = hunt_slug.filter(|s| !s.is_empty()) {
        let _ = socket
            .send(Message::Text(
                json!({"t":"hunt.select","slug":hunt})
                    .to_string()
                    .into(),
            ))
            .await;
    }

    Ok(socket)
}

fn normalize_session_token(token: String, nick: Option<String>) -> (String, Option<String>) {
        // The game stores sessao as {nick, token, ...}, not as the token itself.
    match serde_json::from_str::<serde_json::Value>(&token) {
            Ok(value) if value.is_object() => (
                value.get("token").and_then(|v| v.as_str()).unwrap_or("").to_owned(),
                value.get("nick").and_then(|v| v.as_str()).map(str::to_owned).or(nick)
            ),
            _ => (token, nick),
    }
}

fn update_player_location(player: &serde_json::Value, state: &mut HeadlessState) -> bool {
    let slug = player.get("huntSlug").and_then(|v| v.as_str()).filter(|s| !s.is_empty());
    let center = player.get("noCentro").and_then(|v| v.as_bool());
    if slug.is_none() && center.is_none() { return false; }
    if let Some(slug) = slug {
        if slug != "centro" { state.last_hunt_slug = slug.into(); }
    }
    if let Some(center) = center { state.in_center = Some(center); }
    if state.in_center == Some(true) { state.hunt = "centro".into(); }
    else if !state.last_hunt_slug.is_empty() { state.hunt = state.last_hunt_slug.clone(); }
    else if let Some(slug) = slug { state.hunt = slug.into(); }
    true
}

fn parse_game_message(m: &serde_json::Value, state: &mut HeadlessState) -> bool {
    state.auto_depot.observe(m);
    state.daily_pass.observe(m, crate::daily_pass::now_ms());
    let t = m.get("t").and_then(|v| v.as_str()).unwrap_or("");
    let msg_type = m.get("type").and_then(|v| v.as_str()).unwrap_or("");
    let mut changed = false;

    let data = m.get("data").unwrap_or(m);

    if t == "reset" || t == "disconnected" || t == "telemetry_gap" {
        state.live = false;
        state.balls_known = false; state.inventory_known = false;
        state.ball_map.clear(); state.inv_map.clear(); state.raw_drops.clear(); state.ball_catalog.clear();
        state.automation = json!({}); state.last_ball_id = None;
        state.twitch = None; state.kick = None;
        return true;
    }

    if t == "welcome" || t == "estado" {
        let player = data.get("estado").unwrap_or(data);
        if t == "welcome" { state.twitch = None; state.kick = None; }
        let full = t == "welcome" || player.get("cheio").and_then(|v| v.as_bool()) == Some(true);
        if full {
            changed = true;
            state.cid.clear();
            state.ball_map.clear(); state.inv_map.clear(); state.raw_drops.clear();
            state.balls_known = false; state.inventory_known = false;
            state.automation = json!({}); state.last_ball_id = None;
            if t == "welcome" { state.ball_catalog.clear(); }
        }
        if let Some(id) = player.get("id") {
            state.cid = id.as_str().map(str::to_owned).or_else(||id.as_u64().map(|n|n.to_string())).unwrap_or_default();
            changed = true;
        }
        for (keys, target, known) in [
            (["balls", "balls"], &mut state.ball_map, &mut state.balls_known),
            (["items", "inventory"], &mut state.inv_map, &mut state.inventory_known),
        ] {
            if let Some(stock) = keys.iter().find_map(|key| player.get(*key)) {
                // Match idleio-core: a supplied map replaces the complete stock.
                target.clear();
                *known = stock.is_object() || stock.is_null();
                if let Some(map) = stock.as_object() { target.extend(map.clone()); }
                changed = true;
            }
        }
        if let Some(auto) = player.get("automation") {
            if auto.is_null() { state.automation = json!({}); }
            else if let Some(fields) = auto.as_object() {
                for (key, value) in fields { state.automation[key] = value.clone(); }
            }
            changed = true;
        }
        if let Some(catalog) = data.get("catalogoBolas").and_then(|v| v.as_array()) {
            state.ball_catalog = catalog.clone(); changed = true;
        }

        for (key, target) in [("twitch", &mut state.twitch), ("kick", &mut state.kick)] {
            let value = player.get(key)
                .or_else(|| data.get(key))
                .or_else(|| m.get(key))
                .or_else(|| data.get("estado").and_then(|e| e.get(key)))
                .or_else(|| m.get("estado").and_then(|e| e.get(key)));
            if let Some(value) = value {
                if value.is_null() { *target = None; }
                else if value.is_object() {
                    let mut clean = target.clone().unwrap_or_else(||json!({}));
                    for name in ["login","vinculado","assistindo","pctAtual","emLives","pontos","pontosPorCanal","bonusExp","bonusCatch","bonusLure","bonusTime","bonusQty","bonusExpiresAt","tempo","time","expires","lives","oficiais","offline","assistindoEm","bonus","pct"] {
                        if let Some(field) = value.get(name) { clean[name] = field.clone(); }
                    }
                    *target = Some(clean);
                }
                changed = true;
            }
        }
    }
    if t == "welcome" {
        state.live = true;
        if let Some(est) = data.get("estado").or_else(|| m.get("estado")) {
            if let Some(nick) = est.get("nick").or_else(|| est.get("nome")).and_then(|v| v.as_str()) {
                state.name = nick.to_string();
            }
            if let Some(gold) = est.get("gold").and_then(|v| v.as_i64()) {
                state.gold = gold;
                if state.initial_gold.is_none() {
                    state.initial_gold = Some(gold);
                }
            }
            if let Some(diamonds) = est.get("diamonds").or_else(|| est.get("diamantes")).or_else(|| est.get("gems")).or_else(|| est.get("gemas")).and_then(|v| v.as_i64()) {
                state.diamonds = diamonds;
            }
            if let Some(lvl) = est.get("level").or_else(|| est.get("trainerLevel")).and_then(|v| v.as_u64()) {
                state.level = lvl as u32;
            }
            update_player_location(est, state);
            if let Some(act) = est.get("activeId").or_else(|| est.get("activePokemonId")) {
                state.active_id = Some(act.clone());
            }

            let pokes = est
                .get("pokemons")
                .or_else(|| est.get("pkMud"))
                .or_else(|| est.get("eu").and_then(|eu| eu.get("pokemons")));
            if let Some(pokemons) = pokes.and_then(|v| v.as_array()) {
                state.team = pokemons
                    .iter()
                    .map(|pk| {
                        let is_active = state.active_id.as_ref().map(|act| act == pk.get("id").unwrap_or(&serde_json::Value::Null)).unwrap_or(false);
                        PokemonTeamMember {
                            id: pk.get("id").cloned(),
                            sid: pk
                                .get("speciesId")
                                .or_else(|| pk.get("pokeId"))
                                .or_else(|| pk.get("sid"))
                                .and_then(|v| v.as_u64())
                                .map(|v| v as u32),
                            name: pk
                                .get("nome")
                                .or_else(|| pk.get("name"))
                                .and_then(|v| v.as_str())
                                .map(|v| v.to_string()),
                            level: pk.get("level").or_else(|| pk.get("nv")).and_then(|v| v.as_u64()).map(|v| v as u32),
                            shiny: pk.get("shiny").and_then(|v| v.as_bool()),
                            ld: pk.get("slot").and_then(|v| v.as_u64()).map(|s| s == 0).or(Some(is_active)),
                            hp: None,
                        }
                    })
                    .collect();
            }
            changed = true;
        }
    } else if t == "campo" || t == "campo.init" || msg_type == "field-init" {
        if let Some(slug) = data.get("slug").or_else(|| m.get("slug")).and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
            state.in_center = Some(data.get("centro").and_then(|v| v.as_bool()).unwrap_or(slug == "centro"));
            if state.in_center == Some(true) { state.hunt = "centro".into(); }
            else { state.hunt = slug.into(); state.last_hunt_slug = slug.into(); }
            changed = true;
        }
    } else if t == "batalha" {
        if let Some(evs) = data.get("ev").or_else(|| m.get("ev")).and_then(|v| v.as_array()) {
            for ev in evs {
                let k = ev.get("k").or_else(|| ev.get("t")).and_then(|v| v.as_str()).unwrap_or("");
                if k == "spawn" && ev.get("shiny").and_then(|v| v.as_bool()).unwrap_or(false) {
                    state.a.shiny_found += 1;
                    changed = true;
                } else if k == "morte"
                    && ev.get("quem").and_then(|v| v.as_str()).unwrap_or("") == "selvagem"
                {
                    state.a.kills += 1;
                    let xp = ev
                        .get("xp")
                        .or_else(|| ev.get("xpTreinador"))
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    state.a.xp += xp;
                    if let Some(ouro) = ev.get("ouro").or_else(|| ev.get("gold")).and_then(|v| v.as_i64()) {
                        state.session_gold += ouro;
                    }
                    if let Some(drops) = ev.get("drops").or_else(|| ev.get("loot")).and_then(|v| v.as_array()) {
                        for drop_item in drops {
                            let item_id = drop_item
                                .get("itemId")
                                .or_else(|| drop_item.get("id"))
                                .and_then(|v| v.as_u64())
                                .map(|n| n.to_string());
                            let qty = drop_item
                                .get("qtd")
                                .or_else(|| drop_item.get("qty"))
                                .and_then(|v| v.as_u64())
                                .unwrap_or(1);
                            let name = drop_item
                                .get("nome")
                                .or_else(|| drop_item.get("name"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("");
                            let drop_key = item_id.clone().unwrap_or_else(|| name.to_string());
                            if !drop_key.is_empty() {
                                let current_drop = state
                                    .raw_drops
                                    .get(&drop_key)
                                    .and_then(|v| v.get("qty").and_then(|q| q.as_u64()).or_else(|| v.as_u64()))
                                    .unwrap_or(0);
                                state.raw_drops.insert(
                                    drop_key,
                                    json!({
                                        "id": item_id.as_deref().unwrap_or(""),
                                        "name": name,
                                        "qty": current_drop + qty
                                    }),
                                );
                            }
                            if let Some(id_str) = item_id {
                                let current_inv = state
                                    .inv_map
                                    .get(&id_str)
                                    .and_then(|v| v.as_u64())
                                    .unwrap_or(0);
                                state
                                    .inv_map
                                    .insert(id_str, serde_json::Value::from(current_inv + qty));
                            }
                        }
                    }
                    changed = true;
                } else if k == "bossMorto" {
                    let xp = ev
                        .get("xp")
                        .or_else(|| ev.get("xpTreinador"))
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    state.a.xp += xp;
                    if let Some(drops) = ev.get("drops").or_else(|| ev.get("loot")).and_then(|v| v.as_array()) {
                        for drop_item in drops {
                            let item_id = drop_item
                                .get("itemId")
                                .or_else(|| drop_item.get("id"))
                                .and_then(|v| v.as_u64())
                                .map(|n| n.to_string());
                            let qty = drop_item
                                .get("qtd")
                                .or_else(|| drop_item.get("qty"))
                                .and_then(|v| v.as_u64())
                                .unwrap_or(1);
                            let name = drop_item
                                .get("nome")
                                .or_else(|| drop_item.get("name"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("");
                            let drop_key = item_id.clone().unwrap_or_else(|| name.to_string());
                            if !drop_key.is_empty() {
                                let current_drop = state
                                    .raw_drops
                                    .get(&drop_key)
                                    .and_then(|v| v.get("qty").and_then(|q| q.as_u64()).or_else(|| v.as_u64()))
                                    .unwrap_or(0);
                                state.raw_drops.insert(
                                    drop_key,
                                    json!({
                                        "id": item_id.as_deref().unwrap_or(""),
                                        "name": name,
                                        "qty": current_drop + qty
                                    }),
                                );
                            }
                            if let Some(id_str) = item_id {
                                let current_inv = state
                                    .inv_map
                                    .get(&id_str)
                                    .and_then(|v| v.as_u64())
                                    .unwrap_or(0);
                                state
                                    .inv_map
                                    .insert(id_str, serde_json::Value::from(current_inv + qty));
                            }
                        }
                    }
                    changed = true;
                } else if k == "bola" {
                    state.a.balls += 1;
                    if let Some(id) = ev.get("ballId") { state.last_ball_id = Some(id.clone()); }
                    changed = true;
                } else if k == "capturado" {
                    state.a.captures += 1;
                    if ev
                        .get("pokemon")
                        .and_then(|p| p.get("shiny"))
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false)
                    {
                        state.a.shiny_cap += 1;
                    }
                    changed = true;
                }
            }
        }
    } else if t == "estado" {
        let est = data.get("estado").unwrap_or(data);
        if let Some(active) = est.get("activeId").or_else(|| est.get("activePokemonId")) {
            state.active_id = Some(active.clone());
            for member in &mut state.team { member.ld = Some(member.id.as_ref() == Some(active)); }
            changed = true;
        }
        if let Some(nick) = est.get("nick").or_else(|| est.get("nome")).and_then(|v| v.as_str()) {
            state.name = nick.to_string();
        }
        if let Some(gold) = est.get("gold").and_then(|v| v.as_i64()) {
            state.gold = gold;
            if let Some(init) = state.initial_gold {
                let diff = gold - init;
                if diff > state.session_gold {
                    state.session_gold = diff;
                }
            } else {
                state.initial_gold = Some(gold);
            }
            changed = true;
        }
        if let Some(diamonds) = est.get("diamonds").or_else(|| est.get("diamantes")).or_else(|| est.get("gems")).or_else(|| est.get("gemas")).and_then(|v| v.as_i64()) {
            state.diamonds = diamonds;
            changed = true;
        }
        if let Some(lvl) = est.get("level").or_else(|| est.get("trainerLevel")).and_then(|v| v.as_u64()) {
            state.level = lvl as u32;
            changed = true;
        }
        changed |= update_player_location(est, state);

        if let Some(pokemons) = est.get("pokemons").and_then(|v| v.as_array()) {
            state.team = pokemons
                .iter()
                .map(|pk| PokemonTeamMember {
                    id: pk.get("id").cloned(),
                    sid: pk
                        .get("speciesId")
                        .or_else(|| pk.get("pokeId"))
                        .or_else(|| pk.get("sid"))
                        .and_then(|v| v.as_u64())
                        .map(|v| v as u32),
                    name: pk
                        .get("nome")
                        .or_else(|| pk.get("name"))
                        .and_then(|v| v.as_str())
                        .map(|v| v.to_string()),
                    level: pk.get("level").or_else(|| pk.get("nv")).and_then(|v| v.as_u64()).map(|v| v as u32),
                    shiny: pk.get("shiny").and_then(|v| v.as_bool()),
                    ld: Some(state.active_id.as_ref() == pk.get("id")),
                    hp: None,
                })
                .collect();
            changed = true;
        }
        if let Some(pk_mud) = est.get("pkMud").and_then(|v| v.as_array()) {
            for pk in pk_mud {
                if let Some(pk_obj) = pk.as_object() {
                    let id = pk_obj.get("id");
                    if let Some(member) = state.team.iter_mut().find(|m| m.id.as_ref() == id) {
                        if let Some(lvl) = pk_obj.get("level").and_then(|v| v.as_u64()) {
                            member.level = Some(lvl as u32);
                        }
                        if let Some(sid) = pk_obj.get("speciesId").or_else(|| pk_obj.get("pokeId")).and_then(|v| v.as_u64()) {
                            member.sid = Some(sid as u32);
                        }
                        changed = true;
                    }
                }
            }
        }
    } else if t == "activity" {
        let kind = data.get("kind").and_then(|v| v.as_str()).unwrap_or("");
        if kind == "capture" {
            state.a.captures += 1;
            if data.get("shiny").and_then(|v| v.as_bool()).unwrap_or(false) {
                state.a.shiny_cap += 1;
            }
            changed = true;
        } else if kind == "battle" {
            state.a.kills += 1;
            if let Some(xp) = data.get("xp").and_then(|v| v.as_u64()) {
                state.a.xp += xp;
            }
            if let Some(gold) = data.get("gold").and_then(|v| v.as_i64()) {
                state.session_gold += gold;
            }
            changed = true;
        }
    }

    changed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn social_snapshots_survive_deltas_and_clear_on_disconnect() {
        let mut state = HeadlessState::new(0, "Fixture".into());
        parse_game_message(&json!({"t":"welcome","data":{"estado":{"twitch":{"login":"fixture","assistindo":true,"pctAtual":20,"token":"must-not-cross"},"kick":{"login":"fixture","pontos":123,"bonusExp":1}}}}), &mut state);
        assert_eq!(state.twitch.as_ref().unwrap()["pctAtual"],20);
        assert!(state.twitch.as_ref().unwrap().get("token").is_none());
        parse_game_message(&json!({"t":"estado","data":{"gold":12}}), &mut state);
        assert_eq!(state.kick.as_ref().unwrap()["pontos"],123);
        parse_game_message(&json!({"t":"estado","data":{"twitch":{"assistindo":false,"pctAtual":0}}}), &mut state);
        assert_eq!(state.twitch.as_ref().unwrap()["pctAtual"],0);
        parse_game_message(&json!({"t":"disconnected"}), &mut state);
        assert!(state.twitch.is_none() && state.kick.is_none());
    }

    #[test]
    fn bridged_and_raw_welcome_have_the_same_hud_state() {
        let player = json!({"nick":"Fixture", "gold":4321, "level":27, "huntSlug":"vulpix",
            "activeId":22, "pokemons":[{"id":11,"speciesId":1,"nome":"Bulbasaur","level":5},
            {"id":22,"speciesId":7,"nome":"Squirtle","level":18}]});
        let mut raw = HeadlessState::new(0, "Fixture".into());
        let mut bridged = raw.clone();
        assert!(parse_game_message(&json!({"t":"welcome","estado":player}), &mut raw));
        assert!(parse_game_message(&json!({"t":"welcome","data":{"estado":player}}), &mut bridged));
        assert_eq!(serde_json::to_value(&raw).unwrap(), serde_json::to_value(&bridged).unwrap());
        assert_eq!(raw.gold, 4321);
        assert_eq!(raw.team.iter().find(|p| p.ld == Some(true)).unwrap().sid, Some(7));
    }

    #[test]
    fn metrics_use_the_launcher_contract_and_active_id_deltas() {
        let mut state = HeadlessState::new(1, "Fixture".into());
        parse_game_message(&json!({"t":"welcome","estado":{"activeId":1,"pokemons":[{"id":1},{"id":2}]}}), &mut state);
        parse_game_message(&json!({"t":"estado","data":{"activeId":2}}), &mut state);
        assert_eq!(state.team.iter().find(|p| p.ld == Some(true)).unwrap().id, Some(json!(2)));
        parse_game_message(&json!({"t":"batalha","ev":[{"k":"morte","quem":"selvagem","xp":40,"ouro":8},{"k":"bola"}]}), &mut state);
        let value = serde_json::to_value(&state).unwrap();
        assert_eq!(value["a"]["xpg"], 40);
        assert_eq!(value["a"]["ballsUsed"], 1);
        assert!(value["sessStart"].as_u64().unwrap() > 0);
        assert_eq!(value["activeId"], 2);
        parse_game_message(&json!({"t":"disconnected"}), &mut state);
        assert!(!state.live);
    }

    #[test]
    fn saved_session_json_is_never_sent_as_the_websocket_token() {
        let (token, nick) = normalize_session_token(json!({"token":"actual-token","nick":"AuthenticatedNick","provedor":"email"}).to_string(), Some("display label".into()));
        assert_eq!(token, "actual-token");
        assert_eq!(nick.as_deref(), Some("AuthenticatedNick"));
        assert_eq!(normalize_session_token("raw-token".into(), None).0, "raw-token");
    }

    #[test]
    fn combat_field_updates_do_not_clear_hunt_and_center_exit_restores_target() {
        let mut state = HeadlessState::new(2, "Fixture".into());
        parse_game_message(&json!({"t":"welcome","estado":{"huntSlug":"larvitar","noCentro":false}}), &mut state);
        parse_game_message(&json!({"t":"campo.init","slug":"centro"}), &mut state);
        assert_eq!(state.hunt, "centro");
        parse_game_message(&json!({"t":"estado","data":{"noCentro":false}}), &mut state);
        assert_eq!(state.hunt, "larvitar");
        parse_game_message(&json!({"t":"campo","data":{"seq":33,"mobs":[]}}), &mut state);
        parse_game_message(&json!({"t":"campo","slug":""}), &mut state);
        assert_eq!(state.hunt, "larvitar");
    }

    #[test]
    fn ui_websocket_url_is_not_discarded() {
        let config: BlasterConfig = serde_json::from_value(json!({"wsUrl":"ws://127.0.0.1:9999","hunt":"vulpix"})).unwrap();
        assert_eq!(config.ws_url.as_deref(), Some("ws://127.0.0.1:9999"));
        assert_eq!(config.hunt.as_deref(), Some("vulpix"));
    }

    #[test]
    fn hunt_target_is_preserved_for_reconnect_across_field_and_disconnect_events() {
        let mut state = HeadlessState::new(0, "Fixture".into());
        parse_game_message(&json!({"t":"welcome","estado":{"huntSlug":"larvitar","noCentro":false}}), &mut state);
        assert_eq!(state.hunt, "larvitar");
        assert_eq!(state.last_hunt_slug, "larvitar");

        // When temporary disconnect occurs
        state.live = false;
        // The hunt slug must still be preserved for reconnect
        assert_eq!(state.hunt, "larvitar");
        assert_eq!(state.last_hunt_slug, "larvitar");
    }
}

#[cfg(test)]
mod supply_inventory_tests {
    use super::*;
    #[test]
    fn inventory_maps_follow_server_deltas() {
        let mut state = HeadlessState::new(0, "fixture".into());
        parse_game_message(&json!({"t":"welcome","estado":{"balls":{"3":0,"1":42},"items":{"9":0}}}), &mut state);
        parse_game_message(&json!({"t":"estado","data":{"estado":{"balls":{"3":1000,"1":42},"items":{"9":50}}}}), &mut state);
        let value = serde_json::to_value(&state).unwrap();
        assert_eq!(value["ballMap"]["3"], 1000);
        assert_eq!(value["ballMap"]["1"], 42);
        assert_eq!(value["invMap"]["9"], 50);
    }
}

#[cfg(test)]
mod stock_contract_tests {
    use super::*;
    #[test]
    fn snapshots_replace_stock_and_missing_fields_preserve_it() {
        let mut s = HeadlessState::new(0, "fixture".into());
        parse_game_message(&json!({"t":"welcome","catalogoBolas":[{"id":5,"infinite":true}],"estado":{"balls":{"1":10,"5":1},"items":{"200":10,"205":3},"automation":{"ballIds":[5]}}}), &mut s);
        assert!(s.balls_known && s.inventory_known);
        assert_eq!(s.ball_catalog.len(),1);
        parse_game_message(&json!({"t":"estado","data":{"gold":4}}), &mut s);
        assert_eq!(s.inv_map["200"],10);
        parse_game_message(&json!({"t":"estado","data":{"balls":{"1":0},"items":{"205":2}}}), &mut s);
        assert!(!s.inv_map.contains_key("200"));
        assert!(!s.ball_map.contains_key("5"));
        parse_game_message(&json!({"t":"estado","items":null}), &mut s);
        assert!(s.inventory_known && s.inv_map.is_empty());
    }
    #[test]
    fn consumption_waits_for_authoritative_stock_and_reset_invalidates_it() {
        let mut s = HeadlessState::new(0, "fixture".into());
        parse_game_message(&json!({"t":"welcome","estado":{"balls":{"1":10},"items":{"200":4}}}), &mut s);
        parse_game_message(&json!({"t":"batalha","ev":[{"k":"bola","ballId":1},{"k":"cura","itemId":200}]}), &mut s);
        assert_eq!(s.ball_map["1"],10);
        assert_eq!(s.inv_map["200"],4);
        assert_eq!(s.last_ball_id,Some(json!(1)));
        assert!(parse_game_message(&json!({"t":"estado","cheio":true}), &mut s));
        assert!(!s.balls_known && !s.inventory_known);
        assert!(s.ball_map.is_empty() && s.inv_map.is_empty());
        parse_game_message(&json!({"t":"telemetry_gap"}), &mut s);
        assert!(!s.live);
    }
}

#[cfg(test)]
mod identity_tests {
    use super::*;
    #[test]
    fn character_identity_comes_from_server_id_never_nickname() {
        let mut s = HeadlessState::new(0, "Nickname".into());
        assert!(s.cid.is_empty());
        parse_game_message(&json!({"t":"welcome","estado":{"id":42,"nick":"Nickname"}}), &mut s);
        assert_eq!(s.cid,"42");
        parse_game_message(&json!({"t":"estado","nick":"Renamed"}), &mut s);
        assert_eq!(s.cid,"42");
        parse_game_message(&json!({"t":"estado","id":"43"}), &mut s);
        assert_eq!(s.cid,"43");
        parse_game_message(&json!({"t":"welcome","estado":{"nick":"Unknown"}}), &mut s);
        assert!(s.cid.is_empty());
    }
}
