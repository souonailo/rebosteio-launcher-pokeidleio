use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, atomic::{AtomicU64, Ordering}};
use std::path::PathBuf;
use tauri::{
    webview::WebviewBuilder, AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl, Window,
};
use tokio::sync::{RwLock, oneshot};

pub(crate) fn get_account_profile_dir(index: usize) -> PathBuf {
    crate::credentials::get_app_data_dir()
        .join("profiles")
        .join(format!("conta_{}", index + 1))
}

pub const CHROME_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

pub fn generate_autofill_script(index: usize, email: &str, pass: &str) -> String {
    let email_json = serde_json::to_string(email).unwrap_or_else(|_| "\"\"".to_string());
    let pass_json = serde_json::to_string(pass).unwrap_or_else(|_| "\"\"".to_string());

    format!(
        r#"
        (() => {{
            // NUNCA executar dentro de iframes (como o do Cloudflare Turnstile)
            if (window.self !== window.top) {{
                return;
            }}

            const ACCOUNT_INDEX = {index};
            const EMAIL = {email_json};
            const SENHA = {pass_json};

            // Se a sessão já estiver presente no localStorage, reporta via IPC nativo
            try {{
                const s = localStorage.getItem('sessao');
                const n = localStorage.getItem('nick');
                if (s && s.length > 20 && window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') {{
                    window.__TAURI_INTERNALS__.invoke('report_gameplay', {{ session: 'autofill-' + ACCOUNT_INDEX, event: {{t: 'session_token', data: {{token: s, nick: n || ''}}}} }}).catch(() => {{}});
                }}
            }} catch (_) {{}}

            if (!EMAIL || !SENHA) return;

            function setVal(el, val) {{
                if (!el) return;
                try {{
                    const proto = Object.getPrototypeOf(el);
                    const desc = Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
                    if (desc && desc.set) {{
                        desc.set.call(el, val);
                    }} else {{
                        el.value = val;
                    }}
                }} catch (e) {{
                    el.value = val;
                }}
                el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                el.dispatchEvent(new Event('change', {{ bubbles: true }}));
            }}

            function findBtn() {{
                return Array.from(document.querySelectorAll('button')).find(x =>
                    x.type === 'submit' ||
                    /auth-imgbtn/.test(x.className) ||
                    x.id === 'entrar' ||
                    /entrar/i.test(x.textContent || '')
                );
            }}

            function fill() {{
                const portal = document.getElementById('portal');
                const app = document.getElementById('app');
                if (portal && portal.classList.contains('hidden') && app && !app.classList.contains('hidden')) {{
                    return true;
                }}

                const inputs = Array.from(document.querySelectorAll('input'));
                const u = inputs.find(i =>
                    i.autocomplete === 'username' ||
                    i.type === 'email' ||
                    i.name === 'id' ||
                    i.name === 'email' ||
                    i.id === 'email' ||
                    i.id === 'username'
                );
                const p = inputs.find(i =>
                    i.autocomplete === 'current-password' ||
                    i.type === 'password' ||
                    i.name === 'password' ||
                    i.id === 'password'
                );

                if (u && p) {{
                    if (u.value !== EMAIL) setVal(u, EMAIL);
                    if (p.value !== SENHA) setVal(p, SENHA);
                    return true;
                }}
                return false;
            }}

            fill();

            if (!window.__pokeNativeAutofill) {{
                window.__pokeNativeAutofill = true;
                let c = 0;
                const t = setInterval(() => {{
                    c++;
                    const ok = fill();
                    const btn = findBtn();

                    let turnstileResolved = false;
                    try {{
                        if (window.turnstile && typeof window.turnstile.getResponse === 'function') {{
                            const token = window.turnstile.getResponse('entrar') || window.turnstile.getResponse();
                            if (token && typeof token === 'string' && token.trim().length > 30) {{
                                turnstileResolved = true;
                            }}
                        }}
                    }} catch (_) {{}}

                    if (!turnstileResolved) {{
                        const tk = document.querySelector('input[name="cf-turnstile-response"]');
                        if (tk && tk.value && tk.value.trim().length > 30) {{
                            turnstileResolved = true;
                        }}
                    }}

                    // Se não há widget de Turnstile na tela, considera resolvido
                    const hasTurnstile = !!document.querySelector('.cf-turnstile, [data-sitekey], iframe[src*="cloudflare"], iframe[src*="turnstile"]');
                    if (!hasTurnstile) {{
                        turnstileResolved = true;
                    }}

                    if (ok && btn && turnstileResolved && !btn.disabled) {{
                        clearInterval(t);
                        window.__pokeNativeAutofill = false;
                        btn.click();
                        return;
                    }}
                    if (c > 120) {{
                        clearInterval(t);
                        window.__pokeNativeAutofill = false;
                    }}
                }}, 400);
            }}
        }})();
        "#
    )
}

