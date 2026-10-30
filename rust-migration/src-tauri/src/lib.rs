pub mod userscripts;
pub mod credentials;
pub mod account_proxy;
pub mod desktop_settings;
pub mod social_store;
pub mod game_headless;
pub mod daily_pass;
pub mod auto_depot;
pub mod kick_service;
pub mod kick_connections;
pub mod kick_browser;
pub mod kick_rewards;
pub mod twitch_service;
pub mod webview_manager;
pub mod webview_memory;
pub mod pio_arquivos;
pub mod sniper;

use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, Window};
use serde::Serialize;
use serde_json::json;

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn creds_load() -> Vec<credentials::Account> {
    credentials::load_accounts()
}

#[tauri::command]
async fn creds_save(
    app: AppHandle,
    manager: tauri::State<'_, Arc<webview_manager::WebviewManager>>,
    accounts: Vec<credentials::Account>,
) -> Result<bool, String> {
    let ok = credentials::save_accounts(accounts.clone()).is_ok();
    if ok {
        for (i, acc) in accounts.iter().enumerate() {
            let email = acc.email.as_deref().unwrap_or("");
            let pass = acc.senha.as_deref().unwrap_or("");
            if !email.is_empty() && !pass.is_empty() {
                let _ = manager.fill_credentials(&app, i, email, pass).await;
            }
        }
    }
    Ok(ok)
}

#[tauri::command]
async fn webview_fill_creds(
    app: AppHandle,
    manager: tauri::State<'_, Arc<webview_manager::WebviewManager>>,
    index: usize,
    email: String,
    pass: String,
) -> Result<bool, String> {
    manager.fill_credentials(&app, index, &email, &pass).await.map(|_| true)
}

#[tauri::command]
async fn webview_settings(app:AppHandle,manager:tauri::State<'_,Arc<webview_manager::WebviewManager>>,index:usize,zoom:Option<f64>,muted:Option<bool>)->Result<webview_manager::ViewSettings,String>{manager.configure_view(&app,index,zoom,muted).await}

#[derive(Serialize)]
pub struct WindowStateResponse {
    pub maximized: bool,
    pub visible: bool,
}

#[tauri::command]
async fn window_control(window: Window, action: String) -> Result<WindowStateResponse,String> {
    let mut is_max = window.is_maximized().unwrap_or(false);
    match action.as_str() {
        "minimize" => {
            let _ = window.minimize();
        }
        "maximize" => {
            if is_max {
                let _ = window.unmaximize();
                is_max = false;
            } else {
                let _ = window.maximize();
                is_max = true;
            }
        }
        "close" => {
            let _ = window.close();
        }
        "show" => { desktop_settings::restore_window(window.app_handle()); }
        "drag" => { let _ = window.start_dragging(); }
        _ => {}
    }
    let _ = window.emit_to("main", "window:maximized", is_max);
    Ok(WindowStateResponse { maximized: is_max, visible:window.is_visible().unwrap_or(false) })
}

#[tauri::command]
fn set_awake(on: bool) -> bool {
    #[cfg(windows)]
    {
        use windows::Win32::System::Power::{
            SetThreadExecutionState, ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED,
        };
        unsafe {
            if on {
                SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED);
            } else {
                SetThreadExecutionState(ES_CONTINUOUS);
            }
        }
    }
    true
}

