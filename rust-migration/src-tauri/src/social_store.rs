use serde_json::{json, Value};
use std::{fs, path::PathBuf};
fn path(platform: &str) -> PathBuf {
    crate::credentials::get_app_data_dir()
        .join(format!("{}-creds.enc", platform))
}
pub fn try_load(platform: &str) -> Result<Value, String> {
    let file = path(platform);
    let mut value: Value = match fs::read(&file) {
        Ok(bytes) => crate::credentials::dpapi_decrypt(&bytes)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .or_else(|| serde_json::from_slice(&bytes).ok())
            .ok_or("Configuração social ilegível; o arquivo foi preservado.")?,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            json!({"masterEnabled":false,"accounts":[{},{},{},{}]})
        }
        Err(_) => {
            return Err(
                "Não foi possível ler a configuração social; o arquivo foi preservado.".into(),
            )
        }
    };
    if !value.is_object() || !value["accounts"].is_array() {
        return Err("Configuração social inválida; o arquivo foi preservado.".into());
    }
    if value.get("masterEnabled").is_none() {
        value["masterEnabled"] = json!(value["enabled"].as_bool().unwrap_or(false));
    }
    Ok(value)
}
pub fn load(platform: &str) -> Value {
    try_load(platform).unwrap_or_else(|_| json!({"masterEnabled":false,"accounts":[{},{},{},{}]}))
}
pub fn save(platform: &str, value: &Value) -> Result<(), String> {
    static SAVE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _lock = SAVE_LOCK
        .lock()
        .map_err(|_| "Falha no armazenamento de credenciais")?;
    let path = path(platform);
    fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let bytes = serde_json::to_vec(value).map_err(|e| e.to_string())?;
    let encrypted = crate::credentials::dpapi_encrypt(&bytes)?;
    let temp = path.with_extension("tmp");
    fs::write(&temp, encrypted).map_err(|e| e.to_string())?;
    fs::rename(temp, path).map_err(|e| e.to_string())
}
pub fn slug(value: &str) -> Option<String> {
    let value = value
        .trim()
        .trim_start_matches(['@', '#'])
        .to_ascii_lowercase();
    (!value.is_empty()
        && value.len() <= 40
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-'))
    .then_some(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_slug_normalization() {
        assert_eq!(slug("@Streamer"), Some("streamer".to_string()));
        assert_eq!(slug("#streamer"), Some("streamer".to_string()));
        assert_eq!(slug(""), None);
        assert_eq!(slug("invalid/user"), None);
        assert_eq!(slug("valid_user-123"), Some("valid_user-123".to_string()));
    }
}
