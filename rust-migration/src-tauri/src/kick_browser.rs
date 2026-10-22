//! Read-only Kick requests through the account's real WebView2 session.
//! The query document is robots.txt, never a channel page or a hidden player.
use serde_json::{json, Value};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{AppHandle, Manager, Webview, WebviewUrl, WebviewWindowBuilder};

pub const QUERY_URL: &str = "https://kick.com/robots.txt";
pub const LOGIN_URL: &str = "https://kick.com/settings/profile";

pub fn profile(index: usize) -> PathBuf {
    crate::credentials::get_app_data_dir()
        .join("kick-profiles")
        .join(format!("conta_{}", index + 1))
}

pub struct QueryWindow {
    app: AppHandle,
    label: String,
}
impl QueryWindow {
    pub fn view(&self) -> Result<Webview, String> {
        self.app
            .get_webview(&self.label)
            .ok_or("Consulta Kick encerrada.".into())
    }
}
impl Drop for QueryWindow {
    fn drop(&mut self) {
        if let Some(window) = self.app.get_webview_window(&self.label) {
            let _ = window.destroy();
        }
    }
}

pub async fn query_window(app: &AppHandle, index: usize) -> Result<QueryWindow, String> {
    let label = format!("kick-query-{}", index);
    let guard = QueryWindow {
        app: app.clone(),
        label: label.clone(),
    };
    let (tx, rx) = tokio::sync::oneshot::channel();
    let ready = Arc::new(Mutex::new(Some(tx)));
    let proxy = crate::account_proxy::for_account(index)?;
    let mut builder = WebviewWindowBuilder::new(
        app,
        &label,
        WebviewUrl::External("about:blank".parse().unwrap()),
    );
    if let Some(p) = &proxy {
        builder = builder
            .proxy_url(p.url.clone())
            .additional_browser_args(&crate::webview_memory::browser_args(Some(&p.url)));
    }
    builder
        .title("Consulta de saldo Kick")
        .visible(false)
        // Janela oculta recriada a cada consulta: sem foco e fora da barra de tarefas,
        // senao rouba o teclado da janela principal e faz a tela piscar.
        .focused(false)
        .skip_taskbar(true)
        .focusable(false)
        .data_directory(profile(index))
        // Only this inert document can be loaded by the query window.
        .on_navigation(|url| url.as_str() == "about:blank" || url.as_str() == QUERY_URL)
        .on_page_load(move |_, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Finished
                && payload.url().as_str() == QUERY_URL
            {
                if let Some(tx) = ready.lock().unwrap().take() {
                    let _ = tx.send(());
                }
            }
        })
        .build()
        .map_err(|_| "Não foi possível abrir a consulta Kick.".to_string())?;
    let view = guard.view()?;
    crate::account_proxy::authenticate(&view, proxy.as_ref()).await?;
    prevent_playback(&view).await?;
    view.navigate(QUERY_URL.parse().unwrap())
        .map_err(|_| "Não foi possível carregar a consulta Kick.")?;
    tokio::time::timeout(Duration::from_secs(20), rx)
        .await
        .map_err(|_| "A consulta Kick excedeu o tempo limite.")?
        .map_err(|_| "A consulta Kick foi encerrada.")?;
    Ok(guard)
}

pub async fn mute(view: &Webview) -> Result<(), String> {
    #[cfg(windows)]
    {
        use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_8;
        use windows_core::Interface;
        let (tx, rx) = tokio::sync::oneshot::channel();
        view.with_webview(move |native| {
            let result = unsafe {
                native
                    .controller()
                    .CoreWebView2()
                    .and_then(|core| core.cast::<ICoreWebView2_8>())
                    .and_then(|core| core.SetIsMuted(true))
            };
            let _ = tx
                .send(result.map_err(|_| "Não foi possível silenciar a janela Kick.".to_string()));
        })
        .map_err(|_| "Janela Kick indisponível.".to_string())?;
        return tokio::time::timeout(Duration::from_secs(5), rx)
            .await
            .map_err(|_| "Janela Kick indisponível.")?
            .map_err(|_| "Janela Kick encerrada.")?;
    }
    #[cfg(not(windows))]
    {
        let _ = view;
        Ok(())
    }
}