#[tauri::command]
fn set_min_to_tray(state:tauri::State<'_, desktop_settings::DesktopSettings>, on:bool)->Result<bool,String>{state.set_min_to_tray(on)}

#[tauri::command]
fn preset_read(name: String) -> Option<String> {
    let candidates = [
        PathBuf::from("presets").join(&name),
        PathBuf::from("../presets").join(&name),
        PathBuf::from("ui/presets").join(&name),
    ];
    for p in &candidates {
        if let Ok(c) = fs::read_to_string(p) {
            return Some(c);
        }
    }
    None
}

fn get_app_data_dir() -> PathBuf {
    crate::credentials::get_app_data_dir()
}

#[tauri::command]
fn instance_get() -> serde_json::Value {
    let id = crate::credentials::get_instance_id();
    serde_json::json!({
        "id": id,
        "isSecondary": id > 1,
        "accountOffset": (id - 1) * 4
    })
}

#[tauri::command]
fn instance_new(target_id: Option<usize>) -> Result<bool, String> {
    let next_id = target_id.unwrap_or_else(|| crate::credentials::get_instance_id() + 1);
    spawn_new_instance(next_id)
}

pub fn spawn_new_instance(target_id: usize) -> Result<bool, String> {
    let current_exe = std::env::current_exe().map_err(|e| format!("Não foi possível localizar executável atual: {}", e))?;
    println!("[Instance] Abrindo nova instância {} com executável: {:?}", target_id, current_exe);

    #[cfg(windows)]
    {
        let mut cmd = std::process::Command::new(&current_exe);
        cmd.arg(format!("--instance={}", target_id));
        cmd.env("PIO_INSTANCE", target_id.to_string());
        cmd.spawn().map_err(|e| format!("Falha ao abrir nova instância: {}", e))?;
        Ok(true)
    }
    #[cfg(not(windows))]
    {
        let mut cmd = std::process::Command::new(&current_exe);
        cmd.arg(format!("--instance={}", target_id));
        cmd.env("PIO_INSTANCE", target_id.to_string());
        cmd.spawn().map_err(|e| format!("Falha ao abrir nova instância: {}", e))?;
        Ok(true)
    }
}

#[tauri::command]
fn errlog_write(origin: String, msg: String) -> bool {
    let dir = get_app_data_dir();
    let _ = fs::create_dir_all(&dir);
    let log_file = dir.join("relatorio-de-erros.log");
    use std::io::Write;
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(log_file) {
        let _ = writeln!(f, "[LOG] [{}] {}", origin, msg);
    }
    true
}

#[tauri::command]
fn errlog_open() -> bool {
    let dir = get_app_data_dir();
    let log_file = dir.join("relatorio-de-erros.log");
    if log_file.exists() {
        #[cfg(windows)]
        {
            let _ = std::process::Command::new("notepad.exe")
                .arg(log_file)
                .spawn();
        }
    }
    true
}

#[tauri::command]
fn backup_save(name: String, content: String, _header: Option<String>) -> bool {
    let dir = get_app_data_dir().join("backups");
    let _ = fs::create_dir_all(&dir);
    let f = dir.join(name);
    fs::write(f, content).is_ok()
}

#[tauri::command]
async fn system_notify(app:AppHandle,title:String,body:String)->Result<bool,String>{
    tauri::async_runtime::spawn_blocking(move||{
        use tauri_plugin_notification::NotificationExt;
        match app.notification().builder().title(&title).body(&body).show(){
            Ok(())=>Ok(true),
            Err(error)=>{
                #[cfg(windows)] {return tauri_winrt_notification::Toast::new(tauri_winrt_notification::Toast::POWERSHELL_APP_ID).title(&title).text1(&body).show().map(|_|true).map_err(|_|error.to_string());}
                #[cfg(not(windows))] {Err(error.to_string())}
            }
        }
    }).await.map_err(|e|e.to_string())?
}

#[tauri::command]
async fn webhook_send(url: String, text: String) -> bool {
    let client = reqwest::Client::new();
    let body = serde_json::json!({ "content": text });
    client.post(&url).json(&body).send().await.is_ok()
}

#[derive(Serialize)]
pub struct ExtensionResponse {
    pub status: u16,
    pub body: String,
}

// Porta do baixaUserScript do Electron: a interface espera {ok,url,code,error}.
// So https em github.com/raw.githubusercontent.com, link /blob/ vira raw, ate 3 redirecionamentos,
// 2 MB e 12 s; pagina HTML nao e aceita como script.
fn userscript_raw_url(u: url::Url) -> url::Url {
    if u.host_str() == Some("github.com") {
        let p: Vec<&str> = u.path().split('/').filter(|s| !s.is_empty()).collect();
        if let Some(i) = p.iter().position(|s| *s == "blob") {
            if i >= 2 && p.len() > i + 2 {
                let raw = format!("https://raw.githubusercontent.com/{}/{}/{}", p[0], p[1], p[i + 1..].join("/"));
                if let Ok(r) = url::Url::parse(&raw) { return r; }
            }
        }
    }
    u
}

#[tauri::command]
async fn userscript_fetch(url: String) -> serde_json::Value {
    let fail = |e: &str| serde_json::json!({"ok": false, "error": e});
    let Ok(mut u) = url::Url::parse(url.trim()).map(userscript_raw_url) else { return fail("Link inválido."); };
    let client = match reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(12))
        .user_agent(concat!("PIO-Rebosteio/", env!("CARGO_PKG_VERSION")))
        .build() { Ok(c) => c, Err(_) => return fail("Não foi possível acessar o GitHub.") };
    for hops in 0..=3 {
        let allowed = u.scheme() == "https"
            && matches!(u.host_str(), Some("github.com") | Some("raw.githubusercontent.com"))
            && u.path().to_ascii_lowercase().ends_with(".js");
        if !allowed {
            return fail(if hops > 0 { "O GitHub redirecionou para um endereço fora da lista (link de release?). Use o link do arquivo .js dentro do repositório." } else { "Use um link https do GitHub para um arquivo .js" });
        }
        let resp = match client.get(u.clone()).header("Accept", "text/plain").send().await {
            Ok(r) => r, Err(_) => return fail("Não foi possível acessar o GitHub."),
        };
        let status = resp.status();
        if status.is_redirection() {
            if hops == 3 { return fail("Redirecionamentos demais."); }
            let next = resp.headers().get("location").and_then(|v| v.to_str().ok()).and_then(|l| u.join(l).ok());
            match next { Some(n) => { u = userscript_raw_url(n); continue; } None => return fail("Redirecionamento inválido.") }
        }
        if status.as_u16() != 200 { return fail(&format!("GitHub respondeu HTTP {}", status.as_u16())); }
        if resp.content_length().map(|n| n > 2 * 1024 * 1024).unwrap_or(false) { return fail("O script passa de 2 MB."); }
        let Ok(bytes) = resp.bytes().await else { return fail("Falha ao ler o script."); };
        if bytes.len() > 2 * 1024 * 1024 { return fail("O script passa de 2 MB."); }
        let code = String::from_utf8_lossy(&bytes).to_string();
        let t = code.trim();
        if t.is_empty() || t.starts_with('<') {
            return fail("Esse link não devolveu um arquivo .js. Abra o arquivo no GitHub e copie o link dele.");
        }
        return serde_json::json!({"ok": true, "url": u.to_string(), "code": code});
    }
    fail("Redirecionamentos demais.")
}

