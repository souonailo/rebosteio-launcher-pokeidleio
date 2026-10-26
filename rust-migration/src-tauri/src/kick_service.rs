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
    crate::social_store::load("kick")
}
pub fn save_creds(data: Value) -> bool {
    crate::social_store::save("kick", &data).is_ok()
}
fn official_url(channel: &str) -> Result<url::Url, String> {
    if channel.is_empty() { return url::Url::parse(crate::kick_browser::LOGIN_URL).map_err(|e|e.to_string()); }
    let slug = crate::social_store::slug(channel).ok_or("Canal Kick inválido")?;
    url::Url::parse(&format!("https://kick.com/{slug}")).map_err(|e|e.to_string())
}
fn empty() -> Value {
    json!({"status":"checking","username":"","balances":{},"refreshing":false,"error":""})
}
fn enabled(config: &Value, index: usize) -> bool {
    config["masterEnabled"]
        .as_bool()
        .or(config["enabled"].as_bool())
        .unwrap_or(false)
        && config["accounts"][index]["enabled"] != false
}
fn refresh_delay(force: bool, login_missing: bool) -> u64 {
    if force { 3 } else if login_missing { 300 } else { 55 }
}
fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn error_status(status: u16) -> &'static str {
    match status {
        401 => "login_required",
        403 => "blocked",
        429 => "rate_limited",
        _ => "error",
    }
}
fn verified_balance(value: &Value) -> Option<u64> {
    value
        .pointer("/data/points")
        .and_then(Value::as_u64)
        .filter(|n| *n <= 9_007_199_254_740_991)
}

fn journal_with_receipt(mut journal: Value, index: usize, receipt: Value) -> Value {
    if !journal.is_object() {
        journal = json!({});
    }
    if !journal["accounts"].is_array() {
        journal["accounts"] = json!([{}, {}, {}, {}]);
    }
    if let Some(arr) = journal["accounts"].as_array_mut() {
        while arr.len() <= index {
            arr.push(json!({}));
        }
        arr[index] = receipt;
    }
    journal
}

// PIO: canais favoritos (inscrito = mais pontos). Quando estão ao vivo, entram sempre na lista assistida,
// vêm antes dos outros no limite de conexões e têm reconexão rápida (a cada 15 s, no máximo uma vez a cada 45 s).
// Configuração: variável de ambiente PIO_KICK_FAVORITOS com os slugs separados por vírgula
// (ex.: setx PIO_KICK_FAVORITOS "canal1,canal2"). Vazia = comportamento original, sem favoritos.
fn favoritos() -> &'static [String] {
    static F: std::sync::OnceLock<Vec<String>> = std::sync::OnceLock::new();
    F.get_or_init(|| {
        std::env::var("PIO_KICK_FAVORITOS").unwrap_or_default()
            .split(',').map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty()).collect()
    })
}
static FAV_AO_VIVO: [std::sync::atomic::AtomicBool; 4] = [const { std::sync::atomic::AtomicBool::new(false) }; 4];
static FAV_ULTIMO_FORCE: [std::sync::atomic::AtomicU64; 4] = [const { std::sync::atomic::AtomicU64::new(0) }; 4];
fn agora_s() -> u64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) }
fn com_favoritos(mut alvo: BTreeSet<String>) -> BTreeSet<String> { for f in favoritos() { alvo.insert(f.clone()); } alvo }

