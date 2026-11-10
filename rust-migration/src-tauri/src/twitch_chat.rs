use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::{collections::HashSet, sync::Arc, time::Duration};
use tauri::{AppHandle, Emitter};
use tokio::sync::{watch, Mutex, RwLock};
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};

pub fn load_creds() -> Value {
    crate::social_store::load("twitch")
}

pub fn save_creds(data: Value) -> bool {
    crate::social_store::save("twitch", &data).is_ok()
}

#[derive(Clone, PartialEq, Eq)]
struct Config {
    username: String,
    token: String,
    enabled: bool,
}

fn configs(value: &Value) -> Vec<Config> {
    (0..4)
        .map(|i| {
            let acc = &value["accounts"][i];
            Config {
                username: crate::social_store::slug(acc["username"].as_str().unwrap_or(""))
                    .unwrap_or_default(),
                token: acc["token"].as_str().unwrap_or("").trim().to_string(),
                enabled: value["masterEnabled"]
                    .as_bool()
                    .or_else(|| value["enabled"].as_bool())
                    .unwrap_or(false)
                    && acc["enabled"].as_bool().unwrap_or(true),
            }
        })
        .collect()
}

fn valid_token(token: &str) -> bool {
    !token.is_empty() && !token.chars().any(char::is_whitespace)
}

fn authentication_failed(line: &str) -> bool {
    line.starts_with(":tmi.twitch.tv NOTICE ")
        && (line.contains("Login authentication failed")
            || line.contains("Improperly formatted auth"))
}

fn welcomed(line: &str, username: &str) -> bool {
    let words: Vec<_> = line.split_whitespace().collect();
    words.len() >= 3
        && words[0] == ":tmi.twitch.tv"
        && words[1] == "001"
        && words[2].eq_ignore_ascii_case(username)
}

pub struct TwitchChatServiceManager {
    config: RwLock<Vec<Config>>,
    pub save_lock: Mutex<()>,
    status: RwLock<Vec<Value>>,
    tasks: Mutex<Vec<Option<tokio::task::JoinHandle<()>>>>,
    channels: watch::Sender<Vec<Vec<String>>>,
}

impl TwitchChatServiceManager {
    pub fn new() -> Self {
        let (channels, _) = watch::channel(vec![Vec::new(); 4]);
        Self {
            config: RwLock::new(Vec::new()),
            save_lock: Mutex::new(()),
            status: RwLock::new(
                (0..4)
                    .map(|_| {
                        json!({
                            "status": "disconnected",
                            "username": "",
                            "joinedChannels": [],
                            "lastError": ""
                        })
                    })
                    .collect(),
            ),
            tasks: Mutex::new((0..4).map(|_| None).collect()),
            channels,
        }
    }

    pub async fn get_status(&self) -> Value {
        json!({
            "masterEnabled": self.config.read().await.iter().any(|c| c.enabled),
            "accounts": self.status.read().await.clone()
        })
    }

    async fn set_status(
        &self,
        app: Option<&AppHandle>,
        index: usize,
        status: &str,
        joined: &HashSet<String>,
        error: &str,
    ) {
        let mut names: Vec<_> = joined.iter().cloned().collect();
        names.sort();
        let username = self
            .config
            .read()
            .await
            .get(index)
            .map(|c| c.username.clone())
            .unwrap_or_default();

        let next = json!({
            "status": status,
            "username": username,
            "joinedChannels": names,
            "lastError": error
        });

        let mut current = self.status.write().await;
        if current[index] == next {
            return;
        }
        current[index] = next;
        drop(current);

        if let Some(app) = app {
            let _ = app.emit_to("main", "twitch:chat-status", self.get_status().await);
        }
    }

    pub async fn configure(self: &Arc<Self>, app: &AppHandle, value: &Value) {
        let next = configs(value);
        let mut previous = self.config.write().await;
        let mut tasks = self.tasks.lock().await;

        for i in 0..4 {
            if previous.get(i) == Some(&next[i]) {
                continue;
            }
            if let Some(task) = tasks[i].take() {
                task.abort();
                let _ = task.await;
            }

            self.status.write().await[i] = json!({
                "status": "disconnected",
                "username": next[i].username,
                "joinedChannels": [],
                "lastError": ""
            });

            if next[i].enabled {
                if next[i].username.is_empty() || !valid_token(&next[i].token) {
                    self.status.write().await[i] = json!({
                        "status": "login_required",
                        "username": next[i].username,
                        "joinedChannels": [],
                        "lastError": "Configure usuário e token Twitch."
                    });
                } else {
                    let manager = self.clone();
                    let app = app.clone();
                    let cfg = next[i].clone();
                    tasks[i] = Some(tokio::spawn(async move {
                        manager.run(app, i, cfg).await;
                    }));
                }
            }
        }

        *previous = next;
        drop(previous);
        drop(tasks);
        let _ = app.emit_to("main", "twitch:chat-status", self.get_status().await);
    }