#[tauri::command]
async fn userscript_request(url: String) -> userscripts::Response {
    userscripts::fetch(&url, false).await
}

#[tauri::command]
fn account_clear(index: usize) -> bool {
    let dir = get_app_data_dir().join(format!("profiles/conta_{}", index + 1));
    if dir.exists() {
        let _ = fs::remove_dir_all(&dir);
    }
    true
}

#[tauri::command]
async fn proxy_apply(app:AppHandle,manager:tauri::State<'_,Arc<webview_manager::WebviewManager>>,headless:tauri::State<'_,Arc<game_headless::GameHeadlessManager>>)->Result<serde_json::Value,String>{
    let _transition=manager.transition.lock().await;
    let mut changed=Vec::new();let mut errors=Vec::new();
    for index in 0..4 {
        match manager.proxy_changed(index){
            Ok(false)=>continue,
            Err(error)=>{manager.destroy(&app,index).await?;headless.stop(index).await;errors.push(json!({"index":index,"error":error}));continue;},
            Ok(true)=>{}
        }
        if manager.is_headless(index).await {
            let config=game_headless::BlasterConfig{token:headless.get_token(index).await,nick:headless.get_nick(index).await,ws_url:headless.get_ws_url(index).await,hunt:None};
            if let Err(error)=headless.start(app.clone(),index,config).await{let _=app.emit_to("main","blaster:status",json!({"index":index,"status":"error","error":error}));errors.push(json!({"index":index,"error":"Falha ao reconectar Blaster pelo proxy"}));continue;}
            manager.mark_proxy(index);
        }else{manager.destroy(&app,index).await?;changed.push(index);}
    }
    Ok(json!({"changed":changed,"errors":errors}))
}

#[derive(Serialize)]
pub struct AutoStartResponse {
    pub on: bool,
    pub suportado: bool,
}

#[tauri::command]
fn autostart_get() -> AutoStartResponse {
    AutoStartResponse { on: desktop_settings::autostart_enabled(), suportado: cfg!(windows) }
}

#[tauri::command]
async fn autostart_set(app:AppHandle,on:bool)->Result<bool,String>{
    let saved=tauri::async_runtime::spawn_blocking(move||desktop_settings::set_autostart(on)).await.map_err(|e|e.to_string())??;
    let _=app.emit_to("main","autostart:change",saved);Ok(saved)
}

