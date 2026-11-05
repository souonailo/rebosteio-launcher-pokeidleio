//! Read-only Twitch session and browser management through real WebView2 sessions.
//! Uses persistent isolated profile per account and low consumption mechanisms.
use serde_json::{json, Value};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{AppHandle, Manager, Webview, WebviewUrl, WebviewWindowBuilder};

pub const QUERY_URL: &str = "https://www.twitch.tv/robots.txt";
pub const LOGIN_URL: &str = "https://www.twitch.tv/login";
pub const CLIENT_ID: &str = "kimne78kx3ncx6brgo4mv6wki5h1ko";

// Verified against Twitch's public GraphQL schema, including POINTS/BITS and stock flags.
pub const POINTS_CATALOG_QUERY: &str = "query($login: String!) { user(login: $login) { id channel { self { communityPoints { balance } } communityPointsSettings { customRewards { id title prompt cost isEnabled isPaused isInStock isUserInputRequired pricingType cooldownExpiresAt } } } } }";
pub const REDEEM_MUTATION: &str = "mutation($input: RedeemCommunityPointsCustomRewardInput!) { redeemCommunityPointsCustomReward(input: $input) { redemption { id } error { code } } }";

pub fn redemption_script(token: &str, channel: &str, reward: &Value, transaction: &str) -> Result<String, String> {
    let valid_uuid = |value: &str| value.len() == 36 && value.bytes().enumerate().all(|(i,b)| {
        if [8,13,18,23].contains(&i) { b == b'-' } else { b.is_ascii_hexdigit() }
    });
    let id = reward["id"].as_str().ok_or("Recompensa Twitch inválida")?;
    let title = reward["title"].as_str().ok_or("Recompensa Twitch inválida")?;
    let cost = reward["cost"].as_u64().filter(|cost| *cost > 0 && *cost <= 9_007_199_254_740_991).ok_or("Custo Twitch inválido")?;
    let prompt = reward.get("prompt").filter(|p| p.is_string() || p.is_null()).ok_or("Descrição da recompensa Twitch não consultada")?;
    if channel.is_empty() || !channel.bytes().all(|b| b.is_ascii_digit()) || !valid_uuid(id) || !valid_uuid(transaction) {
        return Err("Resgate Twitch inválido".into());
    }
    gql_request_script(token, REDEEM_MUTATION, &json!({"input": {
        "channelID":channel, "rewardID":id, "cost":cost, "title":title,
        "prompt":prompt, "transactionID":transaction
    }}))
}

/// Persisted query hashes for approved GQL operations
pub const HASH_CHANNEL_POINTS_CONTEXT: &str =
    "7fe050e3761eb2cf258d70ee1a21cbd76fa8cf3d7e7b12fc437e7029d446b5e3";
pub const HASH_CLAIM_COMMUNITY_POINTS: &str =
    "46aaeebe02c99afdf4fc97c7c0cba964124bf6b0af229395f1f6d1feed05b3d0";
pub const HASH_PLAYBACK_ACCESS_TOKEN: &str =
    "ed230aa1e33e07eebb8928504583da78a5173989fadfb1ac94be06a04f3cdbe9";

/// Isolated persistent profile directory per account.
pub fn profile(index: usize) -> PathBuf {
    crate::webview_manager::get_account_profile_dir(index)
}

fn legacy_profile(index: usize) -> PathBuf {
    crate::credentials::get_app_data_dir()
        .join("twitch-profiles")
        .join(format!("conta_{}", index + 1))
}

/// Read only Twitch's session cookie through WebView2, never the cookie database.
pub fn session_cookie(view: &Webview) -> Result<Option<tauri::webview::Cookie<'static>>, String> {
    let cookies = view.cookies_for_url("https://www.twitch.tv/".parse().unwrap())
        .map_err(|_| "Não foi possível consultar a sessão Twitch salva.".to_string())?;
    Ok(cookies.into_iter().find(usable_session_cookie))
}

pub fn usable_session_cookie(cookie: &tauri::webview::Cookie<'_>) -> bool {
    let domain = cookie.domain().unwrap_or("").trim_start_matches('.');
    cookie.name() == "auth-token" && !cookie.value().is_empty()
        && ["twitch.tv", "www.twitch.tv"].contains(&domain)
        && cookie.expires_datetime().is_none_or(|expiry| expiry.unix_timestamp() >
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64)
}