    /// Each Twitch identity joins only the channels whose current catalog
    /// offers that account's selected buff. Never broadcast a shared roster.
    pub async fn sync_lives(&self, lives: Vec<Vec<String>>) -> bool {
        let targets: Vec<Vec<String>> = (0..4).map(|index| {
            let mut names: Vec<_> = lives.get(index).into_iter().flatten()
                .filter_map(|s| crate::social_store::slug(s))
                .collect();
            names.sort();
            names.dedup();
            names.truncate(20);
            names
        }).collect();
        if *self.channels.borrow() != targets {
            self.channels.send_replace(targets);
        }
        true
    }

    async fn run(self: Arc<Self>, app: AppHandle, index: usize, cfg: Config) {
        let mut delay = 2;
        loop {
            self.set_status(Some(&app), index, "connecting", &HashSet::new(), "")
                .await;
            let result = self.session(&app, index, &cfg).await;
            let error = result.err().unwrap_or_else(|| "Conexão encerrada.".into());
            let terminal = error == "Token Twitch inválido ou expirado.";
            self.set_status(
                Some(&app),
                index,
                if terminal {
                    "login_required"
                } else {
                    "error"
                },
                &HashSet::new(),
                &error,
            )
            .await;
            if terminal {
                return;
            }
            tokio::time::sleep(Duration::from_secs(delay)).await;
            delay = (delay * 2).min(60);
        }
    }

    async fn session(&self, app: &AppHandle, index: usize, cfg: &Config) -> Result<(), String> {
        self.session_at(Some(app), index, cfg, "wss://irc-ws.chat.twitch.tv:443")
            .await
    }

    async fn session_at(
        &self,
        app: Option<&AppHandle>,
        index: usize,
        cfg: &Config,
        endpoint: &str,
    ) -> Result<(), String> {
        let (mut socket, _) =
            tokio::time::timeout(Duration::from_secs(15), connect_async(endpoint))
                .await
                .map_err(|_| "Tempo de conexão esgotado")?
                .map_err(|_| "Falha ao conectar à Twitch")?;

        let token = cfg.token.trim_start_matches("oauth:");
        for command in [
            "CAP REQ :twitch.tv/membership".to_string(),
            format!("PASS oauth:{}", token),
            format!("NICK {}", cfg.username),
        ] {
            socket
                .send(Message::Text(format!("{}\r\n", command).into()))
                .await
                .map_err(|_| "Falha ao autenticar Twitch")?;
        }

        let mut channels = self.channels.subscribe();
        let mut requested = HashSet::new();
        let mut joined = HashSet::new();
        let mut authenticated = false;
        let mut tick = tokio::time::interval(Duration::from_secs(2));
        let authenticated_deadline = std::time::Instant::now();
        let mut last_message = std::time::Instant::now();

        loop {
            tokio::select! {
                _ = tick.tick() => {
                    if (!authenticated && authenticated_deadline.elapsed() > Duration::from_secs(15))
                        || last_message.elapsed() > Duration::from_secs(360)
                    {
                        return Err("Twitch sem resposta.".into());
                    }
                    if authenticated {
                        let desired: HashSet<_> = channels.borrow_and_update()
                            .get(index).into_iter().flatten().cloned().collect();
                        for channel in requested.difference(&desired) {
                            socket
                                .send(Message::Text(format!("PART #{}\r\n", channel).into()))
                                .await
                                .map_err(|_| "Falha ao sair do canal")?;
                            joined.remove(channel);
                        }
                        for channel in desired.difference(&requested) {
                            socket
                                .send(Message::Text(format!("JOIN #{}\r\n", channel).into()))
                                .await
                                .map_err(|_| "Falha ao entrar no canal")?;
                        }
                        requested = desired;
                        self.set_status(
                            app,
                            index,
                            if requested.is_empty() {
                                "waiting_live"
                            } else if joined.is_empty() {
                                "connecting"
                            } else {
                                "connected"
                            },
                            &joined,
                            "",
                        )
                        .await;
                    }
                }
                message = socket.next() => match message {
                    Some(Ok(Message::Text(text))) => {
                        last_message = std::time::Instant::now();
                        for line in text.lines() {
                            if authentication_failed(line) {
                                return Err("Token Twitch inválido ou expirado.".into());
                            }
                            if line.starts_with("PING ") {
                                socket
                                    .send(Message::Text(format!("PONG {}\r\n", &line[5..]).into()))
                                    .await
                                    .map_err(|_| "Falha PONG")?;
                            }
                            if welcomed(line, &cfg.username) {
                                authenticated = true;
                            }
                            if line.split_whitespace().take(2).eq([":tmi.twitch.tv", "RECONNECT"]) {
                                return Err("Servidor solicitou reconexão.".into());
                            }
                            let words: Vec<_> = line.split_whitespace().collect();
                            if words.len() >= 3 && words[0].starts_with(&format!(":{}!", cfg.username)) {
                                if let Some(channel) = crate::social_store::slug(words[2].trim_start_matches(':')) {
                                    if words[1] == "JOIN" && requested.contains(&channel) {
                                        joined.insert(channel);
                                    } else if words[1] == "PART" {
                                        joined.remove(&channel);
                                    }
                                }
                            }
                        }
                        if authenticated {
                            self.set_status(
                                app,
                                index,
                                if requested.is_empty() {
                                    "waiting_live"
                                } else if joined.is_empty() {
                                    "connecting"
                                } else {
                                    "connected"
                                },
                                &joined,
                                "",
                            )
                            .await;
                        }
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        socket
                            .send(Message::Pong(payload))
                            .await
                            .map_err(|_| "Falha pong")?;
                    }
                    Some(Ok(Message::Close(_))) | None => return Ok(()),
                    Some(Err(_)) => return Err("Conexão Twitch interrompida.".into()),
                    _ => {}
                }
            }
        }
    }

