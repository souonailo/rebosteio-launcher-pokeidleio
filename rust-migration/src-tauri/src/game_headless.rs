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
    #[serde(default)]
    pub drops: serde_json::Map<String, serde_json::Value>,
    pub gold: i64,
    pub diamonds: i64,
    #[serde(default)]
    pub gemas: i64,
    pub level: u32,
    #[serde(default)]
    pub xp: u64,
    pub active_id: Option<serde_json::Value>,
    pub team: Vec<PokemonTeamMember>,
    pub twitch: Option<serde_json::Value>,
    pub kick: Option<serde_json::Value>,
    pub a: HeadlessMetrics,
    pub sess_start: u64,
    #[serde(default)]
    pub catch_log: Vec<serde_json::Value>,
    #[serde(default)]
    pub shiny_log: Vec<serde_json::Value>,
    #[serde(default)]
    pub vip_ate: Option<u64>,
    #[serde(default)]
    pub passe_vip_ate: Option<u64>,
    #[serde(default)]
    pub vip_dias: Option<u32>,
    #[serde(default)]
    pub passe_dias: Option<u32>,
    #[serde(default)]
    pub boost_xp: Option<String>,
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
            drops: Default::default(),
            gold: 0,
            diamonds: 0,
            gemas: 0,
            level: 0,
            xp: 0,
            active_id: None,
            team: Vec::new(),
            twitch: None,
            kick: None,
            a: HeadlessMetrics::default(),
            sess_start: now_ms,
            catch_log: Vec::new(),
            shiny_log: Vec::new(),
            vip_ate: None,
            passe_vip_ate: None,
            vip_dias: None,
            passe_dias: None,
            boost_xp: None,
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
                    let seconds = state.a.seconds.max(60);
                    state.a.xph = (state.a.xp * 3600) / seconds;
                    state.a.kph = (state.a.kills as u64 * 3600) / seconds;
                    state.a.gph = (state.session_gold.max(0) as u64 * 3600) / seconds;
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
                                let seconds = state.a.seconds.max(60);
                                state.a.xph = (state.a.xp * 3600) / seconds;
                                state.a.kph = (state.a.kills as u64 * 3600) / seconds;
                                state.a.gph = (state.session_gold.max(0) as u64 * 3600) / seconds;
                            }
                            let cur_now_ms = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .map(|d| d.as_millis() as u64)
                                .unwrap_or(0);
                            if let Some(vip_ate) = state.vip_ate {
                                state.vip_dias = if vip_ate > cur_now_ms {
                                    Some((((vip_ate - cur_now_ms) as f64 / 86_400_000.0).ceil() as u32).max(1))
                                } else {
                                    None
                                };
                            }
                            if let Some(passe_vip_ate) = state.passe_vip_ate {
                                state.passe_dias = if passe_vip_ate > cur_now_ms {
                                    Some((((passe_vip_ate - cur_now_ms) as f64 / 86_400_000.0).ceil() as u32).max(1))
                                } else {
                                    None
                                };
                            }
                            if state.vip_dias.is_some() && state.boost_xp.is_none() {
                                state.boost_xp = Some("+50%".into());
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

pub fn resolve_headless_item_name(id: Option<u64>, current_name: &str) -> String {
    if !current_name.trim().is_empty() {
        return current_name.to_string();
    }
    match id {
        Some(2) => "Ancient Stone".into(),
        Some(5) => "Beast Ball".into(),
        Some(23) => "Cocoon Stone".into(),
        Some(28) => "Crystal Stone".into(),
        Some(31) => "Darkness Stone".into(),
        Some(40) => "Earth Stone".into(),
        Some(45) => "Enigma Stone".into(),
        Some(49) => "Feather Stone".into(),
        Some(53) => "Fire Stone".into(),
        Some(66) => "Heart Stone".into(),
        Some(71) => "Ice Stone".into(),
        Some(76) => "Leaf Stone".into(),
        Some(87) => "Metal Stone".into(),
        Some(106) => "Punch Stone".into(),
        Some(109) => "Rock Stone".into(),
        Some(133) => "Thunder Stone".into(),
        Some(139) => "Venom Stone".into(),
        Some(142) => "Water Stone".into(),
        Some(209) => "Sun Stone".into(),
        Some(40530) => "AoE TM Disk Piece".into(),
        Some(40575) => "AoE TM Disk".into(),
        Some(59194) => "TM Disk Piece".into(),
        Some(59200) => "Normal-Type TM Disk".into(),
        Some(59201) => "Fire-Type TM Disk".into(),
        Some(59202) => "Water-Type TM Disk".into(),
        Some(59203) => "Grass-Type TM Disk".into(),
        Some(59204) => "Electric-Type TM Disk".into(),
        Some(59205) => "Ice-Type TM Disk".into(),
        Some(59206) => "Fighting-Type TM Disk".into(),
        Some(59207) => "Poison-Type TM Disk".into(),
        Some(59208) => "Ground-Type TM Disk".into(),
        Some(59209) => "Flying-Type TM Disk".into(),
        Some(59210) => "Psychic-Type TM Disk".into(),
        Some(59211) => "Bug-Type TM Disk".into(),
        Some(59212) => "Rock-Type TM Disk".into(),
        Some(59213) => "Ghost-Type TM Disk".into(),
        Some(59214) => "Dragon-Type TM Disk".into(),
        Some(59215) => "Dark-Type TM Disk".into(),
        Some(59216) => "Steel-Type TM Disk".into(),
        Some(59247) => "Fairy-Type TM Disk".into(),
        Some(70000) => "Bronze Boss Token".into(),
        Some(70011) => "Key Fragment".into(),
        Some(70012) => "Shiny Stone Fragment".into(),
        Some(70013) => "Bicycle Fragment".into(),
        Some(70020) => "Normal Shiny Stone".into(),
        Some(70021) => "Fire Shiny Stone".into(),
        Some(70022) => "Water Shiny Stone".into(),
        Some(70023) => "Grass Shiny Stone".into(),
        Some(70024) => "Electric Shiny Stone".into(),
        Some(70025) => "Ice Shiny Stone".into(),
        Some(70026) => "Fighting Shiny Stone".into(),
        Some(70027) => "Poison Shiny Stone".into(),
        Some(70028) => "Ground Shiny Stone".into(),
        Some(70029) => "Flying Shiny Stone".into(),
        Some(70030) => "Psychic Shiny Stone".into(),
        Some(70031) => "Bug Shiny Stone".into(),
        Some(70032) => "Rock Shiny Stone".into(),
        Some(70033) => "Ghost Shiny Stone".into(),
        Some(70034) => "Dragon Shiny Stone".into(),
        Some(70035) => "Dark Shiny Stone".into(),
        Some(70036) => "Steel Shiny Stone".into(),
        Some(70037) => "Fairy Shiny Stone".into(),
        Some(70080) => "Common Bicycle".into(),
        Some(70081) => "Uncommon Bicycle".into(),
        Some(70082) => "Rare Bicycle".into(),
        Some(70083) => "Mythic Bicycle".into(),
        Some(70084) => "Legendary Bicycle".into(),
        Some(999999) => "Diamantes".into(),
        _ => String::new(),
    }
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
        state.ball_map.clear(); state.inv_map.clear(); state.raw_drops.clear(); state.drops.clear(); state.ball_catalog.clear();
        state.catch_log.clear(); state.shiny_log.clear();
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
            if t == "welcome" {
                state.cid.clear();
                state.ball_catalog.clear();
                state.last_ball_id = None;
            }
            state.ball_map.clear(); state.inv_map.clear();
            state.balls_known = false; state.inventory_known = false;
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

        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let trainer_eu = player.get("eu").unwrap_or(player);

        let vip_ate_val = trainer_eu.get("vipAte")
            .or_else(|| player.get("vipAte"))
            .or_else(|| data.get("vipAte"))
            .or_else(|| m.get("vipAte"))
            .or_else(|| player.get("loja").and_then(|l| l.get("vipAte")))
            .or_else(|| data.get("estado").and_then(|e| e.get("vipAte")))
            .and_then(|v| v.as_u64());
        if let Some(ate) = vip_ate_val {
            state.vip_ate = Some(ate);
            state.vip_dias = if ate > now_ms {
                Some((((ate - now_ms) as f64 / 86_400_000.0).ceil() as u32).max(1))
            } else {
                None
            };
            changed = true;
        }

        let passe_obj = player.get("passe")
            .or_else(|| data.get("passe"))
            .or_else(|| m.get("passe"))
            .or_else(|| trainer_eu.get("passe"))
            .or_else(|| data.get("estado").and_then(|e| e.get("passe")));
        let passe_ate_val = passe_obj
            .and_then(|p| p.get("vipAte"))
            .and_then(|v| v.as_u64());
        if let Some(ate) = passe_ate_val {
            state.passe_vip_ate = Some(ate);
            state.passe_dias = if ate > now_ms {
                Some((((ate - now_ms) as f64 / 86_400_000.0).ceil() as u32).max(1))
            } else {
                None
            };
            changed = true;
        }

        let boost_val = trainer_eu.get("boostXp")
            .or_else(|| player.get("boostXp"))
            .or_else(|| data.get("boostXp"))
            .or_else(|| trainer_eu.get("bonusXp").and_then(|b| b.get("tr")))
            .or_else(|| player.get("bonusXp").and_then(|b| b.get("tr")));
        if let Some(bv) = boost_val {
            if let Some(s) = bv.as_str() {
                state.boost_xp = Some(s.to_string());
                changed = true;
            } else if let Some(n) = bv.as_f64() {
                if n > 1.0 {
                    state.boost_xp = Some(format!("+{}%", ((n - 1.0) * 100.0).round() as u64));
                    changed = true;
                }
            }
        } else if state.vip_dias.is_some() && state.boost_xp.is_none() {
            state.boost_xp = Some("+50%".into());
            changed = true;
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
            let trainer = est.get("eu").unwrap_or(est);
            if let Some(nick) = trainer.get("nick").or_else(|| trainer.get("nome")).or_else(|| est.get("nick")).or_else(|| est.get("nome")).and_then(|v| v.as_str()) {
                state.name = nick.to_string();
            }
            if let Some(gold) = trainer.get("gold").or_else(|| est.get("gold")).and_then(|v| v.as_i64()) {
                state.gold = gold;
                if state.initial_gold.is_none() {
                    state.initial_gold = Some(gold);
                }
            }
            if let Some(diamonds) = trainer.get("diamonds").or_else(|| trainer.get("diamantes")).or_else(|| est.get("diamonds")).or_else(|| est.get("diamantes")).and_then(|v| v.as_i64()) {
                state.diamonds = diamonds;
            }
            if let Some(gemas) = trainer.get("orbs").or_else(|| trainer.get("gemas")).or_else(|| trainer.get("gems")).or_else(|| est.get("orbs")).or_else(|| est.get("gemas")).or_else(|| est.get("gems")).and_then(|v| v.as_i64()) {
                state.gemas = gemas;
            }
            if let Some(lvl) = trainer.get("level").or_else(|| trainer.get("trainerLevel")).or_else(|| est.get("level")).or_else(|| est.get("trainerLevel")).and_then(|v| v.as_u64()) {
                state.level = lvl as u32;
            }
            if let Some(xp) = trainer.get("xp").or_else(|| trainer.get("exp")).or_else(|| trainer.get("trainerXp")).or_else(|| est.get("xp")).or_else(|| est.get("exp")).or_else(|| est.get("trainerXp")).and_then(|v| v.as_u64()) {
                state.xp = xp;
            } else if state.xp == 0 && state.level > 0 {
                let n = (state.level.saturating_sub(1)) as u64;
                state.xp = 50 * n * (n + 1) * (2 * n + 1) / 6 - 150 * n * (n + 1) / 2 + 200 * n;
            }
            update_player_location(est, state);
            if let Some(act) = trainer.get("activeId").or_else(|| trainer.get("activePokemonId")).or_else(|| est.get("activeId")).or_else(|| est.get("activePokemonId")) {
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
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        if let Some(evs) = data.get("ev").or_else(|| m.get("ev")).and_then(|v| v.as_array()) {
            for ev in evs {
                let k = ev.get("k").or_else(|| ev.get("t")).and_then(|v| v.as_str()).unwrap_or("");
                if k == "spawn" && ev.get("shiny").and_then(|v| v.as_bool()).unwrap_or(false) {
                    state.a.shiny_found += 1;
                    let name = ev.get("nome").or_else(|| ev.get("name")).and_then(|v| v.as_str()).unwrap_or("");
                    let sid = ev.get("speciesId").or_else(|| ev.get("pokeId")).or_else(|| ev.get("sid")).and_then(|v| v.as_u64()).unwrap_or(0);
                    state.shiny_log.push(json!({
                        "n": name,
                        "sid": sid,
                        "def": 0,
                        "t": now_ms
                    }));
                    if state.shiny_log.len() > 30 {
                        state.shiny_log.remove(0);
                    }
                    changed = true;
                } else if k == "morte"
                    && ev.get("quem").and_then(|v| v.as_str()).unwrap_or("") == "selvagem"
                {
                    state.a.kills += 1;
                    let xp = ev
                        .get("xpTreinador")
                        .or_else(|| ev.get("xp"))
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    state.a.xp += xp;
                    if xp > 0 {
                        state.xp += xp;
                    }
                    if ev.get("shiny").and_then(|v| v.as_bool()).unwrap_or(false) {
                        let name = ev.get("nome").or_else(|| ev.get("name")).and_then(|v| v.as_str()).unwrap_or("");
                        let sid = ev.get("speciesId").or_else(|| ev.get("pokeId")).or_else(|| ev.get("sid")).and_then(|v| v.as_u64()).unwrap_or(0);
                        state.shiny_log.push(json!({
                            "n": name,
                            "sid": sid,
                            "def": 1,
                            "t": now_ms
                        }));
                        if state.shiny_log.len() > 30 {
                            state.shiny_log.remove(0);
                        }
                    }
                    if let Some(ouro) = ev.get("ouro").or_else(|| ev.get("gold")).and_then(|v| v.as_i64()) {
                        state.session_gold += ouro;
                    }
                    if let Some(drops) = ev.get("drops").or_else(|| ev.get("loot")).and_then(|v| v.as_array()) {
                        for drop_item in drops {
                            let item_id_num = drop_item
                                .get("itemId")
                                .or_else(|| drop_item.get("id"))
                                .and_then(|v| v.as_u64());
                            let item_id = item_id_num.map(|n| n.to_string());
                            let qty = drop_item
                                .get("qtd")
                                .or_else(|| drop_item.get("qty"))
                                .and_then(|v| v.as_u64())
                                .unwrap_or(1);
                            let raw_name = drop_item
                                .get("nome")
                                .or_else(|| drop_item.get("name"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("");
                            let name = resolve_headless_item_name(item_id_num, raw_name);
                            let drop_key = if !name.is_empty() {
                                name.clone()
                            } else {
                                item_id.clone().unwrap_or_default()
                            };
                            if !drop_key.is_empty() {
                                let current_drop = state
                                    .raw_drops
                                    .get(&drop_key)
                                    .and_then(|v| v.get("qty").and_then(|q| q.as_u64()).or_else(|| v.as_u64()))
                                    .unwrap_or(0);
                                let drop_entry = json!({
                                    "id": item_id.as_deref().unwrap_or(""),
                                    "name": name,
                                    "qty": current_drop + qty
                                });
                                state.raw_drops.insert(drop_key.clone(), drop_entry.clone());
                                state.drops.insert(drop_key.clone(), drop_entry.clone());
                                if let Some(ref id_str) = item_id {
                                    if id_str != &drop_key {
                                        state.raw_drops.insert(id_str.clone(), drop_entry.clone());
                                        state.drops.insert(id_str.clone(), drop_entry);
                                    }
                                }
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
                        .get("xpTreinador")
                        .or_else(|| ev.get("xp"))
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    state.a.xp += xp;
                    if xp > 0 {
                        state.xp += xp;
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
                            let raw_name = drop_item
                                .get("nome")
                                .or_else(|| drop_item.get("name"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("");
                            let name = resolve_headless_item_name(item_id.as_deref().and_then(|s| s.parse().ok()), raw_name);
                            let drop_key = if !name.is_empty() {
                                name.clone()
                            } else {
                                item_id.clone().unwrap_or_default()
                            };
                            if !drop_key.is_empty() {
                                let current_drop = state
                                    .raw_drops
                                    .get(&drop_key)
                                    .and_then(|v| v.get("qty").and_then(|q| q.as_u64()).or_else(|| v.as_u64()))
                                    .unwrap_or(0);
                                let drop_entry = json!({
                                    "id": item_id.as_deref().unwrap_or(""),
                                    "name": name,
                                    "qty": current_drop + qty
                                });
                                state.raw_drops.insert(drop_key.clone(), drop_entry.clone());
                                state.drops.insert(drop_key.clone(), drop_entry.clone());
                                if let Some(ref id_str) = item_id {
                                    if id_str != &drop_key {
                                        state.raw_drops.insert(id_str.clone(), drop_entry.clone());
                                        state.drops.insert(id_str.clone(), drop_entry);
                                    }
                                }
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
                    let pk = ev.get("pokemon");
                    let is_shiny = pk
                        .and_then(|p| p.get("shiny"))
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    if is_shiny {
                        state.a.shiny_cap += 1;
                    }
                    let pk_name = pk
                        .and_then(|p| p.get("nome").or_else(|| p.get("name")))
                        .and_then(|v| v.as_str())
                        .unwrap_or("?");
                    let pk_sid = pk
                        .and_then(|p| p.get("speciesId").or_else(|| p.get("pokeId")).or_else(|| p.get("sid")))
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    if is_shiny {
                        state.shiny_log.push(json!({
                            "n": pk_name,
                            "sid": pk_sid,
                            "cap": 1,
                            "t": now_ms
                        }));
                        if state.shiny_log.len() > 30 {
                            state.shiny_log.remove(0);
                        }
                    }
                    let ivs_obj = pk.and_then(|p| p.get("ivs")).filter(|v| v.is_object());
                    let iv_total = if let Some(ivs) = ivs_obj {
                        let hp = ivs.get("hp").and_then(|v| v.as_u64()).unwrap_or(0);
                        let atk = ivs.get("atk").and_then(|v| v.as_u64()).unwrap_or(0);
                        let def = ivs.get("def").and_then(|v| v.as_u64()).unwrap_or(0);
                        let spa = ivs.get("spAtk").or_else(|| ivs.get("spa")).and_then(|v| v.as_u64()).unwrap_or(0);
                        let spd = ivs.get("spDef").or_else(|| ivs.get("spd")).and_then(|v| v.as_u64()).unwrap_or(0);
                        let spe = ivs.get("speed").or_else(|| ivs.get("spe")).or_else(|| ivs.get("vel")).and_then(|v| v.as_u64()).unwrap_or(0);
                        hp + atk + def + spa + spd + spe
                    } else {
                        pk.and_then(|p| p.get("ivTotal").or_else(|| p.get("iv")))
                            .and_then(|v| v.as_u64())
                            .unwrap_or(0)
                    };
                    let quality = pk
                        .and_then(|p| p.get("quality").or_else(|| p.get("q")))
                        .and_then(|v| v.as_f64())
                        .unwrap_or(0.0);
                    let potencia = pk.and_then(|p| p.get("potencia")).and_then(|v| v.as_i64());

                    state.catch_log.push(json!({
                        "id": pk.and_then(|p| p.get("id")).cloned(),
                        "n": pk_name,
                        "sid": pk_sid,
                        "iv": iv_total,
                        "ivs": ivs_obj.cloned(),
                        "q": quality,
                        "potencia": potencia,
                        "sh": is_shiny,
                        "fx": false,
                        "t": now_ms
                    }));
                    if state.catch_log.len() > 50 {
                        state.catch_log.remove(0);
                    }
                    changed = true;
                }
            }
        }
    } else if t == "estado" {
        let est = data.get("estado").unwrap_or(data);
        let trainer = est.get("eu").unwrap_or(est);
        if let Some(active) = trainer.get("activeId").or_else(|| trainer.get("activePokemonId")).or_else(|| est.get("activeId")).or_else(|| est.get("activePokemonId")) {
            state.active_id = Some(active.clone());
            for member in &mut state.team { member.ld = Some(member.id.as_ref() == Some(active)); }
            changed = true;
        }
        if let Some(nick) = trainer.get("nick").or_else(|| trainer.get("nome")).or_else(|| est.get("nick")).or_else(|| est.get("nome")).and_then(|v| v.as_str()) {
            state.name = nick.to_string();
        }
        if let Some(gold) = trainer.get("gold").or_else(|| est.get("gold")).and_then(|v| v.as_i64()) {
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
        if let Some(diamonds) = trainer.get("diamonds").or_else(|| trainer.get("diamantes")).or_else(|| est.get("diamonds")).or_else(|| est.get("diamantes")).and_then(|v| v.as_i64()) {
            state.diamonds = diamonds;
            changed = true;
        }
        if let Some(gemas) = trainer.get("orbs").or_else(|| trainer.get("gemas")).or_else(|| trainer.get("gems")).or_else(|| est.get("orbs")).or_else(|| est.get("gemas")).or_else(|| est.get("gems")).and_then(|v| v.as_i64()) {
            state.gemas = gemas;
            changed = true;
        }
        if let Some(lvl) = trainer.get("level").or_else(|| trainer.get("trainerLevel")).or_else(|| est.get("level")).or_else(|| est.get("trainerLevel")).and_then(|v| v.as_u64()) {
            state.level = lvl as u32;
            changed = true;
        }
        if let Some(xp) = trainer.get("xp").or_else(|| trainer.get("exp")).or_else(|| trainer.get("trainerXp")).or_else(|| est.get("xp")).or_else(|| est.get("exp")).or_else(|| est.get("trainerXp")).and_then(|v| v.as_u64()) {
            state.xp = xp;
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
                state.xp += xp;
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
        parse_game_message(&json!({"t":"batalha","ev":[{"k":"morte","quem":"selvagem","xp":100,"xpTreinador":456,"ouro":12}]}), &mut state);
        let val2 = serde_json::to_value(&state).unwrap();
        assert_eq!(val2["a"]["xpg"], 496); // 40 + 456 (xpTreinador prioritized over base xp 100)
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

    #[test]
    fn headless_telemetry_tracks_catch_log_shiny_log_drops_and_trainer_xp() {
        let mut state = HeadlessState::new(0, "Fixture".into());
        parse_game_message(
            &json!({
                "t": "welcome",
                "estado": {
                    "nick": "Fixture",
                    "level": 10,
                    "xp": 50000,
                    "gold": 1000
                }
            }),
            &mut state,
        );
        assert_eq!(state.xp, 50000);

        // 1. Shiny spawn event
        parse_game_message(
            &json!({
                "t": "batalha",
                "ev": [
                    { "k": "spawn", "shiny": true, "nome": "Pikachu", "speciesId": 25 }
                ]
            }),
            &mut state,
        );
        assert_eq!(state.shiny_log.len(), 1);
        assert_eq!(state.shiny_log[0]["n"], "Pikachu");
        assert_eq!(state.shiny_log[0]["sid"], 25);
        assert_eq!(state.shiny_log[0]["def"], 0);

        // 2. Kill event with drop and shiny defeat
        parse_game_message(
            &json!({
                "t": "batalha",
                "ev": [
                    {
                        "k": "morte",
                        "quem": "selvagem",
                        "xp": 250,
                        "ouro": 50,
                        "shiny": true,
                        "nome": "Pikachu",
                        "speciesId": 25,
                        "drops": [
                            { "itemId": 100, "nome": "Thunder Stone", "qtd": 1 }
                        ]
                    }
                ]
            }),
            &mut state,
        );
        assert_eq!(state.xp, 50250);
        assert_eq!(state.a.xp, 250);
        assert_eq!(state.shiny_log.len(), 2);
        assert_eq!(state.shiny_log[1]["def"], 1);
        assert_eq!(state.drops["100"]["name"], "Thunder Stone");
        assert_eq!(state.drops["100"]["qty"], 1);
        assert_eq!(state.raw_drops["100"]["qty"], 1);

        // 3. Capture event with shiny and IVs
        parse_game_message(
            &json!({
                "t": "batalha",
                "ev": [
                    {
                        "k": "capturado",
                        "pokemon": {
                            "id": 999,
                            "speciesId": 25,
                            "nome": "Pikachu",
                            "shiny": true,
                            "quality": 1.45,
                            "potencia": 4,
                            "ivs": {
                                "hp": 30, "atk": 25, "def": 28, "spAtk": 29, "spDef": 31, "speed": 32
                            }
                        }
                    }
                ]
            }),
            &mut state,
        );
        assert_eq!(state.shiny_log.len(), 3);
        assert_eq!(state.shiny_log[2]["cap"], 1);
        assert_eq!(state.catch_log.len(), 1);
        assert_eq!(state.catch_log[0]["id"], 999);
        assert_eq!(state.catch_log[0]["n"], "Pikachu");
        assert_eq!(state.catch_log[0]["iv"], 175);
        assert_eq!(state.catch_log[0]["q"], 1.45);
        assert_eq!(state.catch_log[0]["potencia"], 4);
        assert_eq!(state.catch_log[0]["sh"], true);
    }

    #[test]
    fn headless_telemetry_extracts_trainer_eu_currencies_and_resolves_drop_names() {
        let mut state = HeadlessState::new(1, "AltAccount".into());
        parse_game_message(
            &json!({
                "t": "welcome",
                "estado": {
                    "eu": {
                        "nick": "AltMaster",
                        "gold": 45000,
                        "diamonds": 120,
                        "orbs": 35,
                        "level": 15,
                        "xp": 80000
                    }
                }
            }),
            &mut state,
        );
        assert_eq!(state.name, "AltMaster");
        assert_eq!(state.gold, 45000);
        assert_eq!(state.diamonds, 120);
        assert_eq!(state.gemas, 35);
        assert_eq!(state.level, 15);
        assert_eq!(state.xp, 80000);

        parse_game_message(
            &json!({
                "t": "estado",
                "estado": {
                    "eu": {
                        "gold": 46000,
                        "diamonds": 125,
                        "gemas": 40
                    }
                }
            }),
            &mut state,
        );
        assert_eq!(state.gold, 46000);
        assert_eq!(state.diamonds, 125);
        assert_eq!(state.gemas, 40);

        parse_game_message(
            &json!({
                "t": "batalha",
                "ev": [
                    {
                        "k": "morte",
                        "quem": "selvagem",
                        "drops": [
                            { "itemId": 53, "qtd": 1 },
                            { "itemId": 109, "qtd": 2 }
                        ]
                    }
                ]
            }),
            &mut state,
        );
        assert_eq!(state.drops["Fire Stone"]["qty"], 1);
        assert_eq!(state.drops["Fire Stone"]["name"], "Fire Stone");
        assert_eq!(state.drops["53"]["qty"], 1);
        assert_eq!(state.drops["Rock Stone"]["qty"], 2);
        assert_eq!(state.drops["Rock Stone"]["name"], "Rock Stone");
        assert_eq!(state.drops["109"]["qty"], 2);
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

    #[test]
    fn full_update_does_not_wipe_logs_or_drops_and_tracks_vip_pass() {
        let mut s = HeadlessState::new(0, "Trainer".into());
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let future_vip = now + 5 * 86_400_000;
        let future_pass = now + 12 * 86_400_000;

        // Welcome with VIP and Pass
        parse_game_message(
            &json!({
                "t": "welcome",
                "estado": {
                    "id": 100,
                    "nick": "Trainer",
                    "vipAte": future_vip,
                    "passe": {
                        "vipAte": future_pass
                    }
                }
            }),
            &mut s,
        );
        assert_eq!(s.vip_dias, Some(5));
        assert_eq!(s.passe_dias, Some(12));
        assert_eq!(s.boost_xp, Some("+50%".into()));

        // Simulate catch, shiny, and drop
        parse_game_message(
            &json!({
                "t": "batalha",
                "ev": [
                    { "k": "spawn", "shiny": true, "nome": "Charmander", "speciesId": 4 },
                    { "k": "morte", "quem": "selvagem", "drops": [{ "itemId": 109, "qtd": 3 }] },
                    { "k": "capturado", "pokemon": { "id": 1, "speciesId": 4, "nome": "Charmander", "shiny": true } }
                ]
            }),
            &mut s,
        );
        assert_eq!(s.shiny_log.len(), 2); // 1 spawn, 1 capturado
        assert_eq!(s.catch_log.len(), 1);
        assert_eq!(s.drops["109"]["qty"], 3);
        assert_eq!(s.drops["Rock Stone"]["qty"], 3);

        // Server sends 'estado' with 'cheio: true' (inventory sync / hunt change)
        parse_game_message(
            &json!({
                "t": "estado",
                "cheio": true,
                "estado": {
                    "cheio": true,
                    "balls": { "1": 50 }
                }
            }),
            &mut s,
        );

        // Logs and drops MUST NOT be cleared by cheio: true!
        assert_eq!(s.shiny_log.len(), 2, "shiny_log must persist across cheio: true");
        assert_eq!(s.catch_log.len(), 1, "catch_log must persist across cheio: true");
        assert_eq!(s.drops["109"]["qty"], 3, "drops must persist across cheio: true");
        assert_eq!(s.drops["Rock Stone"]["qty"], 3, "drops must persist across cheio: true");
        assert_eq!(s.vip_dias, Some(5), "vip_dias must persist");
        assert_eq!(s.passe_dias, Some(12), "passe_dias must persist");
    }
}