/// Migration sources: this slot's old Twitch profile and the old game auth profile.
/// Callers MUST verify currentUser against the linked username before persisting a cookie.
pub fn saved_session_candidates(app: &AppHandle, index: usize) -> Result<Vec<tauri::webview::Cookie<'static>>, String> {
    if index >= 4 { return Err("Conta Twitch inválida".into()); }
    let mut candidates = Vec::new();
    // auth-window previously used the default profile; main still owns that same store.
    // Never scan game-account-N or auth-window-N belonging to another account.
    for label in [format!("auth-window-{index}"), "main".to_string()] {
        if let Some(view) = app.get_webview(&label) {
            if let Some(cookie) = session_cookie(&view)? {
                if !candidates.iter().any(|existing: &tauri::webview::Cookie<'static>| existing.value() == cookie.value()) { candidates.push(cookie); }
            }
        }
    }
    if legacy_profile(index).is_dir() {
        let label = format!("twitch-legacy-session-{index}");
        let guard = QueryWindow { app: app.clone(), label: label.clone() };
        let proxy = crate::account_proxy::for_account(index)?;
        let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::External("about:blank".parse().unwrap()))
            .visible(false).focused(false).skip_taskbar(true).focusable(false)
            .data_directory(legacy_profile(index))
            .additional_browser_args(&crate::webview_memory::browser_args(proxy.as_ref().map(|p| &p.url)))
            .on_navigation(|url| url.as_str() == "about:blank");
        if let Some(proxy) = &proxy { builder = builder.proxy_url(proxy.url.clone()); }
        match builder.build() {
            Ok(_) => {
                if let Some(cookie) = session_cookie(&guard.view()?)? {
                    if !candidates.iter().any(|existing| existing.value() == cookie.value()) { candidates.insert(0, cookie); }
                }
            }
            Err(_) if candidates.is_empty() => return Err("Não foi possível consultar a sessão Twitch anterior.".into()),
            Err(_) => {} // A usable shared auth source remains available for identity verification.
        }
    }
    Ok(candidates)
}

/// Validates channel slug and returns official Twitch URL.
pub fn official_url(channel: &str) -> Result<url::Url, String> {
    if channel.is_empty() {
        return url::Url::parse("https://www.twitch.tv/").map_err(|e| e.to_string());
    }
    if channel == "login" {
        return url::Url::parse(LOGIN_URL).map_err(|e| e.to_string());
    }
    let slug = crate::social_store::slug(channel).ok_or("Canal Twitch inválido")?;
    url::Url::parse(&format!("https://www.twitch.tv/{slug}")).map_err(|e| e.to_string())
}

/// Query window wrapper that ensures the background webview is destroyed upon drop.
pub struct QueryWindow {
    app: AppHandle,
    label: String,
}

impl QueryWindow {
    pub fn view(&self) -> Result<Webview, String> {
        self.app
            .get_webview(&self.label)
            .ok_or("Consulta Twitch encerrada.".into())
    }
}

impl Drop for QueryWindow {
    fn drop(&mut self) {
        if let Some(window) = self.app.get_webview_window(&self.label) {
            let _ = window.destroy();
        }
    }
}

/// Spawns a lightweight, off-screen query window loaded on an inert document (`robots.txt`)
/// with media and video stream loading blocked.
pub async fn query_window(app: &AppHandle, index: usize) -> Result<QueryWindow, String> {
    if index >= 4 {
        return Err("Conta Twitch inválida".into());
    }
    let label = format!("twitch-query-{}", index);
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

    let proxy_url_ref = proxy.as_ref().map(|p| &p.url);
    builder = builder.additional_browser_args(&crate::webview_memory::browser_args(proxy_url_ref));
    if let Some(p) = &proxy {
        builder = builder.proxy_url(p.url.clone());
    }

    builder
        .title("Consulta Twitch")
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .focusable(false)
        .data_directory(profile(index))
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
        .map_err(|_| "Não foi possível abrir a consulta Twitch.".to_string())?;

    let view = guard.view()?;
    crate::account_proxy::authenticate(&view, proxy.as_ref()).await?;
    prevent_playback(&view).await?;
    view.navigate(QUERY_URL.parse().unwrap())
        .map_err(|_| "Não foi possível carregar a consulta Twitch.")?;

    tokio::time::timeout(Duration::from_secs(20), rx)
        .await
        .map_err(|_| "A consulta Twitch excedeu o tempo limite.")?
        .map_err(|_| "A consulta Twitch foi encerrada.")?;

    Ok(guard)
}