// ----------------- MASTER BLASTER HEADLESS -----------------

#[tauri::command]
async fn blaster_start(
    app: AppHandle,
    manager: tauri::State<'_, Arc<game_headless::GameHeadlessManager>>,
    views: tauri::State<'_, Arc<webview_manager::WebviewManager>>,
    index: usize,
    config: game_headless::BlasterConfig,
) -> Result<(), String> {
    if index >= 4 { return Err("Conta inválida".into()); }
    let _auth = manager.auth_locks[index].lock().await;
    let _transition = views.transition.lock().await;
    if manager.get_token(index).await.is_none() && config.token.as_deref().unwrap_or("").is_empty() {
        let session = views.execute(&app, index,
            "({token: localStorage.getItem('sessao'), nick: localStorage.getItem('nick')})").await?;
        let token = session.get("token").and_then(|v| v.as_str()).filter(|v| !v.is_empty()).ok_or("Faça login na conta antes de ativar o Headless")?;
        manager.set_token(index, token.into(), session.get("nick").and_then(|v| v.as_str()).map(str::to_owned)).await;
    }
    views.set_headless(index, true).await;
    views.destroy(&app, index).await?;
    if let Err(e) = manager.start(app, index, config).await {
        views.set_headless(index, false).await;
        return Err(e);
    }
    Ok(())
}

#[tauri::command]
async fn blaster_stop(
    manager: tauri::State<'_, Arc<game_headless::GameHeadlessManager>>,
    views: tauri::State<'_, Arc<webview_manager::WebviewManager>>,
    index: usize,
) -> Result<bool, String> {
    let _transition = views.transition.lock().await;
    let stopped = manager.stop(index).await;
    views.set_headless(index, false).await;
    Ok(stopped)
}

#[tauri::command]
async fn blaster_status(
    manager: tauri::State<'_, Arc<game_headless::GameHeadlessManager>>,
    index: usize,
) -> Result<serde_json::Value, String> {
    let running = manager.is_running(index).await;
    Ok(json!({
        "active": running,
        "status": if running { "connected" } else { "disconnected" }
    }))
}

#[tauri::command]
async fn blaster_send(
    manager: tauri::State<'_, Arc<game_headless::GameHeadlessManager>>,
    index: usize,
    data: serde_json::Value,
) -> Result<bool, String> {
    manager.send_message(index, data).await
}

#[tauri::command]
async fn session_token_save(
    app: AppHandle,
    manager: tauri::State<'_, Arc<game_headless::GameHeadlessManager>>,
    index: usize,
    token: String,
    nick: Option<String>,
) -> Result<bool, String> {
    manager.set_token(index, token.clone(), nick.clone()).await;
    let _ = app.emit(
        "session:token",
        json!({
            "index": index,
            "token": token,
            "nick": nick
        }),
    );
    Ok(true)
}

#[tauri::command]
async fn session_token_get(
    manager: tauri::State<'_, Arc<game_headless::GameHeadlessManager>>,
    index: usize,
) -> Result<Option<String>, String> {
    Ok(manager.get_token(index).await)
}

#[tauri::command]
async fn telemetry_report(
    app: AppHandle,
    manager: tauri::State<'_, Arc<game_headless::GameHeadlessManager>>,
    index: usize,
    event: serde_json::Value,
) -> Result<bool, String> {
    manager.update_telemetry_event(&app, index, &event).await;
    Ok(true)
}

// ----------------- TWITCH IRC -----------------

#[tauri::command]
fn twitch_creds_load() -> Result<serde_json::Value,String> {
    social_store::try_load("twitch")
}

#[tauri::command]
async fn twitch_creds_save(app: AppHandle, manager: tauri::State<'_, Arc<twitch_service::TwitchServiceManager>>, data: serde_json::Value) -> Result<bool,String> {
    let _save=manager.save_lock.lock().await;
    if !twitch_service::save_creds(data.clone()) { return Err("Falha ao salvar credenciais Twitch".into()); }
    manager.configure(&app, &data).await; Ok(true)
}

#[tauri::command]
async fn twitch_test(username: String, token: String) -> Result<serde_json::Value, String> {
    match twitch_service::TwitchServiceManager::test_connection(username, token).await {
        Ok(ok) => Ok(json!({ "ok": ok })),
        Err(err) => Ok(json!({ "ok": false, "error": err })),
    }
}

