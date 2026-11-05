use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::collections::HashMap;

#[derive(Clone, Serialize, Deserialize)]
pub struct SavedSession {
    pub email: String,
    pub token: String,
    pub nick: Option<String>,
}

// Separate from accounts.enc: session handoff never rewrites saved credentials.
pub fn load_sessions() -> HashMap<usize, SavedSession> {
    let path = get_app_data_dir().join("sessions.enc");
    let accounts = load_accounts();
    fs::read(path).ok().and_then(|b| dpapi_decrypt(&b).ok())
        .and_then(|b| serde_json::from_slice::<HashMap<usize, SavedSession>>(&b).ok())
        .unwrap_or_default().into_iter().filter(|(i, s)| {
            !s.token.is_empty() && accounts.get(*i).and_then(|a| a.email.as_deref()) == Some(s.email.as_str())
        }).collect()
}

pub fn save_session(index: usize, token: String, nick: Option<String>) -> Result<(), String> {
    static SAVE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _lock = SAVE_LOCK.lock().map_err(|e| e.to_string())?;
    let accounts = load_accounts();
    let email = accounts.get(index).and_then(|a| a.email.clone()).filter(|s| !s.is_empty()).ok_or("Conta não cadastrada")?;
    let mut sessions = load_sessions();
    sessions.insert(index, SavedSession {email, token, nick});
    let dir = get_app_data_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let encrypted = dpapi_encrypt(&serde_json::to_vec(&sessions).map_err(|e| e.to_string())?)?;
    let temp = dir.join("sessions.enc.tmp");
    fs::write(&temp, encrypted).map_err(|e| e.to_string())?;
    fs::rename(temp, dir.join("sessions.enc")).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Account {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub senha: Option<String>,
    #[serde(default)]
    pub proxy: Option<serde_json::Value>,
}

pub fn get_instance_id() -> usize {
    if let Ok(val) = std::env::var("PIO_INSTANCE") {
        if let Ok(id) = val.trim().parse::<usize>() {
            if id > 0 {
                return id;
            }
        }
    }
    let args: Vec<String> = std::env::args().collect();
    for i in 0..args.len() {
        if let Some(stripped) = args[i].strip_prefix("--instance=") {
            if let Ok(id) = stripped.trim().parse::<usize>() {
                if id > 0 {
                    return id;
                }
            }
        }
        if args[i] == "--instance" && i + 1 < args.len() {
            if let Ok(id) = args[i + 1].trim().parse::<usize>() {
                if id > 0 {
                    return id;
                }
            }
        }
    }
    1
}

pub fn get_app_data_dir() -> PathBuf {
    let id = get_instance_id();
    let folder = if id > 1 {
        format!("pionailo-instancia-{}", id)
    } else {
        "pionailo".to_string()
    };
    if let Some(roaming) = std::env::var_os("APPDATA") {
        PathBuf::from(roaming).join(folder)
    } else {
        PathBuf::from(".").join("data").join(folder)
    }
}

fn get_creds_path() -> PathBuf {
    get_app_data_dir().join("accounts.enc")
}

#[cfg(test)]
mod path_tests {
    use super::*;

    #[test]
    fn session_path_child() {
        let Ok(expected) = std::env::var("PIO_EXPECTED_DATA_DIR") else { return; };
        let expected = PathBuf::from(expected);
        assert_eq!(get_app_data_dir(), expected);
        assert_eq!(get_creds_path(), expected.join("accounts.enc"));
        for index in 0..4 {
            assert_eq!(crate::webview_manager::get_account_profile_dir(index),
                expected.join("profiles").join(format!("conta_{}", index + 1)));
        }
    }

    #[test]
    fn sessions_and_profiles_are_independent_of_working_directory() {
        // Separate processes avoid changing environment/cwd for concurrent tests.
        let appdata = std::env::temp_dir().join("PIO session path test");
        let exe = std::env::current_exe().unwrap();
        for cwd in [std::env::temp_dir(), exe.parent().unwrap().to_path_buf()] {
            for instance in [1, 2] {
                let folder = if instance == 1 { "pionailo".to_string() }
                    else { format!("pionailo-instancia-{}", instance) };
                let result = std::process::Command::new(&exe)
                    .args(["--exact", "credentials::path_tests::session_path_child"])
                    .current_dir(&cwd)
                    .env("APPDATA", &appdata)
                    .env("PIO_INSTANCE", instance.to_string())
                    .env("PIO_EXPECTED_DATA_DIR", appdata.join(folder))
                    .output().unwrap();
                assert!(result.status.success(), "{}", String::from_utf8_lossy(&result.stdout));
            }
        }
    }
}

#[cfg(windows)]
pub fn dpapi_encrypt(data: &[u8]) -> Result<Vec<u8>, String> {
    use windows::Win32::Foundation::HLOCAL;
    use windows::Win32::Foundation::LocalFree;
    use windows::Win32::Security::Cryptography::{CryptProtectData, CRYPT_INTEGER_BLOB};
    use std::ptr::null_mut;

    let in_blob = CRYPT_INTEGER_BLOB {
        cbData: data.len() as u32,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut out_blob = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
    };

    unsafe {
        let res = CryptProtectData(
            &in_blob,
            None,
            None,
            None,
            None,
            0,
            &mut out_blob,
        );
        if res.is_err() {
            return Err("Falha na chamada DPAPI CryptProtectData".to_string());
        }
        let slice = std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize);
        let result = slice.to_vec();
        let _ = LocalFree(Some(HLOCAL(out_blob.pbData as _)));
        Ok(result)
    }
}