/// Mutes all audio from the webview using native CoreWebView2 SetIsMuted on Windows.
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
            let _ = tx.send(
                result.map_err(|_| "Não foi possível silenciar a janela Twitch.".to_string()),
            );
        })
        .map_err(|_| "Janela Twitch indisponível.".to_string())?;
        return tokio::time::timeout(Duration::from_secs(5), rx)
            .await
            .map_err(|_| "Janela Twitch indisponível.")?
            .map_err(|_| "Janela Twitch encerrada.")?;
    }
    #[cfg(not(windows))]
    {
        let _ = view;
        Ok(())
    }
}

/// Native protocol method execution via WebView2 CDP.
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
                        .map_err(|_| "Falha ao consultar Twitch via CDP.".to_string())
                        .and_then(|_| {
                            if result.trim().is_empty()
                                && matches!(method, "Network.enable" | "Network.setBlockedURLs")
                            {
                                return Ok(json!({}));
                            }
                            let raw: Value = serde_json::from_str(&result)
                                .map_err(|_| "Resposta Twitch inválida.".to_string())?;
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
                    let _ = tx.send(Err("Falha ao invocar protocolo Twitch.".into()));
                }
            }
        })
        .map_err(|_| "Janela Twitch indisponível.".to_string())?;

        return tokio::time::timeout(Duration::from_secs(15), rx)
            .await
            .map_err(|_| "Consulta Twitch excedeu o tempo limite.")?
            .map_err(|_| "Consulta Twitch encerrada.")?;
    }
    #[cfg(not(windows))]
    {
        let _ = (view, method, parameters);
        Err("Consulta Twitch requer WebView2.".into())
    }
}

/// Evaluates a JavaScript expression within the webview context.
pub async fn evaluate(view: &Webview, expression: String) -> Result<Value, String> {
    let raw = protocol(
        view,
        "Runtime.evaluate",
        json!({"expression": expression, "awaitPromise": true, "returnByValue": true}),
    )
    .await?;
    if raw.get("exceptionDetails").is_some() {
        return Err("Falha de execução na consulta Twitch.".into());
    }
    raw.pointer("/result/value")
        .cloned()
        .ok_or("Resposta Twitch vazia.".into())
}

/// Blocks media and stream video loading for query windows.
pub async fn prevent_playback(view: &Webview) -> Result<(), String> {
    mute(view).await?;
    protocol(view, "Network.enable", json!({})).await?;
    protocol(
        view,
        "Network.setBlockedURLs",
        json!({
            "urls": [
                "*.m3u8*", "*.mpd*", "*.m4s*", "*.mp4*", "*.webm*", "*.aac*",
                "*://video-*.twitch.tv/*", "*://*.ttvnw.net/*", "*://*.hls.ttvnw.net/*"
            ]
        }),
    )
    .await?;
    Ok(())
}

/// Validates that an API path is safe and allowed.
pub fn allowed_path(path: &str) -> bool {
    path == "/gql" || path == "/helix/users"
}

/// Returns the sha256 hash for proven persisted Twitch GQL operations.
pub fn operation_hash(operation: &str) -> Option<&'static str> {
    match operation {
        "ChannelPointsContext" => Some(HASH_CHANNEL_POINTS_CONTEXT),
        "ClaimCommunityPoints" => Some(HASH_CLAIM_COMMUNITY_POINTS),
        "PlaybackAccessToken" => Some(HASH_PLAYBACK_ACCESS_TOKEN),
        _ => None,
    }
}

