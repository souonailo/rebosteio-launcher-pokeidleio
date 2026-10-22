// Pasta "claude" do fork: o grid grava extrações, logs e configurações; o Claude lê e deixa pedidos em "aplicar".
// Todas as rotas são relativas a essa pasta e não podem sair dela.
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};

fn raiz() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("PIO_CLAUDE_DIR") {
        if !p.trim().is_empty() { return Some(PathBuf::from(p)); }
    }
    // Sobe a partir da pasta atual e do executável até achar a raiz do fork (onde está "Abrir PIO Rebosteio.bat").
    let mut bases: Vec<PathBuf> = Vec::new();
    if let Ok(d) = std::env::current_dir() { bases.push(d); }
    if let Ok(e) = std::env::current_exe() { if let Some(d) = e.parent() { bases.push(d.to_path_buf()); } }
    for b in bases {
        let mut cur: Option<&Path> = Some(b.as_path());
        while let Some(d) = cur {
            if d.join("Abrir PIO Rebosteio.bat").exists() { return Some(d.join("claude")); }
            cur = d.parent();
        }
    }
    None
}

fn caminho(rel: &str) -> Result<PathBuf, String> {
    let base = raiz().ok_or("pasta do fork não encontrada")?;
    let r = Path::new(rel);
    if r.is_absolute() || rel.contains(':') { return Err("caminho inválido".into()); }
    for c in r.components() {
        match c { Component::Normal(_) => {}, _ => return Err("caminho inválido".into()) }
    }
    Ok(base.join(r))
}

#[tauri::command]
pub fn pio_pasta() -> Option<String> { raiz().map(|p| p.to_string_lossy().to_string()) }

#[tauri::command]
pub fn pio_salvar(rel: String, conteudo: String, anexar: Option<bool>) -> Result<bool, String> {
    let p = caminho(&rel)?;
    if let Some(d) = p.parent() { fs::create_dir_all(d).map_err(|e| e.to_string())?; }
    if anexar.unwrap_or(false) {
        let mut f = fs::OpenOptions::new().create(true).append(true).open(&p).map_err(|e| e.to_string())?;
        f.write_all(conteudo.as_bytes()).map_err(|e| e.to_string())?;
    } else {
        let tmp = p.with_extension("tmp-pio");
        fs::write(&tmp, conteudo.as_bytes()).map_err(|e| e.to_string())?;
        fs::rename(&tmp, &p).map_err(|e| e.to_string())?;
    }
    Ok(true)
}

#[tauri::command]
pub fn pio_ler(rel: String) -> Option<String> {
    caminho(&rel).ok().and_then(|p| fs::read_to_string(p).ok())
}

#[tauri::command]
pub fn pio_existe(rel: String) -> bool {
    caminho(&rel).map(|p| p.exists()).unwrap_or(false)
}

#[tauri::command]
pub fn pio_listar(rel: String) -> Vec<String> {
    let Ok(p) = caminho(if rel.is_empty() { "." } else { &rel }) else { return vec![] };
    let mut v: Vec<String> = fs::read_dir(p).map(|it| it.filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .map(|e| e.file_name().to_string_lossy().to_string()).collect()).unwrap_or_default();
    v.sort();
    v
}

#[tauri::command]
pub fn pio_mover(de: String, para: String) -> Result<bool, String> {
    let a = caminho(&de)?;
    let b = caminho(&para)?;
    if let Some(d) = b.parent() { fs::create_dir_all(d).map_err(|e| e.to_string())?; }
    fs::rename(a, b).map_err(|e| e.to_string())?;
    Ok(true)
}