pub fn allowed_path(path: &str) -> bool {
    if path == "/api/v1/user" { return true; }
    if let Some(slug) = path.strip_prefix("/api/v2/channels/") {
        if crate::social_store::slug(slug).as_deref() == Some(slug) { return true; }
    }
    ["/points", "/rewards", "/channel-points/channel-settings"].iter().any(|suffix|
        path.strip_prefix("/api/v2/channels/").and_then(|p|p.strip_suffix(suffix))
        .and_then(crate::social_store::slug).map(|slug|path==format!("/api/v2/channels/{slug}{suffix}")).unwrap_or(false))
}

pub fn request_script(token: &str, path: &str) -> Result<String, String> {
    if !allowed_path(path) {
        return Err("Consulta Kick não permitida.".into());
    }
    let token = serde_json::to_string(token).unwrap();
    let path = serde_json::to_string(path).unwrap();
    Ok(format!(
        r#"(async()=>{{
        if(location.origin!=='https://kick.com'||location.pathname!=='/robots.txt')throw Error('Origem Kick inválida');
        const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),12000);
        try{{
            const response=await fetch({path},{{method:'GET',credentials:'include',redirect:'error',signal:abort.signal,
                headers:{{Accept:'application/json',Authorization:'Bearer '+{token},'x-app-platform':'web'}}}});
            const text=await response.text();if(text.length>1048576)throw Error('Resposta grande');
            let raw;try{{raw=JSON.parse(text)}}catch{{}}
            const data=raw?.data||raw;
            return {{status:response.status,body:{path}==='/api/v1/user'
                ?{{id:data?.id,username:data?.username,hint:data?.id?undefined:(response.status+' '+(response.headers.get('content-type')||'')+' '+text.slice(0,160).replace(/\s+/g,' '))}}:{path}.endsWith('/points')?{{data:{{points:data?.points}}}}:{{data}}}};
        }}finally{{clearTimeout(timer)}}
    }})()"#
    ))
}

/// The native protocol callback returns the awaited result without exposing any
/// launcher IPC to kick.com, or returning credentials to the launcher UI.
async fn protocol(
    view: &Webview,
    method: &'static str,
    parameters: Value,
) -> Result<Value, String> {
    #[cfg(windows)]
    {
        use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
        let params = parameters.to_string();
        let (tx, rx) = tokio::sync::oneshot::channel();
        let sender = Arc::new(Mutex::new(Some(tx)));
        view.with_webview(move |native| {
            let callback_sender = sender.clone();
            let callback = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                move |status, result| {
                    let value = status
                        .map_err(|_| "Falha ao consultar Kick.".to_string())
                        .and_then(|_| {
                            // WebView2 may return an empty payload for these void
                            // CDP methods. Runtime.evaluate must still return JSON.
                            if result.trim().is_empty()
                                && matches!(method, "Network.enable" | "Network.setBlockedURLs")
                            {
                                return Ok(json!({}));
                            }
                            let raw: Value = serde_json::from_str(&result)
                                .map_err(|_| "Resposta Kick inválida.".to_string())?;
                            Ok(raw)
                        });
                    if let Some(tx) = callback_sender.lock().unwrap().take() {
                        let _ = tx.send(value);
                    }
                    Ok(())
                },
            ));
            let result = unsafe {
                native.controller().CoreWebView2().and_then(|core| {
                    core.CallDevToolsProtocolMethod(
                        &windows_core::HSTRING::from(method),
                        &windows_core::HSTRING::from(params),
                        &callback,
                    )
                })
            };
            if result.is_err() {
                if let Some(tx) = sender.lock().unwrap().take() {
                    let _ = tx.send(Err("Falha ao consultar Kick.".into()));
                }
            }
        })
        .map_err(|_| "Janela Kick indisponível.".to_string())?;
        return tokio::time::timeout(Duration::from_secs(15), rx)
            .await
            .map_err(|_| "Consulta Kick excedeu o tempo limite.")?
            .map_err(|_| "Consulta Kick encerrada.")?;
    }
    #[cfg(not(windows))]
    {
        let _ = (view, method, parameters);
        Err("Consulta Kick requer WebView2.".into())
    }
}