pub struct KickServiceManager {
    config: RwLock<Value>,
    accounts: RwLock<Vec<Value>>,
    channels: RwLock<Vec<Vec<String>>>,
    lives: RwLock<Vec<Vec<String>>>,
    revision: AtomicU64,
    configure_lock: Mutex<()>,
    redemption_lock: Mutex<()>,
    pub save_lock: Mutex<()>,
    jobs: Vec<Mutex<()>>,
    live_sync_lock: Mutex<()>,
    last_refresh: Mutex<Vec<Option<Instant>>>,
    connections: crate::kick_connections::Connections,
    query_lock: Mutex<()>,
}
impl KickServiceManager {
    pub fn new() -> Self {
        let mut initial_accounts: Vec<Value> = (0..4).map(|_| empty()).collect();
        if let Ok(journal) = crate::social_store::try_load("kick-redemptions") {
            let current_time = now();
            for i in 0..4 {
                if let Some(prev) = journal.get("accounts").and_then(|a| a.get(i)) {
                    let prev_exp = prev["expiresAt"].as_u64().unwrap_or_else(|| {
                        if prev["status"] == "confirmed" {
                            prev["at"].as_u64().unwrap_or(0) + 3_600_000
                        } else {
                            0
                        }
                    });
                    if prev_exp > current_time {
                        let mut active = prev.clone();
                        active["expiresAt"] = json!(prev_exp);
                        initial_accounts[i]["activeRedemption"] = active;
                    }
                }
            }
        }
        Self {
            config: RwLock::new(json!({"masterEnabled":false,"accounts":[]})),
            accounts: RwLock::new(initial_accounts),
            channels: RwLock::new(vec![Vec::new();4]),
            lives: RwLock::new(vec![Vec::new();4]),
            revision: AtomicU64::new(0),
            configure_lock: Mutex::new(()),
            redemption_lock: Mutex::new(()),
            save_lock: Mutex::new(()),
            jobs: (0..4).map(|_| Mutex::new(())).collect(),
            live_sync_lock: Mutex::new(()),
            last_refresh: Mutex::new(vec![None; 4]),
            connections: crate::kick_connections::Connections::default(),
            query_lock: Mutex::new(()),
        }
    }
    pub async fn get_points(&self) -> Value {
        json!({"accounts":self.accounts.read().await.clone()})
    }
    pub async fn get_status(&self) -> Value {
        let config = self.config.read().await;
        let accounts = self.accounts.read().await;
        let mut states = Vec::new();
        for (i,a) in accounts.iter().enumerate() {
            let joined = self.connections.joined(i).await;
            states.push(json!({"status":a["status"],"username":a["username"],"lastError":a["error"],"connectionErrors":self.connections.errors(i).await,"joinedChannels":joined,"connectionStatus":if joined.is_empty(){"disconnected"}else{"connected"}}));
        }
        json!({"masterEnabled":(0..4).any(|i|enabled(&config,i)),"accounts":states})
    }
    async fn emit(&self, app: &AppHandle) {
        let _ = app.emit_to("main", "kick:points", self.get_points().await);
        let _ = app.emit_to("main", "kick:status", self.get_status().await);
    }
    pub async fn configure(&self, app: &AppHandle, value: Value) {
        let _guard = self.configure_lock.lock().await;
        let mut config = self.config.write().await;
        if *config == value {
            return;
        }
        self.revision.fetch_add(1, Ordering::SeqCst);
        let mut accounts = self.accounts.write().await;
        let mut last = self.last_refresh.lock().await;
        for i in 0..4 {
            if config["accounts"][i] != value["accounts"][i] || enabled(&config,i) != enabled(&value,i) {
                self.connections.retain(i, &BTreeSet::new()).await;
            }
            if config["accounts"][i]["username"] != value["accounts"][i]["username"]
                || enabled(&config, i) != enabled(&value, i)
            {
                accounts[i] = empty();
                last[i] = None;
            }
            if !enabled(&value, i) {
                accounts[i]["status"] = json!("disconnected");
            }
        }
        *config = value;
        drop(last);
        drop(accounts);
        drop(config);
        for index in 0..4 {
            if !enabled(&*self.config.read().await, index) {
                if let Some(window) = app.get_webview_window(&format!("kick-session-{}",index)) {
                    let _ = window.destroy();
                }
            }
        }
        self.emit(app).await;
    }
    pub fn start(self: &Arc<Self>, app: AppHandle) {
        let manager = self.clone();
        tauri::async_runtime::spawn(async move {
            // Consulta completa a cada 60 s; a cada 15 s só confere se o canal favorito ao vivo continua conectado.
            let mut timer = tokio::time::interval(Duration::from_secs(15));
            let mut volta: u64 = 0;
            loop {
                timer.tick().await;
                let completa = volta % 4 == 0;
                volta += 1;
                for index in 0..4 {
                    if enabled(&*manager.config.read().await, index) {
                        let m = manager.clone();
                        let app = app.clone();
                        tokio::spawn(async move {
                            if completa {
                                let _ = m.refresh(&app, index, false).await;
                            } else if FAV_AO_VIVO[index].load(Ordering::Relaxed) {
                                let conectados = m.connections.joined(index).await;
                                let falta = favoritos().iter().any(|f| !conectados.iter().any(|c| c == f));
                                let agora = agora_s();
                                if falta && agora.saturating_sub(FAV_ULTIMO_FORCE[index].load(Ordering::Relaxed)) >= 45 {
                                    FAV_ULTIMO_FORCE[index].store(agora, Ordering::Relaxed);
                                    let _ = m.refresh(&app, index, true).await;
                                }
                            }
                        });
                    }
                }
                if completa { manager.emit(&app).await; }
            }
        });
    }
    pub async fn sync_lives(&self, app: &AppHandle, lives: Vec<Vec<String>>) -> Result<bool, String> {
        let _sync = self.live_sync_lock.lock().await;
        let _commit = self.configure_lock.lock().await;
        let old = self.lives.read().await.clone();
        *self.lives.write().await = (0..4).map(|i|crate::kick_connections::targets(lives.get(i).map(Vec::as_slice).unwrap_or(&[])).into_iter().collect()).collect();
        let lives = self.lives.read().await.clone();
        if old != lives {
            self.revision.fetch_add(1,Ordering::SeqCst);
            *self.last_refresh.lock().await = vec![None;4];
        }
        let config = self.config.read().await.clone();
        let accounts = self.accounts.read().await.clone();
        for index in 0..4 {
            let keep = com_favoritos(crate::kick_connections::targets(&lives[index]));
            let desired = if enabled(&config,index) && accounts[index]["status"] == "authenticated" { keep.clone() } else { BTreeSet::new() };
            self.connections.retain(index,&desired).await;
        }
        self.emit(app).await;
        Ok(true)
    }
    pub async fn set_channels(&self, channels: Vec<Vec<String>>) {
        let _guard = self.configure_lock.lock().await;
        let next: Vec<Vec<String>> = (0..4).map(|i| channels.get(i).into_iter().flatten()
            .filter_map(|s|crate::social_store::slug(s)).collect::<BTreeSet<_>>().into_iter().take(40).collect()).collect();
        let mut current = self.channels.write().await;
        if *current != next {
            *current = next;
            self.revision.fetch_add(1, Ordering::SeqCst);
            *self.last_refresh.lock().await = vec![None; 4];
        }
    }
    pub async fn open(&self, app: &AppHandle, index: usize, channel: &str) -> Result<bool, String> {
        if index >= 4 {
            return Err("Conta Kick inválida".into());
        }
        if !channel.is_empty() && crate::social_store::slug(channel).is_none() {
            return Err("Canal Kick inválido".into());
        }
        let url = official_url(channel)?;
        self.ensure_session_window(app,index,true).await?;
        let window=app.get_webview_window(&format!("kick-session-{}",index)).ok_or("Janela Kick indisponível")?;
        window.navigate(url).map_err(|e|e.to_string())?;
        window.show().map_err(|e|e.to_string())?;
        window.set_focus().map_err(|e|e.to_string())?;
        // The official channel page owns playback and watch-time accounting.
        Ok(true)
    }
    async fn ensure_session_window(&self,app:&AppHandle,index:usize,visible:bool)->Result<(),String>{
        let label=format!("kick-session-{}",index);
        if app.get_webview_window(&label).is_some(){return Ok(());}
        let profile=crate::kick_browser::profile(index);
        let proxy=crate::account_proxy::for_account(index)?;
        let mut builder=WebviewWindowBuilder::new(app,&label,WebviewUrl::External("about:blank".parse().unwrap()));
        if let Some(p)=&proxy{builder=builder.proxy_url(p.url.clone()).additional_browser_args(&crate::webview_memory::browser_args(Some(&p.url)));}
        builder.title(format!("Kick — Conta {}",index+1)).inner_size(1100.0,780.0)
            .visible(visible).focused(visible).skip_taskbar(!visible).data_directory(profile)
            .on_page_load(move |window,payload| {
                if payload.event()==tauri::webview::PageLoadEvent::Finished {
                    let app=window.app_handle().clone();
                    let manager=app.state::<Arc<KickServiceManager>>().inner().clone();
                    tauri::async_runtime::spawn(async move {let _=manager.refresh(&app,index,true).await;});
                }
            }).build().map_err(|e|e.to_string())?;
        if let Some(view)=app.get_webview(&label){crate::account_proxy::authenticate(&view,proxy.as_ref()).await?;crate::kick_browser::mute(&view).await?;}
        let handle=app.clone();
        let manager=app.state::<Arc<Self>>().inner().clone();
        tauri::async_runtime::spawn(async move {
            // Login can complete through SPA navigation without a page-load event.
            // Inspect only this visible login window, and stop once it is closed.
            for _ in 0..150 {
                tokio::time::sleep(Duration::from_secs(2)).await;
                let Some(window)=handle.get_webview_window(&format!("kick-session-{}",index)) else {break;};
                let logged_in=window.cookies_for_url("https://kick.com".parse().unwrap()).ok()
                    .map(|cookies|cookies.iter().any(|c|c.name()=="session_token")).unwrap_or(false);
                // Uma consulta ao detectar o login basta; repetir a cada 2 s recriava a
                // janela de consulta sem parar enquanto a janela de login ficava aberta.
                if logged_in {let _=manager.refresh(&handle,index,true).await;break;}
            }
        });
        // A restored session uses about:blank: no hidden player or viewer events.
        Ok(())
    }
    async fn request(
        client: &reqwest::Client,
        token: &str,
        cookie: &str,
        path: &str,
    ) -> Result<Value, (String, String)> {
        Self::request_url(client, token, cookie, &format!("https://kick.com{}", path)).await
    }
    async fn request_url(
        client: &reqwest::Client,
        token: &str,
        cookie: &str,
        url: &str,
    ) -> Result<Value, (String, String)> {
        let response = client
            .get(url)
            .bearer_auth(token)
            .header("Cookie", cookie)
            .header("Accept", "application/json")
            .header("x-app-platform", "web")
            .header("Referer", "https://kick.com/")
            .send()
            .await
            .map_err(|_| ("error".into(), "Falha de rede ao consultar Kick.".into()))?;
        let status = response.status().as_u16();
        if !(200..300).contains(&status) {
            return Err((
                error_status(status).into(),
                format!("Kick respondeu HTTP {}.", status),
            ));
        }
        response
            .json()
            .await
            .map_err(|_| ("error".into(), "Resposta Kick inválida.".into()))
    }
    pub async fn refresh(
        &self,
        app: &AppHandle,
        index: usize,
        force: bool,
    ) -> Result<Value, String> {
        if index >= 4 {
            return Err("Conta Kick inválida".into());
        }
        let Ok(_job) = self.jobs[index].try_lock() else {
            return Ok(self.get_points().await);
        };
        let config = self.config.read().await.clone();
        if !force && !enabled(&config, index) {
            return Ok(self.get_points().await);
        }
        // A missing session is retried after five minutes: a transient startup read
        // must not disable recovery for the rest of the launcher's lifetime.
        let login_missing = self.accounts.read().await[index]["loginConfirmadoAusente"] == true;
        {
            let mut last = self.last_refresh.lock().await;
            if last[index]
                .map(|t| t.elapsed() < Duration::from_secs(refresh_delay(force, login_missing)))
                .unwrap_or(false)
            {
                drop(last);
                return Ok(self.get_points().await);
            }
            last[index] = Some(Instant::now());
        }
        let generation = self.revision.load(Ordering::SeqCst);
        let expected =
            crate::social_store::slug(config["accounts"][index]["username"].as_str().unwrap_or(""));
        let channels = self.channels.read().await[index].clone();
        let mut state = self.accounts.read().await[index].clone();
        state["refreshing"] = json!(true);
        {
            let _commit = self.configure_lock.lock().await;
            if generation != self.revision.load(Ordering::SeqCst) {
                return Ok(self.get_points().await);
            }
            self.accounts.write().await[index] = state.clone();
        }
        self.emit(app).await;
        let result: Result<(), (String, String)> = async {
            // A maximum of one temporary browser query across all four accounts.
            let _query_serial = self.query_lock.lock().await;
            let query = crate::kick_browser::query_window(app,index).await
                .map_err(|e| ("error".into(),e))?;
            let window = query.view().map_err(|e| ("error".into(),e))?;
            let cookies = window
                .cookies_for_url(url::Url::parse("https://kick.com").unwrap())
                .map_err(|_| ("error".into(), "Não foi possível ler a sessão Kick.".into()))?;
            let token = cookies
                .iter()
                .find(|c| c.name() == "session_token")
                .map(|c| decode_cookie(c.value()))
                .ok_or(("login_required".into(), "Entre na Kick nesta conta.".into()))?;
            let raw = crate::kick_browser::request(&window, &token, "/api/v1/user").await?;
            let user = raw.get("data").unwrap_or(&raw);
            let username = crate::social_store::slug(user["username"].as_str().unwrap_or(""))
                .filter(|_| user["id"].as_u64().map(|id|id>0).unwrap_or(false))
                .ok_or_else(|| (
                    "error".into(),
                    match user["hint"].as_str().filter(|h| !h.trim().is_empty()) {
                        Some(hint) => format!("Kick não confirmou a identidade da sessão. Resposta: {}", hint.trim()),
                        None => "Kick não confirmou a identidade da sessão.".into(),
                    },
                ))?;
            if expected.as_ref().map(|v| v != &username).unwrap_or(false) {
                return Err((
                    "account_mismatch".into(),
                    format!("Sessão de @{}; entre com a conta configurada.", username),
                ));
            }
            state["username"] = json!(username);
            state["loginConfirmadoAusente"] = json!(false);
            state["status"] = json!("authenticated");
            state["error"] = json!("");
            let desired = com_favoritos(crate::kick_connections::targets(&self.lives.read().await[index]));
            // Favoritos primeiro, para nunca ficarem fora do limite de conexões.
            let mut ordem: Vec<String> = favoritos().iter().filter(|f| desired.contains(*f)).cloned().collect();
            ordem.extend(desired.iter().filter(|s| !favoritos().contains(*s)).cloned());
            let mut native_lives = Vec::new();
            for slug in &ordem {
                let raw = match crate::kick_browser::request(&window,&token,&format!("/api/v2/channels/{slug}")).await {
                    Ok(raw)=>raw,
                    Err(error) if error.0=="login_required" || error.0=="rate_limited"=>return Err(error),
                    Err(_)=>continue,
                };
                let data = raw.get("data").unwrap_or(&raw);
                if favoritos().contains(slug) {
                    FAV_AO_VIVO[index].store(data["livestream"]["is_live"] == true, Ordering::Relaxed);
                }
                if data["livestream"]["is_live"] == false { continue; }
                if let (Some(channel),Some(stream),Some(chatroom)) = (data["id"].as_u64(),data["livestream"]["id"].as_u64(),data["chatroom"]["id"].as_u64()) {
                    if channel==0 || stream==0 || chatroom==0 {continue;}
                    native_lives.push(crate::kick_connections::Live { slug:slug.clone(),channel,stream,chatroom });
                }
            }
            // Serialize against disable/account swaps, so an obsolete query cannot reconnect.
            {
                let _commit = self.configure_lock.lock().await;
                if generation != self.revision.load(Ordering::SeqCst) { return Ok(()); }
                if enabled(&*self.config.read().await,index) {
                    self.connections.sync(index,token.clone(),user["id"].as_u64().ok_or(("error".into(),"Identidade Kick inválida".into()))?,native_lives).await.map_err(|e|("error".into(),e))?;
                }
            }
            let mut balances = serde_json::Map::new();
            for slug in &channels {
                let value = match crate::kick_browser::request(
                    &window,
                    &token,
                    &format!("/api/v2/channels/{}/points", slug),
                )
                .await
                {
                    Ok(raw) => match verified_balance(&raw) {
                        Some(points) => {
                            json!({"status":"verified","points":points,"checkedAt":now()})
                        }
                        None => json!({"status":"unavailable","checkedAt":now()}),
                    },
                    Err((status, error))
                        if status == "blocked" || (status == "error"
                            && (error.contains("HTTP 404") || error.contains("HTTP 410"))) =>
                    {
                        // Identity has already been confirmed. A channel refusing
                        // its points endpoint must not invalidate the account login.
                        json!({"status":"unavailable","error":error,"checkedAt":now()})
                    }
                    Err(error) => return Err(error),
                };
                let mut value=value;
                if value["status"]=="verified" {
                    let catalog=crate::kick_browser::request(&window,&token,&format!("/api/v2/channels/{slug}/rewards")).await;
                    if let Err((status,error))=&catalog {if status=="login_required" || status=="rate_limited" {return Err((status.clone(),error.clone()));}}
                    let settings=crate::kick_browser::request(&window,&token,&format!("/api/v2/channels/{slug}/channel-points/channel-settings")).await;
                    if let Err((status,error))=&settings {if status=="login_required" || status=="rate_limited" {return Err((status.clone(),error.clone()));}}
                    match (catalog,settings) {
                        (Ok(raw),Ok(settings)) if settings["data"]["channel_points_enabled"]==true && raw["data"].is_array()=>{
                            value["rewards"]=json!(crate::kick_rewards::catalog(&raw));
                            value["catalogStatus"]=json!("verified");
                        }
                        _=>{value["catalogStatus"]=json!("unavailable");}
                    }
                }
                balances.insert(slug.clone(), value);
            }
            state["balances"] = Value::Object(balances);
            self.auto_redeem(&window,&token,index,generation,&config,&mut state).await;

            Ok(())
        }
        .await;
        if let Err((status, error)) = result {
            self.connections.retain(index,&BTreeSet::new()).await;
            state["loginConfirmadoAusente"] = json!(status == "login_required");
            state["status"] = json!(status);
            state["error"] = json!(error);
            if let Some(values) = state["balances"].as_object_mut() {
                for balance in values.values_mut() {
                    balance["status"] = json!("stale");
                }
            }
        }
        state["refreshing"] = json!(false);
        // Config changes and removed channels invalidate in-flight replies, including errors.
        let _save = self.save_lock.lock().await;
        let _commit = self.configure_lock.lock().await;
        if generation == self.revision.load(Ordering::SeqCst) {
            // Bind the first authenticated identity once, retaining every unrelated setting.
            if expected.is_none() && state["status"] == "authenticated" {
                let mut config = self.config.write().await;
                if !config["accounts"].is_array() {
                    config["accounts"] = json!([{}, {}, {}, {}]);
                }
                let accounts = config["accounts"].as_array_mut().unwrap();
                while accounts.len() < 4 {
                    accounts.push(json!({}));
                }
                if !accounts[index].is_object() {
                    accounts[index] = json!({});
                }
                accounts[index]["username"] = state["username"].clone();
                if save_creds(config.clone()) {
                    let _ = app.emit_to("main", "kick:creds", config.clone());
                }
            }
            let connected = state["status"] == "authenticated";
            self.accounts.write().await[index] = state;
            self.emit(app).await;
            if connected {
                if let Some(window) = app.get_webview_window(&format!("kick-session-{}",index)) {
                    // Keep official live pages running during balance polling.
                    if window.url().ok().map(|url| url.path().starts_with("/settings/")).unwrap_or(false) {
                        let _ = window.destroy();
                    }
                }
            }
        }
        Ok(self.get_points().await)
    }
    async fn auto_redeem(&self,view:&tauri::Webview,token:&str,index:usize,generation:u64,config:&Value,state:&mut Value) {
        state["redemption"]=json!({"status":"off","message":"Resgate automático desligado."});
        let mut journal = match crate::social_store::try_load("kick-redemptions") {
            Ok(v) => v,
            Err(_) => {
                state["redemption"] = json!({"status":"paused","message":"Não foi possível ler o registro de resgates. Automático pausado."});
                return;
            }
        };
        if !journal.is_object() {
            journal = json!({});
        }
        if !journal["accounts"].is_array() {
            journal["accounts"] = json!([{}, {}, {}, {}]);
        }
        if let Some(arr) = journal["accounts"].as_array_mut() {
            while arr.len() < 4 {
                arr.push(json!({}));
            }
        }
        let previous = journal.get("accounts").and_then(|a| a.get(index)).unwrap_or(&Value::Null);
        let prev_exp = previous["expiresAt"].as_u64().unwrap_or_else(|| {
            if previous["status"] == "confirmed" {
                previous["at"].as_u64().unwrap_or(0) + 3_600_000
            } else {
                0
            }
        });
        if prev_exp > now() {
            let mut active = previous.clone();
            active["expiresAt"] = json!(prev_exp);
            state["activeRedemption"] = active;
        }
        if config["autoClaim"] != true || config["autoClaimProtocol"] != 1 || !enabled(config, index) { return; }
        let linked = crate::social_store::slug(config["accounts"][index]["linkedUsername"].as_str().unwrap_or(""));
        if config["accounts"][index]["gameLinked"] != true || linked.as_deref() != state["username"].as_str() {
            state["redemption"] = json!({"status":"waiting_link","message":"Confirme o vínculo desta mesma conta Kick no jogo para resgatar."});
            return;
        }
        let _serial = self.redemption_lock.lock().await;
        if previous["status"] == "pending" {
            state["redemption"] = json!({"status":"paused","message":format!("Resgate em @{} sem confirmação. Automático pausado para evitar duplicação; confira o histórico na Kick.", previous["channel"].as_str().unwrap_or(""))});
            return;
        }
        if previous["status"] == "rejected" && now().saturating_sub(previous["at"].as_u64().unwrap_or(0)) < 300_000 {
            state["redemption"] = previous.clone();
            return;
        }
        state["redemption"] = json!({"status":"waiting_points","message":"Automático ativo: aguardando saldo e recompensa disponíveis."});
        let priority = config["claimPriority"].as_str().unwrap_or("exp");
        let candidate = state["balances"].as_object().into_iter().flatten().find_map(|(slug, b)| {
            let r = crate::kick_rewards::eligible(b, priority, now())?;
            let pts = b.get("points")?.as_u64()?;
            Some((slug.clone(), r.clone(), pts))
        });
        let Some((slug, reward, before)) = candidate else { return; };
        // Hold configuration through submission: disabling or switching accounts cannot race a spend.
        let _configuration = self.configure_lock.lock().await;
        if generation != self.revision.load(Ordering::SeqCst) { return; }
        let transaction = match crate::kick_browser::transaction_id(view).await { Ok(id) => id, Err(_) => { return; } };
        let receipt = json!({"status":"pending","channel":slug,"reward":reward,"transaction":transaction,"username":state["username"],"before":before,"at":now(),"message":"Resgate enviado; aguardando confirmação."});
        if let Some(arr) = journal["accounts"].as_array_mut() {
            if index < arr.len() { arr[index] = receipt.clone(); }
        }
        if crate::social_store::save("kick-redemptions", &journal).is_err() {
            state["redemption"] = json!({"status":"paused","message":"Falha ao registrar resgate; nenhum ponto foi gasto."});
            return;
        }
        let reward_id = match reward.get("id").and_then(Value::as_str) {
            Some(id) => id,
            None => return,
        };
        let response = crate::kick_browser::redeem(view, token, &slug, reward_id, &transaction).await;
        let mut receipt = receipt;
        if let Ok(status) = response {
            if [400, 401, 403, 404, 410, 422, 429].contains(&status) {
                receipt["status"] = json!("rejected");
                receipt["message"] = json!(format!("Kick recusou o resgate em @{slug} (HTTP {status}). Nova tentativa em 5 minutos."));
            } else if (200..300).contains(&status) {
                if let Ok(raw) = crate::kick_browser::request(view, token, &format!("/api/v2/channels/{slug}/points")).await {
                    if let Some(after) = verified_balance(&raw) {
                        state["balances"][&slug]["points"] = json!(after);
                        state["balances"][&slug]["checkedAt"] = json!(now());
                        let reward_cost = reward.get("cost").and_then(Value::as_u64).unwrap_or(0);
                        let reward_key = reward.get("key").and_then(Value::as_str).unwrap_or("exp");
                        if reward_cost > 0 && before.checked_sub(reward_cost) == Some(after) {
                            receipt["status"] = json!("confirmed");
                            receipt["message"] = json!(format!("Resgate confirmado na Kick: {} em @{slug}. O jogo confirma a aplicação do buff.", reward_key));
                            let current_now = now();
                            let new_expires_at = if prev_exp > current_now {
                                prev_exp + 3_600_000
                            } else {
                                current_now + 3_600_000
                            };
                            receipt["expiresAt"] = json!(new_expires_at);
                            state["activeRedemption"] = receipt.clone();
                        }
                    }
                }
            }
        }
        if receipt["status"] == "pending" {
            receipt["message"] = json!(format!("Resgate em @{slug} sem confirmação. Automático pausado para evitar duplicação; confira o histórico na Kick."));
        }
        if crate::social_store::save("kick-redemptions", &journal_with_receipt(journal, index, receipt.clone())).is_err() {
            receipt["status"] = json!("paused");
            receipt["message"] = json!("Falha ao salvar a confirmação. Automático pausado; confira o histórico na Kick.");
        }
        state["redemption"] = receipt;
    }