    pub async fn test_connection(username: String, token: String) -> Result<bool, String> {
        let username = crate::social_store::slug(&username).ok_or("Usuário Twitch inválido")?;
        if !valid_token(&token) {
            return Err("Token Twitch inválido".into());
        }
        let (mut socket, _) = tokio::time::timeout(
            Duration::from_secs(15),
            connect_async("wss://irc-ws.chat.twitch.tv:443"),
        )
        .await
        .map_err(|_| "Tempo esgotado")?
        .map_err(|_| "Falha ao conectar")?;

        socket
            .send(Message::Text(
                format!(
                    "PASS oauth:{}\r\nNICK {}\r\n",
                    token.trim_start_matches("oauth:"),
                    username
                )
                .into(),
            ))
            .await
            .map_err(|_| "Falha de autenticação")?;

        tokio::time::timeout(Duration::from_secs(15), async {
            while let Some(message) = socket.next().await {
                if let Ok(Message::Text(text)) = message {
                    for line in text.lines() {
                        if welcomed(line, &username) {
                            let _ = socket.close(None).await;
                            return Ok(true);
                        }
                        if authentication_failed(line) {
                            return Err("Token Twitch inválido ou expirado.".into());
                        }
                        if line.starts_with("PING ") {
                            let _ = socket
                                .send(Message::Text(format!("PONG {}\r\n", &line[5..]).into()))
                                .await;
                        }
                    }
                } else {
                    break;
                }
            }
            Err("Conexão encerrada".into())
        })
        .await
        .map_err(|_| "Tempo esgotado".to_string())?
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn websocket_auth_join_ping_and_channel_changes_require_server_acknowledgement() {
        use tokio_tungstenite::accept_async;
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let manager = Arc::new(TwitchChatServiceManager::new());
        manager.sync_lives(vec![vec!["alpha".into()]]).await;
        let observer = manager.clone();

        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut socket = accept_async(stream).await.unwrap();
            let mut auth = String::new();
            while !auth.contains("NICK fixture") {
                auth.push_str(socket.next().await.unwrap().unwrap().to_text().unwrap());
            }
            assert!(auth.contains("PASS oauth:fixture-token"));
            assert_ne!(
                observer.get_status().await["accounts"][0]["status"],
                "connected"
            );
            socket
                .send(Message::Text(
                    ":tmi.twitch.tv 001 fixture :Welcome, GLHF!\r\n".into(),
                ))
                .await
                .unwrap();
            let join = socket.next().await.unwrap().unwrap();
            assert!(join.to_text().unwrap().contains("JOIN #alpha"));
            assert_ne!(
                observer.get_status().await["accounts"][0]["status"],
                "connected"
            );
            socket
                .send(Message::Text(
                    ":fixture!fixture@fixture.tmi.twitch.tv JOIN #alpha\r\nPING :tmi.twitch.tv\r\n"
                        .into(),
                ))
                .await
                .unwrap();
            let pong = socket.next().await.unwrap().unwrap();
            assert!(pong.to_text().unwrap().starts_with("PONG :tmi.twitch.tv"));

            observer.sync_lives(vec![vec!["beta".into()]]).await;
            let mut commands = String::new();
            while !commands.contains("JOIN #beta") {
                commands.push_str(socket.next().await.unwrap().unwrap().to_text().unwrap());
            }
            assert!(commands.contains("PART #alpha"));
            socket
                .send(Message::Text(
                    ":fixture!fixture@fixture.tmi.twitch.tv JOIN #beta\r\n".into(),
                ))
                .await
                .unwrap();

            for _ in 0..100 {
                if observer.get_status().await["accounts"][0]["joinedChannels"] == json!(["beta"]) {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            assert_eq!(
                observer.get_status().await["accounts"][0]["joinedChannels"],
                json!(["beta"])
            );
            socket.close(None).await.unwrap();
        });

        let config = Config {
            username: "fixture".into(),
            token: "fixture-token".into(),
            enabled: true,
        };
        tokio::time::timeout(
            Duration::from_secs(10),
            manager.session_at(None, 0, &config, &format!("ws://{}", address)),
        )
        .await
        .unwrap()
        .unwrap();
        server.await.unwrap();
    }

    #[test]
    fn welcome_requires_server_numeric_and_expected_identity() {
        assert!(welcomed(":tmi.twitch.tv 001 user :Welcome, GLHF!", "user"));
        assert!(!welcomed(":someone PRIVMSG #x :GLHF", "user"));
        assert!(!welcomed(":tmi.twitch.tv 001 other :Welcome", "user"));
        assert!(authentication_failed(
            ":tmi.twitch.tv NOTICE * :Login authentication failed"
        ));
        assert!(!authentication_failed(
            ":other!other@other PRIVMSG #alpha :Login authentication failed"
        ));
    }

    #[test]
    fn configuration_limits_four_accounts_and_rejects_irc_injection() {
        assert_eq!(
            configs(&json!({"masterEnabled":true,"accounts":[{"username":"foo","token":"abc"}]}))
                .len(),
            4
        );
        assert!(!valid_token("abc\r\nJOIN #bad"));
        assert!(crate::social_store::slug("foo\nPASS abc").is_none());
    }

    #[tokio::test]
    async fn channel_targets_are_isolated_and_switch_with_each_accounts_buff() {
        let manager = TwitchChatServiceManager::new();
        manager.sync_lives(vec![
            vec!["Catch".into(),"@catch".into(),"offline_channel".into()],
            vec!["exp".into()],
            vec![],
            vec!["lure".into()]
        ]).await;
        let first = manager.channels.borrow().clone();
        assert_eq!(first, vec![
            vec!["catch","offline_channel"],
            vec!["exp"],
            Vec::<&str>::new(),
            vec!["lure"]
        ]);
        manager.sync_lives(vec![vec!["exp".into()],vec!["exp".into()]]).await;
        let second = manager.channels.borrow().clone();
        assert_eq!(second,vec![
            vec!["exp"],
            vec!["exp"],
            Vec::<&str>::new(),
            Vec::<&str>::new()
        ]);
    }

    #[test]
    fn status_never_exposes_token_and_includes_username() {
        let manager = TwitchChatServiceManager::new();
        let rt = tokio::runtime::Runtime::new().unwrap();
        let st = rt.block_on(manager.get_status());
        let json_str = serde_json::to_string(&st).unwrap();

        assert!(!json_str.contains("token"));
        assert!(!json_str.contains("oauth:"));

        let accounts = st["accounts"].as_array().unwrap();
        assert_eq!(accounts.len(), 4);
        for acc in accounts {
            assert!(acc.get("username").is_some());
            assert!(acc.get("status").is_some());
            assert!(acc.get("joinedChannels").is_some());
            assert!(acc.get("lastError").is_some());
        }
    }
}