/// Generates a client-side fetch script for Twitch GQL operations using proven Persisted Queries or verified text queries.
pub fn gql_request_script(
    token: &str,
    operation_or_query: &str,
    variables: &Value,
) -> Result<String, String> {
    let token_esc = serde_json::to_string(token).unwrap();
    let vars_esc = serde_json::to_string(variables).unwrap();

    let payload_js = if let Some(hash) = operation_hash(operation_or_query) {
        let op_esc = serde_json::to_string(operation_or_query).unwrap();
        let hash_esc = serde_json::to_string(hash).unwrap();
        format!(
            r#"JSON.stringify({{
                operationName: {op_esc},
                variables: {vars_esc},
                extensions: {{
                    persistedQuery: {{
                        version: 1,
                        sha256Hash: {hash_esc}
                    }}
                }}
            }})"#
        )
    } else if operation_or_query.trim_start().starts_with("query")
        || operation_or_query.trim_start().starts_with("mutation")
    {
        let query_esc = serde_json::to_string(operation_or_query).unwrap();
        format!(
            r#"JSON.stringify({{
                query: {query_esc},
                variables: {vars_esc}
            }})"#
        )
    } else {
        return Err("Operação Twitch GQL não permitida ou sem hash/query.".into());
    };

    Ok(format!(
        r#"(async () => {{
            if (location.origin !== 'https://www.twitch.tv' || location.pathname !== '/robots.txt') {{
                throw new Error('Origem Twitch inválida');
            }}
            const abort = new AbortController();
            const timer = setTimeout(() => abort.abort(), 12000);
            try {{
                const headers = {{
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Client-Id': '{CLIENT_ID}'
                }};
                if ({token_esc}) {{
                    headers['Authorization'] = 'OAuth ' + {token_esc};
                }}
                const response = await fetch('https://gql.twitch.tv/gql', {{
                    method: 'POST',
                    // GQL allows cross-origin requests with ACAO: *, which rejects
                    // credentialed fetches. Authentication uses the saved session's
                    // OAuth header; browser cookies stay in the account profile.
                    credentials: 'omit',
                    headers,
                    body: {payload_js},
                    signal: abort.signal
                }});
                const text = await response.text();
                let raw;
                try {{ raw = JSON.parse(text); }} catch(e) {{}}
                return {{ status: response.status, body: raw || text }};
            }} finally {{
                clearTimeout(timer);
            }}
        }})()"#
    ))
}

/// Encodes minute-watched telemetry payload for spade.twitch.tv/track.
pub fn encode_spade_payload(
    user_id: &str,
    channel_id: &str,
    broadcast_id: &str,
    channel_slug: &str,
) -> String {
    use base64::Engine;
    let payload = json!([
        {
            "event": "minute-watched",
            "properties": {
                "channel_id": channel_id,
                "broadcast_id": broadcast_id,
                "player": "site",
                "user_id": user_id,
                "live": true,
                "channel": channel_slug
            }
        }
    ]);
    base64::engine::general_purpose::STANDARD.encode(payload.to_string())
}

/// Posts minute-watched event to Twitch telemetry endpoint spade.twitch.tv/track.
pub async fn send_spade_minute_watched(
    client: &reqwest::Client,
    endpoint: &str,
    encoded_payload: &str,
) -> Result<bool, String> {
    if !valid_spade_endpoint(endpoint) {
        return Err("Destino Twitch não permitido.".into());
    }
    let resp = client
        .post(endpoint)
        .form(&[("data", encoded_payload)])
        .send()
        .await
        .map_err(|_| "Falha de rede no modo experimental Twitch.".to_string())?;

    Ok(resp.status().is_success())
}

fn valid_spade_endpoint(endpoint: &str) -> bool {
    url::Url::parse(endpoint).ok().is_some_and(|url| {
        url.scheme() == "https"
            && url.host_str() == Some("spade.twitch.tv")
            && url.path() == "/track"
            && url.username().is_empty()
            && url.password().is_none()
            && url.port_or_known_default() == Some(443)
    })
}