    pub async fn test_connection(username: String, token: String) -> Result<bool, String> {
        let expected = crate::social_store::slug(&username).ok_or("Usuário Kick inválido")?;
        if token.is_empty() {
            return Err("Entre na janela oficial Kick para verificar a sessão.".into());
        }
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| "Falha ao consultar Kick")?;
        let raw = Self::request(&client, &token, "", "/api/v1/user")
            .await
            .map_err(|(_, e)| e)?;
        let user = raw.get("data").unwrap_or(&raw);
        Ok(user["id"].is_number()
            && crate::social_store::slug(user["username"].as_str().unwrap_or("")) == Some(expected))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn startup_checks_session_before_requesting_login_and_retries_missing_sessions() {
        assert_eq!(empty()["status"], "checking");
        assert_eq!(refresh_delay(false, false), 55);
        assert_eq!(refresh_delay(false, true), 300);
        assert_eq!(refresh_delay(true, true), 3);
    }
    #[test]
    fn official_live_navigation_preserves_the_requested_channel() {
        assert_eq!(official_url("biscoitao").unwrap().as_str(), "https://kick.com/biscoitao");
        assert_eq!(official_url("").unwrap().as_str(), crate::kick_browser::LOGIN_URL);
        assert!(official_url("../user").is_err());
        assert!(official_url("https://evil.test").is_err());
    }
    #[tokio::test]
    async fn real_http_status_and_json_are_preserved_without_redirects() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        for (status, body, expected) in [
            (403, "{}", Some("blocked")),
            (401, "{}", Some("login_required")),
            (429, "{}", Some("rate_limited")),
            (200, "not-json", Some("error")),
            (200, "{\"data\":{\"points\":0}}", None),
        ] {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let response=format!("HTTP/1.1 {} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",status,body.len(),body);
            let server = tokio::spawn(async move {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut request = [0; 4096];
                let count = stream.read(&mut request).await.unwrap();
                let request = String::from_utf8_lossy(&request[..count]);
                assert!(request
                    .to_ascii_lowercase()
                    .contains("authorization: bearer fixture"));
                stream.write_all(response.as_bytes()).await.unwrap();
            });
            let client = reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .unwrap();
            let result = KickServiceManager::request_url(
                &client,
                "fixture",
                "",
                &format!("http://{}", address),
            )
            .await;
            if let Some(status) = expected {
                assert_eq!(result.unwrap_err().0, status);
            } else {
                assert_eq!(verified_balance(&result.unwrap()), Some(0));
            }
            server.await.unwrap();
        }
    }
    #[test]
    fn only_confirmed_numeric_channel_balances_are_valid() {
        assert_eq!(verified_balance(&json!({"data":{"points":0}})), Some(0));
        for value in [
            json!({}),
            json!({"data":{"points":"12"}}),
            json!({"data":{"points":-1}}),
            json!({"data":{"points":1.5}}),
        ] {
            assert_eq!(verified_balance(&value), None);
        }
    }
    #[test]
    fn http_failures_are_not_authenticated() {
        assert_eq!(error_status(403), "blocked");
        assert_eq!(error_status(401), "login_required");
        assert_eq!(error_status(429), "rate_limited");
    }
    #[test]
    fn channel_names_cannot_escape_kick_paths() {
        assert!(crate::social_store::slug("../user").is_none());
        assert!(crate::social_store::slug("https://evil.test").is_none());
    }
}

/// Kick stores session_token URL-encoded (e.g. "123%7Cabc"); the API expects the
/// decoded value ("123|abc") as Bearer, otherwise /api/v1/user answers 200 {}.
fn decode_cookie(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
            if let Ok(b) = u8::from_str_radix(hex, 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| value.to_string())
}