#[derive(Clone, serde::Serialize)]
pub struct ViewSettings {pub zoom:f64,pub muted:bool,pub applied:bool}
impl Default for ViewSettings {fn default()->Self{Self{zoom:1.0,muted:false,applied:false}}}

pub struct WebviewManager {
    labels: RwLock<HashMap<usize, String>>,
    visibility: RwLock<HashMap<usize, bool>>,
    headless: RwLock<HashSet<usize>>,
    pub transition: tokio::sync::Mutex<()>,
    controls: std::sync::Arc<Mutex<HashMap<usize,ViewSettings>>>,
    proxies: Mutex<HashMap<usize,Option<crate::account_proxy::Proxy>>>,
    next_request: AtomicU64,
    pending: Mutex<HashMap<(usize, u64), oneshot::Sender<Result<serde_json::Value, String>>>>,
}

impl WebviewManager {
    pub fn new() -> Self {
        Self {
            labels: RwLock::new(HashMap::new()),
            visibility: RwLock::new(HashMap::new()),
            headless: RwLock::new(HashSet::new()),
            transition: tokio::sync::Mutex::new(()),
            controls: std::sync::Arc::new(Mutex::new(HashMap::new())),
            proxies: Mutex::new(HashMap::new()),
            next_request: AtomicU64::new(1),
            pending: Mutex::new(HashMap::new()),
        }
    }