pub async fn evaluate(view: &Webview, expression: String) -> Result<Value, String> {
    let raw = protocol(
        view,
        "Runtime.evaluate",
        json!({"expression":expression,"awaitPromise":true,"returnByValue":true}),
    )
    .await?;
    if raw.get("exceptionDetails").is_some() {
        return Err("Falha de rede ao consultar Kick.".into());
    }
    raw.pointer("/result/value")
        .cloned()
        .ok_or("Resposta Kick inválida.".into())
}

pub async fn prevent_playback(view: &Webview) -> Result<(), String> {
    mute(view).await?;
    protocol(view, "Network.enable", json!({})).await?;
    protocol(
        view,
        "Network.setBlockedURLs",
        json!({"urls":[
            "*.m3u8*", "*.mpd*", "*.m4s*", "*.mp4*", "*.webm*", "*.aac*",
            "*://*.live-video.net/*", "*://video*.kick.com/*"
        ]}),
    )
    .await?;
    Ok(())
}

pub async fn request(view: &Webview, token: &str, path: &str) -> Result<Value, (String, String)> {
    let script = request_script(token, path).map_err(|e| ("error".into(), e))?;
    let response = evaluate(view, script)
        .await
        .map_err(|e| ("error".into(), e))?;
    let status = response["status"].as_u64().unwrap_or(0);
    if !(200..300).contains(&status) {
        let state = match status {
            401 => "login_required",
            403 => "blocked",
            429 => "rate_limited",
            _ => "error",
        };
        return Err((state.into(), format!("Kick respondeu HTTP {status}.")));
    }
    Ok(response["body"].clone())
}

pub async fn transaction_id(view: &Webview) -> Result<String,String> {
    let value=evaluate(view, r#"(()=>{const c='0123456789ABCDEFGHJKMNPQRSTVWXYZ';let n=Date.now(),s='';for(let i=0;i<10;i++){s=c[n%32]+s;n=Math.floor(n/32)}const b=crypto.getRandomValues(new Uint8Array(16));return s+Array.from(b,v=>c[v&31]).join('')})()"#.into()).await?;
    value.as_str().map(String::from).ok_or("Transação Kick inválida.".into())
}

pub async fn redeem(view: &Webview, token: &str, slug: &str, reward: &str, transaction: &str) -> Result<u64,String> {
    if crate::social_store::slug(slug).as_deref()!=Some(slug) || [reward,transaction].iter().any(|s|s.len()!=26 || !s.bytes().all(|b|b.is_ascii_uppercase()||b.is_ascii_digit())) {
        return Err("Resgate Kick inválido.".into());
    }
    let path=serde_json::to_string(&format!("/api/v2/channels/{slug}/rewards/{reward}/redeem")).unwrap();
    let token=serde_json::to_string(token).unwrap();
    let body=serde_json::to_string(&json!({"transaction_id":transaction}).to_string()).unwrap();
    let script=format!(r#"(async()=>{{if(location.origin!=='https://kick.com'||location.pathname!=='/robots.txt')throw Error('Origem');const a=new AbortController(),t=setTimeout(()=>a.abort(),12000);try{{const r=await fetch({path},{{method:'POST',credentials:'include',redirect:'error',signal:a.signal,headers:{{Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer '+{token},'x-app-platform':'web'}},body:{body}}});return r.status}}finally{{clearTimeout(t)}}}})()"#);
    evaluate(view,script).await?.as_u64().ok_or("Resposta de resgate inválida.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_identity_and_channel_balances_can_be_requested() {
        assert!(allowed_path("/api/v1/user"));
        assert!(allowed_path("/api/v2/channels/biscoitao/points"));
        for p in [
            "https://evil.test",
            "/api/v2/channels/../points",
            "/api/v2/channels/a/points?x=1",
            "/api/v2/channels/A/points",
            "/api/v1/user/delete",
        ] {
            assert!(!allowed_path(p));
        }
    }
}