#[cfg(windows)]
pub fn dpapi_decrypt(data: &[u8]) -> Result<Vec<u8>, String> {
    use windows::Win32::Foundation::HLOCAL;
    use windows::Win32::Foundation::LocalFree;
    use windows::Win32::Security::Cryptography::{CryptUnprotectData, CRYPT_INTEGER_BLOB};
    use std::ptr::null_mut;

    let in_blob = CRYPT_INTEGER_BLOB {
        cbData: data.len() as u32,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut out_blob = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
    };

    unsafe {
        let res = CryptUnprotectData(
            &in_blob,
            None,
            None,
            None,
            None,
            0,
            &mut out_blob,
        );
        if res.is_err() {
            return Err("Falha na chamada DPAPI CryptUnprotectData".to_string());
        }
        let slice = std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize);
        let result = slice.to_vec();
        let _ = LocalFree(Some(HLOCAL(out_blob.pbData as _)));
        Ok(result)
    }
}

#[cfg(not(windows))]
pub fn dpapi_encrypt(data: &[u8]) -> Result<Vec<u8>, String> {
    Ok(data.to_vec())
}

#[cfg(not(windows))]
pub fn dpapi_decrypt(data: &[u8]) -> Result<Vec<u8>, String> {
    Ok(data.to_vec())
}

pub fn load_accounts() -> Vec<Account> {
    let path = get_creds_path();
    if !path.exists() {
        return (0..4)
            .map(|i| Account {
                name: Some(format!("Conta {}", i + 1)),
                email: Some("".to_string()),
                senha: Some("".to_string()),
                proxy: None,
            })
            .collect();
    }

    match fs::read(&path) {
        Ok(encrypted_bytes) => {
            // Tenta descriptografar via DPAPI
            match dpapi_decrypt(&encrypted_bytes) {
                Ok(plain_bytes) => {
                    if let Ok(accounts) = serde_json::from_slice::<Vec<Account>>(&plain_bytes) {
                        return accounts;
                    }
                }
                Err(_) => {
                    // Se falhar a descriptografia, tenta interpretar como JSON plano (em caso de migracao)
                    if let Ok(accounts) = serde_json::from_slice::<Vec<Account>>(&encrypted_bytes) {
                        return accounts;
                    }
                }
            }
        }
        Err(_) => {}
    }

    (0..4)
        .map(|i| Account {
            name: Some(format!("Conta {}", i + 1)),
            email: Some("".to_string()),
            senha: Some("".to_string()),
            proxy: None,
        })
        .collect()
}

pub fn save_accounts(accounts: Vec<Account>) -> Result<(), String> {
    let dir = get_app_data_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }

    let json_bytes = serde_json::to_vec(&accounts).map_err(|e| e.to_string())?;
    let encrypted = dpapi_encrypt(&json_bytes)?;

    let path = get_creds_path();
    let tmp_path = dir.join("accounts.enc.tmp");

    fs::write(&tmp_path, &encrypted).map_err(|e| e.to_string())?;
    fs::rename(&tmp_path, &path).map_err(|e| e.to_string())?;

    Ok(())
}