fn settings_url(page: &str) -> Option<String> {
    page.split(['"', '\'', '<', '>', ' ', '\n', '\r'])
        .find_map(|part| {
            let url = url::Url::parse(part).ok()?;
            (url.scheme() == "https"
                && matches!(
                    url.host_str(),
                    Some("assets.twitch.tv" | "static.twitchcdn.net")
                )
                && url.username().is_empty()
                && url.password().is_none()
                && url.port_or_known_default() == Some(443)
                && url.path().starts_with("/config/settings")
                && url.path().ends_with(".js")
                && !url.path().trim_start_matches("/config/").contains('/'))
            .then(|| url.to_string())
        })
}

fn spade_url(settings: &str) -> Option<String> {
    let tail = settings
        .split_once("\"spade_url\"")?
        .1
        .trim_start()
        .strip_prefix(':')?
        .trim_start();
    let endpoint = tail.strip_prefix('"')?.split('"').next()?;
    valid_spade_endpoint(endpoint).then(|| endpoint.to_string())
}

async fn limited_text(client: &reqwest::Client, url: &str) -> Result<String, String> {
    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|_| "Consulta pública Twitch falhou.")?;
    if !response.status().is_success() {
        return Err("Consulta pública Twitch recusada.".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Resposta Twitch interrompida.")?
    {
        if bytes.len() + chunk.len() > 2 * 1024 * 1024 {
            return Err("Resposta Twitch excedeu o limite.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    String::from_utf8(bytes).map_err(|_| "Resposta Twitch inválida.".into())
}

pub async fn discover_spade_endpoint(
    client: &reqwest::Client,
    channel: &str,
) -> Result<String, String> {
    let channel = crate::social_store::slug(channel).ok_or("Canal Twitch inválido")?;
    let page = limited_text(client, &format!("https://www.twitch.tv/{channel}")).await?;
    let settings =
        settings_url(&page).ok_or("Configuração do modo experimental não encontrada.")?;
    let body = limited_text(client, &settings).await?;
    spade_url(&body).ok_or("Endpoint do modo experimental não encontrado.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_recovery_rejects_expired_empty_and_unrelated_cookies() {
        let expired = tauri::webview::Cookie::parse("auth-token=expired; Domain=.twitch.tv; Expires=Thu, 01 Jan 1970 00:00:00 GMT").unwrap();
        assert!(!usable_session_cookie(&expired));
        let empty = tauri::webview::Cookie::build(("auth-token", "")).domain(".twitch.tv").build();
        assert!(!usable_session_cookie(&empty));
        let unrelated = tauri::webview::Cookie::build(("game-session", "fixture")).domain(".pokeidle.io").build();
        assert!(!usable_session_cookie(&unrelated));
    }

    #[test]
    fn discovery_only_accepts_twitch_configuration_and_telemetry_hosts() {
        assert_eq!(
            settings_url(
                r#"<script src="https://assets.twitch.tv/config/settings.fixture.js"></script>"#
            )
            .unwrap(),
            "https://assets.twitch.tv/config/settings.fixture.js"
        );
        assert!(settings_url(
            r#"<script src="https://assets.twitch.tv.evil/config/settings.fixture.js"></script>"#
        )
        .is_none());
        assert!(
            settings_url("https://user:secret@assets.twitch.tv/config/settings.fixture.js")
                .is_none()
        );
        assert_eq!(
            spade_url(r#"{"spade_url":"https://spade.twitch.tv/track"}"#).unwrap(),
            "https://spade.twitch.tv/track"
        );
        assert!(spade_url(r#"{"spade_url":"http://spade.twitch.tv/track"}"#).is_none());
        assert!(!valid_spade_endpoint("https://spade.twitch.tv.evil/track"));
        assert!(!valid_spade_endpoint("https://spade.twitch.tv:1234/track"));
    }

    #[test]
    fn official_url_validates_channels_and_rejects_injections() {
        assert_eq!(
            official_url("").unwrap().as_str(),
            "https://www.twitch.tv/"
        );
        assert_eq!(
            official_url("login").unwrap().as_str(),
            "https://www.twitch.tv/login"
        );
        assert_eq!(
            official_url("biscoitao").unwrap().as_str(),
            "https://www.twitch.tv/biscoitao"
        );
        assert_eq!(
            official_url("@streamer").unwrap().as_str(),
            "https://www.twitch.tv/streamer"
        );
        assert_eq!(
            official_url("#streamer").unwrap().as_str(),
            "https://www.twitch.tv/streamer"
        );

        assert!(official_url("../evil").is_err());
        assert!(official_url("channel with spaces").is_err());
        assert!(official_url("bad/path").is_err());
        assert!(official_url("javascript:alert(1)").is_err());
    }

    #[test]
    fn profile_paths_are_isolated_per_account() {
        let p0 = profile(0);
        let p1 = profile(1);
        let p2 = profile(2);
        let p3 = profile(3);

        assert!(p0.to_string_lossy().ends_with("conta_1"));
        assert!(p1.to_string_lossy().ends_with("conta_2"));
        assert!(p2.to_string_lossy().ends_with("conta_3"));
        assert!(p3.to_string_lossy().ends_with("conta_4"));
        assert_ne!(p0, p1);
        assert_ne!(p1, p2);
        assert_ne!(p2, p3);
        for index in 0..4 {
            assert_eq!(profile(index), crate::webview_manager::get_account_profile_dir(index));
            assert_ne!(profile(index), legacy_profile(index));
        }
    }

    #[test]
    fn allowed_paths_and_operations() {
        assert!(allowed_path("/gql"));
        assert!(allowed_path("/helix/users"));
        assert!(!allowed_path("/evil"));
        assert!(!allowed_path("https://attacker.com/gql"));

        assert_eq!(
            operation_hash("ChannelPointsContext"),
            Some(HASH_CHANNEL_POINTS_CONTEXT)
        );
        assert_eq!(
            operation_hash("ClaimCommunityPoints"),
            Some(HASH_CLAIM_COMMUNITY_POINTS)
        );
        assert_eq!(
            operation_hash("PlaybackAccessToken"),
            Some(HASH_PLAYBACK_ACCESS_TOKEN)
        );
        assert_eq!(operation_hash("UnknownOperation"), None);
    }

    #[test]
    fn gql_request_script_embeds_persisted_hash_and_supports_text_query() {
        let script = gql_request_script(
            "token123",
            "ChannelPointsContext",
            &json!({"channelLogin": "test"}),
        )
        .unwrap();
        assert!(script.contains(HASH_CHANNEL_POINTS_CONTEXT));
        assert!(script.contains("ChannelPointsContext"));
        assert!(script.contains("token123"));
        assert!(script.contains("persistedQuery"));

        let text_script =
            gql_request_script("token123", "query { currentUser { id login } }", &json!({}))
                .unwrap();
        assert!(text_script.contains("currentUser"));
        assert!(text_script.contains("token123"));
        // Twitch GQL responds with Access-Control-Allow-Origin: * and no
        // Access-Control-Allow-Credentials; include would fail before reading HTTP.
        assert!(text_script.contains("credentials: 'omit'"));
        assert!(!text_script.contains("credentials: 'include'"));
        assert!(text_script.contains("headers['Authorization'] = 'OAuth '"));
    }

    #[test]
    fn redemption_includes_exact_prompt_and_supports_long_rewards() {
        let reward = json!({"id":"12345678-1234-1234-1234-123456789abc","title":"Secret Lure (10h)","prompt":"10 horas no PokeIdle. As horas acumulam.","cost":10000});
        let script = redemption_script("fixture", "113009449", &reward, "12345678-1234-1234-1234-123456789abc").unwrap();
        assert!(script.contains("10 horas no PokeIdle. As horas acumulam."));
        assert!(script.contains("10000"));
        assert!(script.contains("redemption { id }"));
        let mut missing = reward.clone(); missing.as_object_mut().unwrap().remove("prompt");
        assert!(redemption_script("fixture", "113009449", &missing, "12345678-1234-1234-1234-123456789abc").is_err());
    }

    #[test]
    fn spade_payload_encoding() {
        use base64::Engine;
        let encoded = encode_spade_payload("12345", "67890", "999", "streamer");
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .unwrap();
        let val: Value = serde_json::from_slice(&decoded).unwrap();
        assert_eq!(val[0]["event"], "minute-watched");
        assert_eq!(val[0]["properties"]["channel_id"], "67890");
        assert_eq!(val[0]["properties"]["user_id"], "12345");
        assert_eq!(val[0]["properties"]["channel"], "streamer");
    }
}