#[tauri::command]
async fn twitch_sync_lives(
    manager: tauri::State<'_, Arc<twitch_service::TwitchServiceManager>>,
    lives: Vec<String>,
) -> Result<bool, String> {
    Ok(manager.sync_lives(lives).await)
}

#[tauri::command]
async fn twitch_status_get(manager: tauri::State<'_, Arc<twitch_service::TwitchServiceManager>>) -> Result<serde_json::Value,String> { Ok(manager.get_status().await) }

// ----------------- KICK -----------------

#[tauri::command]
fn kick_creds_load() -> Result<serde_json::Value,String> {
    social_store::try_load("kick")
}

#[tauri::command]
async fn kick_creds_save(app: AppHandle, manager: tauri::State<'_, Arc<kick_service::KickServiceManager>>, data: serde_json::Value) -> Result<bool,String> {
    let _save=manager.save_lock.lock().await;
    if !kick_service::save_creds(data.clone()) { return Err("Falha ao salvar credenciais Kick".into()); }
    manager.configure(&app, data).await; Ok(true)
}

#[tauri::command]
async fn kick_test(username: String, token: String) -> Result<serde_json::Value, String> {
    match kick_service::KickServiceManager::test_connection(username, token).await {
        Ok(ok) => Ok(json!({ "ok": ok })),
        Err(err) => Ok(json!({ "ok": false, "error": err })),
    }
}

#[tauri::command]
async fn kick_sync_lives(
    app: AppHandle,
    manager: tauri::State<'_, Arc<kick_service::KickServiceManager>>,
    lives: Vec<Vec<String>>,
) -> Result<bool, String> {
    manager.sync_lives(&app, lives).await
}

#[tauri::command]
async fn kick_status_get(manager: tauri::State<'_, Arc<kick_service::KickServiceManager>>) -> Result<serde_json::Value,String> { Ok(manager.get_status().await) }

#[tauri::command]
async fn kick_points_get(manager: tauri::State<'_, Arc<kick_service::KickServiceManager>>) -> Result<serde_json::Value,String> { Ok(manager.get_points().await) }

#[tauri::command]
async fn kick_points_refresh(app: AppHandle, manager: tauri::State<'_, Arc<kick_service::KickServiceManager>>, index: usize) -> Result<serde_json::Value,String> { manager.refresh(&app,index,true).await }

#[tauri::command]
async fn kick_session_open(app: AppHandle, manager: tauri::State<'_, Arc<kick_service::KickServiceManager>>, index: usize, slug: String) -> Result<bool,String> { manager.open(&app,index,&slug).await }

#[tauri::command]
async fn kick_point_channels(manager: tauri::State<'_, Arc<kick_service::KickServiceManager>>, channels: Vec<Vec<String>>) -> Result<bool,String> { manager.set_channels(channels).await; Ok(true) }

// ----------------- AUTH & CAMOUFOX -----------------

fn login_components(app: &AppHandle) -> Option<(PathBuf, PathBuf, Option<PathBuf>)> {
    if let Ok(resources) = app.path().resource_dir() {
        let runtime = resources.join("login-runtime");
        let python = runtime.join("python/python.exe");
        let script = runtime.join("turnstile_solver.py");
        let browser = runtime.join("camoufox/camoufox.exe");
        if python.is_file() && script.is_file() && browser.is_file() {
            return Some((python, script, Some(browser)));
        }
    }
    [PathBuf::from("tools/turnstile_solver.py"), PathBuf::from("../tools/turnstile_solver.py")]
        .into_iter().find(|p| p.is_file())
        .map(|script| (std::env::var_os("PIO_NAILO_PYTHON").map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("python")), script, None))
}

#[tauri::command]
fn camoufox_check(app: AppHandle) -> serde_json::Value {
    json!({ "available": login_components(&app).is_some() })
}

#[tauri::command]
async fn camoufox_login(
    app: AppHandle,
    manager: tauri::State<'_, Arc<game_headless::GameHeadlessManager>>,
    data: serde_json::Value,
    views: tauri::State<'_, Arc<webview_manager::WebviewManager>>,
) -> Result<serde_json::Value, String> {
    let index = data.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
    if index >= 4 { return Err("Conta inválida".into()); }
    let _auth = manager.auth_locks[index].lock().await;
    if views.is_headless(index).await { return Err("Conta em modo Blaster; sessão existente preservada".into()); }
    let email = data.get("email").and_then(|v| v.as_str()).unwrap_or("");
    let password = data.get("password").and_then(|v| v.as_str()).unwrap_or("");
    let proxy = data.get("proxy").cloned();

    if let Some((python, script_path, browser)) = login_components(&app) {
        let payload = json!({
            "mode": "login",
            "email": email,
            "password": password,
            "proxy": proxy,
            "timeout_s": 60,
            "headless": true
        });
        let json_str = payload.to_string();

        let mut command = tokio::process::Command::new(python);
        if let Some(browser) = browser { command.env("PIO_NAILO_CAMOUFOX", browser); }
        #[cfg(windows)]
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        let output = command.arg(script_path)
            .arg("--json")
            .arg(&json_str)
            .output()
            .await
            .map_err(|e| e.to_string())?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines().rev() {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(line.trim()) {
                if parsed.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
                    if let Some(token) = parsed.get("token").and_then(|v| v.as_str()) {
                        let nick = parsed.get("nick").and_then(|v| v.as_str()).map(|s| s.to_string());
                        manager.set_token(index, token.to_string(), nick.clone()).await;
                        let _ = app.emit(
                            "session:token",
                            json!({
                                "index": index,
                                "token": token,
                                "nick": nick
                            }),
                        );
                    }
                }
                return Ok(parsed);
            }
        }
    }

    Ok(json!({ "success": false, "error": "turnstile_solver.py não encontrado" }))
}

#[tauri::command]
fn auth_cancel_login(_index: usize) -> bool {
    true
}

#[tauri::command]
async fn auth_window_open(app: AppHandle, index: usize, url: String) -> Result<bool, String> {
    let label = format!("auth-window-{}", index);
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(true);
    }
    let parsed_url = WebviewUrl::External(url.parse().map_err(|e: url::ParseError| e.to_string())?);
    let builder = WebviewWindowBuilder::new(&app, &label, parsed_url)
        .title(format!("Autenticação - Conta {}", index + 1))
        .inner_size(800.0, 700.0);
    let _ = builder.build().map_err(|e| e.to_string())?;
    Ok(true)
}

// ----------------- WEBVIEW MANAGER -----------------

#[tauri::command]
async fn webview_sync(
    app: AppHandle,
    window: Window,
    manager: tauri::State<'_, Arc<webview_manager::WebviewManager>>,
    index: usize,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    url: Option<String>,
    visible: Option<bool>,
) -> Result<(), String> {
    let _transition = manager.transition.lock().await;
    if let Some(v) = visible {
        manager.set_visibility_state(index, v).await;
    }
    manager
        .create_or_update(&app, &window, index, x, y, width, height, url)
        .await
}

#[tauri::command]
async fn webview_set_visible(
    app: AppHandle,
    manager: tauri::State<'_, Arc<webview_manager::WebviewManager>>,
    index: usize,
    visible: bool,
) -> Result<(), String> {
    let _transition = manager.transition.lock().await;
    manager.set_visible(&app, index, visible).await
}

#[tauri::command]
async fn webview_destroy(
    app: AppHandle,
    manager: tauri::State<'_, Arc<webview_manager::WebviewManager>>,
    index: usize,
) -> Result<(), String> {
    manager.destroy(&app, index).await
}

#[tauri::command]
async fn webview_eval(
    app: AppHandle,
    manager: tauri::State<'_, Arc<webview_manager::WebviewManager>>,
    index: usize,
    script: String,
) -> Result<serde_json::Value, String> {
    manager.execute(&app, index, &script).await
}

#[tauri::command]
fn webview_navigate(app: AppHandle, index: usize, url: Option<String>) -> Result<(), String> {
    let view = app.get_webview(&format!("game-account-{}", index)).ok_or("WebView indisponível")?;
    match url {
        Some(url) => view.navigate(url.parse().map_err(|e: url::ParseError| e.to_string())?),
        None => view.reload(),
    }.map_err(|e| e.to_string())
}

fn game_index(webview: &tauri::Webview) -> Result<usize, String> {
    if webview.url().ok().and_then(|u| u.host_str().map(str::to_owned)).as_deref() != Some("pokeidle.io") {
        return Err("Origem inválida".into());
    }
    webview.label().strip_prefix("game-account-").and_then(|s| s.parse::<usize>().ok())
        .filter(|i| *i < 4).ok_or_else(|| "WebView inválida".into())
}

#[tauri::command]
fn webview_eval_result(webview: tauri::Webview, manager: tauri::State<'_, Arc<webview_manager::WebviewManager>>,
    request_id: u64, value: serde_json::Value, error: Option<String>) -> Result<(), String> {
    manager.resolve(game_index(&webview)?, request_id, value, error);
    Ok(())
}

#[tauri::command]
fn game_console_message(webview: tauri::Webview, app: AppHandle, message: String) -> Result<(), String> {
    let index = game_index(&webview)?;
    if message.len() >= 2_000_000 || !["__PGST__", "__PGIV__", "__PGDLG__", "__RBZOOM__", "__GMSET__", "__GMXHR__"].iter().any(|p| message.starts_with(p)) {
        return Err("Mensagem inválida".into());
    }
    app.emit_to("main", "game:console", json!({"index": index, "message": message})).map_err(|e| e.to_string())
}

#[tauri::command]
async fn report_gameplay(
    webview: tauri::Webview,
    app: AppHandle,
    headless: tauri::State<'_, Arc<game_headless::GameHeadlessManager>>,
    views: tauri::State<'_, Arc<webview_manager::WebviewManager>>,
    session: String,
    event: serde_json::Value,
) -> Result<(), String> {
    if session.is_empty() || session.len() > 64 { return Err("Sessão inválida".into()); }
    if webview.url().ok().and_then(|u| u.host_str().map(str::to_owned)).as_deref() != Some("pokeidle.io") {
        return Err("Origem inválida".into());
    }
    let label = webview.label().to_string();
    let index: usize = if let Some(idx_str) = label.strip_prefix("game-account-") {
        idx_str.parse().unwrap_or(0)
    } else if let Some(idx_str) = label.strip_prefix("embedded-acc-") {
        idx_str.parse().unwrap_or(0)
    } else {
        0
    };
    if views.is_headless(index).await { return Ok(()); }

    headless.update_telemetry_event(&app, index, &event).await;
    Ok(())
}

#[tauri::command]
async fn report_gameplay_batch(
    webview: tauri::Webview,
    app: AppHandle,
    headless: tauri::State<'_, Arc<game_headless::GameHeadlessManager>>,
    views: tauri::State<'_, Arc<webview_manager::WebviewManager>>,
    session: String,
    events: Vec<serde_json::Value>,
    metrics: serde_json::Value,
) -> Result<(), String> {
    if session.is_empty() || session.len() > 64 || events.is_empty() || events.len() > 64 {
        return Err("Lote inválido".into());
    }
    if webview.url().ok().and_then(|u| u.host_str().map(str::to_owned)).as_deref() != Some("pokeidle.io") {
        return Err("Origem inválida".into());
    }
    if events.iter().map(|e| e.to_string().len()).sum::<usize>() > 1024 * 1024 {
        return Err("Lote muito grande".into());
    }

    let label = webview.label().to_string();
    let index: usize = if let Some(idx_str) = label.strip_prefix("game-account-") {
        idx_str.parse().unwrap_or(0)
    } else if let Some(idx_str) = label.strip_prefix("embedded-acc-") {
        idx_str.parse().unwrap_or(0)
    } else {
        0
    };
    if views.is_headless(index).await { return Ok(()); }

    let has_welcome = events.iter().any(|e| e.get("t").and_then(|v| v.as_str()) == Some("welcome"));
    for event in events {
        headless.update_telemetry_event(&app, index, &event).await;
    }

    if has_welcome {
        crate::webview_memory::refresh(&webview);
    }

    let _ = metrics;
    Ok(())
}

pub fn run() {
    let headless_manager = Arc::new(game_headless::GameHeadlessManager::new());
    let twitch_manager = Arc::new(twitch_service::TwitchServiceManager::new());
    let kick_manager = Arc::new(kick_service::KickServiceManager::new());
    let webview_manager = Arc::new(webview_manager::WebviewManager::new());

    #[allow(unused_mut)]
    let mut context=tauri::generate_context!();
    let id = crate::credentials::get_instance_id();
    if id > 1 {
        context.config_mut().identifier = format!("com.pionailo.launcher.instancia{}", id);
        context.config_mut().app.windows[0].title = format!("PIO Rebosteio (Instância {})", id);
    }
    // An isolated native profile is available only in debug builds for lifecycle tests.
    #[cfg(debug_assertions)]
    if let Some(path)=std::env::var_os("PIO_NAILO_TEST_PROFILE") {
        let _=path;
        context.config_mut().app.windows[0].create=false;
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            #[cfg(debug_assertions)]
            if let Some(path)=std::env::var_os("PIO_NAILO_TEST_PROFILE") {
                WebviewWindowBuilder::from_config(app,&app.config().app.windows[0])?.data_directory(PathBuf::from(path)).build()?;
            }
            let handle = app.handle().clone();
            if let Err(error)=desktop_settings::setup_tray(&handle){eprintln!("Bandeja indisponível: {error}");}
            tauri::async_runtime::spawn_blocking(move||{
                if desktop_settings::autostart_enabled(){let _=desktop_settings::set_autostart(true);}
            });
            let twitch = app.state::<Arc<twitch_service::TwitchServiceManager>>().inner().clone();
            let kick = app.state::<Arc<kick_service::KickServiceManager>>().inner().clone();
            tauri::async_runtime::spawn(async move {
                twitch.configure(&handle, &twitch_service::load_creds()).await;
                kick.configure(&handle, kick_service::load_creds()).await;
                kick.start(handle);
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let Some(index)=window.label().strip_prefix("kick-session-").and_then(|s|s.parse::<usize>().ok()).filter(|i|*i<4) {
                // Let CloseRequested destroy the page, including all audio/video.
                // The persistent profile keeps the login; a text-only query can restore it.
                if matches!(event,tauri::WindowEvent::Destroyed) {
                    let app=window.app_handle().clone();
                    let manager=app.state::<Arc<kick_service::KickServiceManager>>().inner().clone();
                    tauri::async_runtime::spawn(async move{let _=manager.refresh(&app,index,true).await;});
                }
            }
            if window.label()=="main" {
                if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                    window.app_handle().exit(0);
                }
                if matches!(event, tauri::WindowEvent::Resized(_)) {
                    desktop_settings::minimize_to_tray(window.app_handle());
                }
            }
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Resized(_)) {
                let _ = window.emit_to("main", "window:maximized", window.is_maximized().unwrap_or(false));
            }
        })
        .manage(desktop_settings::DesktopSettings::new())
        .manage(headless_manager)
        .manage(twitch_manager)
        .manage(kick_manager)
        .manage(webview_manager)
        .manage(webview_memory::MemoryPolicy::default())
        .invoke_handler(tauri::generate_handler![
            app_version,
            auto_depot::auto_depot_get,
            auto_depot::auto_depot_set,
            sniper::sniper_get_state,
            sniper::sniper_save,
            sniper::sniper_clear_history,
            sniper::sniper_ingest,
            creds_load,
            creds_save,
            window_control,
            set_awake,
            set_min_to_tray,
            preset_read,
            errlog_write,
            errlog_open,
            backup_save,
            system_notify,
            webhook_send,
            userscript_fetch,
            userscript_request,
            account_clear,
            proxy_apply,
            autostart_get,
            autostart_set,
            blaster_start,
            blaster_stop,
            blaster_status,
            blaster_send,
            session_token_save,
            session_token_get,
            telemetry_report,
            report_gameplay,
            report_gameplay_batch,
            twitch_creds_load,
            twitch_creds_save,
            twitch_test,
            twitch_sync_lives,
            twitch_status_get,
            kick_creds_load,
            kick_creds_save,
            kick_test,
            kick_sync_lives,
            kick_status_get,
            kick_points_get,
            kick_points_refresh,
            kick_session_open,
            kick_point_channels,
            camoufox_check,
            camoufox_login,
            auth_cancel_login,
            auth_window_open,
            webview_sync,
            webview_set_visible,
            webview_destroy,
            webview_eval,
            webview_navigate,
            webview_eval_result,
            game_console_message,
            webview_fill_creds,
            webview_settings,
            instance_get,
            instance_new,
            pio_arquivos::pio_pasta,
            pio_arquivos::pio_salvar,
            pio_arquivos::pio_ler,
            pio_arquivos::pio_existe,
            pio_arquivos::pio_listar,
            pio_arquivos::pio_mover
        ])
        .run(context)
        .expect("erro ao rodar o aplicativo PIO Nailo em Rust");
}