    pub async fn configure_view(&self,app:&AppHandle,index:usize,zoom:Option<f64>,muted:Option<bool>)->Result<ViewSettings,String>{
        if index>=4 {return Err("Conta inválida".into());}
        if zoom.map(|z|!z.is_finite() || !(0.5..=2.0).contains(&z)).unwrap_or(false){return Err("Zoom inválido".into());}
        let requested={let mut map=self.controls.lock().unwrap();let settings=map.entry(index).or_default();
            if let Some(z)=zoom{settings.zoom=z;}if let Some(m)=muted{settings.muted=m;}settings.clone()};
        let Some(view)=app.get_webview(&format!("game-account-{}",index))else{return Ok(requested);};
        #[cfg(windows)] {
            let (tx,rx)=oneshot::channel();let controls=self.controls.clone();
            view.with_webview(move|native|{
                use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_8;
                use windows_core::Interface;
                let result=(||->Result<ViewSettings,String>{
                    let settings=controls.lock().unwrap().get(&index).cloned().unwrap_or_default();
                    unsafe{
                        let controller=native.controller();
                        controller.SetZoomFactor(settings.zoom).map_err(|e|e.to_string())?;
                        let core=controller.CoreWebView2().and_then(|c|c.cast::<ICoreWebView2_8>()).map_err(|e|e.to_string())?;
                        core.SetIsMuted(settings.muted).map_err(|e|e.to_string())?;
                        let mut actual_zoom=0.0;let mut actual_mute=windows_core::BOOL::default();
                        controller.ZoomFactor(&mut actual_zoom).map_err(|e|e.to_string())?;
                        core.IsMuted(&mut actual_mute).map_err(|e|e.to_string())?;
                        Ok(ViewSettings{zoom:actual_zoom,muted:actual_mute.as_bool(),applied:true})
                    }
                })();let _=tx.send(result);
            }).map_err(|e|e.to_string())?;
            tokio::time::timeout(std::time::Duration::from_secs(5),rx).await.map_err(|_|"Controle da WebView excedeu o tempo limite")?.map_err(|_|"Controle da WebView cancelado")?
        }
        #[cfg(not(windows))]{view.set_zoom(requested.zoom).map_err(|e|e.to_string())?;Ok(requested)}
    }

    pub fn mark_proxy(&self,index:usize){if let Ok(proxy)=crate::account_proxy::for_account(index){self.proxies.lock().unwrap().insert(index,proxy);}}
    pub fn proxy_changed(&self,index:usize)->Result<bool,String>{let next=crate::account_proxy::for_account(index)?;Ok(self.proxies.lock().unwrap().get(&index).cloned().unwrap_or(None)!=next)}

    pub async fn is_visible(&self, index: usize) -> bool {
        if self.is_headless(index).await { return false; }
        let vis = self.visibility.read().await;
        *vis.get(&index).unwrap_or(&true)
    }

    pub async fn is_headless(&self, index: usize) -> bool {
        self.headless.read().await.contains(&index)
    }

    pub async fn set_headless(&self, index: usize, active: bool) {
        let mut modes = self.headless.write().await;
        if active { modes.insert(index); self.mark_proxy(index); } else { modes.remove(&index); }
    }

    pub async fn set_visibility_state(&self, index: usize, visible: bool) {
        let mut vis = self.visibility.write().await;
        vis.insert(index, visible);
    }

    pub async fn create_or_update(
        &self,
        app: &AppHandle,
        window: &Window,
        index: usize,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        url: Option<String>,
    ) -> Result<(), String> {
        if index >= 4 { return Err("Conta inválida".into()); }
        if self.is_headless(index).await { return Ok(()); }
        let label = format!("game-account-{}", index);
        let pos = LogicalPosition::new(x, y);
        let size = LogicalSize::new(width, height);

        if let Some(wv) = app.get_webview(&label) {
            let _ = wv.set_position(pos);
            let _ = wv.set_size(size);
            let visible = self.is_visible(index).await;
            if visible {
                let _ = wv.show();
                crate::webview_memory::set_background(&wv, false);
            } else {
                let _ = wv.hide();
                crate::webview_memory::set_background(&wv, true);
            }
            return Ok(());
        }

        let target_url = url.unwrap_or_else(|| "https://pokeidle.io/app".to_string());
        let parsed_url = WebviewUrl::External(
            target_url
                .parse()
                .map_err(|e: url::ParseError| e.to_string())?,
        );

        let proxy=crate::account_proxy::for_account(index)?;
        let initial_url=if proxy.is_some(){WebviewUrl::External("about:blank".parse().unwrap())}else{parsed_url};
        let profile_dir = get_account_profile_dir(index);
        let _ = std::fs::create_dir_all(&profile_dir);

        let session_script = if let Some(manager) = app.try_state::<std::sync::Arc<crate::game_headless::GameHeadlessManager>>() {
            manager.hunt_restore_script(index).await
        } else { String::new() };
        let mut builder = WebviewBuilder::new(&label, initial_url)
            .data_directory(profile_dir)
            .user_agent(CHROME_USER_AGENT)
            .additional_browser_args(&crate::webview_memory::browser_args(proxy.as_ref().map(|p|&p.url)))
            .initialization_script(crate::webview_memory::background_economy_script())
            .initialization_script(&session_script)
            .initialization_script(include_str!("hunt_session_bridge.js"))
            .initialization_script(include_str!("gameplay_bridge.js"))
            .initialization_script(include_str!("../../ui/src/ui/inventory-state.js"))
            .initialization_script(include_str!("launcher_gameplay.js"))
            .initialization_script(include_str!("daily_pass.js"))
            .initialization_script(concat!(include_str!("../../ui/src/ui/auto-depot.js"), "\nPioAutoDepot.installAutoDepot();"));

        if let Some(p)=&proxy{builder=builder.proxy_url(p.url.clone());}
        builder = builder.initialization_script(include_str!("guest_compat.js"))
            .on_page_load(move |wv, payload| {
                use tauri::Emitter;
                let event = match payload.event() {
                    tauri::webview::PageLoadEvent::Started => "did-start-loading",
                    tauri::webview::PageLoadEvent::Finished => "dom-ready",
                };
                let _ = wv.app_handle().emit_to("main", "game:load", serde_json::json!({
                    "index": index, "event": event, "url": payload.url().as_str()
                }));
            });

        // Pre-injeta auto-login de credenciais salvas se houver
        let accounts = crate::credentials::load_accounts();
        if let Some(acc) = accounts.get(index) {
            let email = acc.email.as_deref().unwrap_or("");
            let pass = acc.senha.as_deref().unwrap_or("");
            if !email.is_empty() && !pass.is_empty() {
                let init_script = generate_autofill_script(index, email, pass);
                builder = builder.initialization_script(&init_script);
            }
        }

        let wv = window
            .add_child(builder, pos, size)
            .map_err(|e| e.to_string())?;

        if let Err(error)=crate::account_proxy::authenticate(&wv,proxy.as_ref()).await{let _=wv.close();return Err(error);}
        if proxy.is_some(){wv.navigate(target_url.parse().map_err(|_|"Destino inválido")?).map_err(|e|e.to_string())?;}
        self.mark_proxy(index);
        let visible = self.is_visible(index).await;
        if visible {
            let _ = wv.show();
            crate::webview_memory::set_background(&wv, false);
        } else {
            let _ = wv.hide();
            crate::webview_memory::set_background(&wv, true);
        }

        self.configure_view(app,index,None,None).await?;
        let mut map = self.labels.write().await;
        map.insert(index, label);
        Ok(())
    }

    pub async fn set_bounds(
        &self,
        app: &AppHandle,
        index: usize,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    ) -> Result<(), String> {
        let label = format!("game-account-{}", index);
        if let Some(wv) = app.get_webview(&label) {
            let _ = wv.set_position(LogicalPosition::new(x, y));
            let _ = wv.set_size(LogicalSize::new(width, height));
        }
        Ok(())
    }

    pub async fn set_visible(
        &self,
        app: &AppHandle,
        index: usize,
        visible: bool,
    ) -> Result<(), String> {
        {
            let mut vis = self.visibility.write().await;
            vis.insert(index, visible);
        }
        let label = format!("game-account-{}", index);
        if let Some(wv) = app.get_webview(&label) {
            if visible {
                let _ = wv.show();
                crate::webview_memory::set_background(&wv, false);
            } else {
                let _ = wv.hide();
                crate::webview_memory::set_background(&wv, true);
            }
        }
        Ok(())
    }

    pub async fn fill_credentials(
        &self,
        app: &AppHandle,
        index: usize,
        email: &str,
        pass: &str,
    ) -> Result<(), String> {
        let label = format!("game-account-{}", index);
        if let Some(wv) = app.get_webview(&label) {
            let script = generate_autofill_script(index, email, pass);
            wv.eval(&script).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub async fn eval(&self, app: &AppHandle, index: usize, script: &str) -> Result<(), String> {
        let label = format!("game-account-{}", index);
        if let Some(wv) = app.get_webview(&label) {
            wv.eval(script).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub async fn execute(&self, app: &AppHandle, index: usize, script: &str) -> Result<serde_json::Value, String> {
        let wv = app.get_webview(&format!("game-account-{}", index)).ok_or("WebView indisponível")?;
        let request_id = self.next_request.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert((index, request_id), tx);
        let source = serde_json::to_string(script).map_err(|e| e.to_string())?;
        let code = format!(r#"(() => {{
            const invoke = window.__TAURI_INTERNALS__.invoke;
            Promise.resolve().then(() => (0, eval)({source})).then(
                value => invoke('webview_eval_result', {{requestId: {request_id}, value: value === undefined ? null : value, error: null}}),
                error => invoke('webview_eval_result', {{requestId: {request_id}, value: null, error: String(error).slice(0, 500)}})
            ).catch(() => {{}});
        }})()"#);
        if let Err(e) = wv.eval(code) {
            self.pending.lock().unwrap().remove(&(index, request_id));
            return Err(e.to_string());
        }
        let result = tokio::time::timeout(std::time::Duration::from_secs(20), rx).await;
        self.pending.lock().unwrap().remove(&(index, request_id));
        result.map_err(|_| "Consulta ao jogo excedeu o tempo limite".to_string())?
            .map_err(|_| "Consulta cancelada".to_string())?
    }

    pub fn resolve(&self, index: usize, request_id: u64, value: serde_json::Value, error: Option<String>) {
        if let Some(tx) = self.pending.lock().unwrap().remove(&(index, request_id)) {
            let _ = tx.send(match error { Some(e) => Err(e), None => Ok(value) });
        }
    }

    pub async fn destroy(&self, app: &AppHandle, index: usize) -> Result<(), String> {
        let label = format!("game-account-{}", index);
        if let Some(wv) = app.get_webview(&label) {
            let _ = wv.close();
        }
        let mut map = self.labels.write().await;
        map.remove(&index);
        Ok(())
    }
}
