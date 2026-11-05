use std::path::{Path, PathBuf};

// Prefer the executable's checkout, even when a shortcut supplies another cwd.
pub fn source_root(executable: &Path, cwd: &Path) -> Option<PathBuf> {
    executable.parent().into_iter().chain(std::iter::once(cwd))
        .flat_map(|base| base.ancestors())
        .find(|dir| dir.join("Abrir PIO Rebosteio.bat").is_file())
        .map(Path::to_path_buf)
}

pub fn source_login(root: &Path, python_override: Option<PathBuf>) -> Option<(PathBuf, PathBuf, Option<PathBuf>)> {
    let script = root.join("tools/turnstile_solver.py");
    if !script.is_file() { return None; }
    let local_python = root.join(".runtime/python/Scripts/python.exe");
    let python = python_override.unwrap_or_else(|| {
        if local_python.is_file() { local_python } else { PathBuf::from("python") }
    });
    Some((python, script, None))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn root_and_target_executables_find_same_login_from_unrelated_cwd() {
        let root = std::env::temp_dir().join(format!("pio-runtime-paths-{}", std::process::id()));
        std::fs::create_dir_all(root.join("tools")).unwrap();
        std::fs::create_dir_all(root.join(".runtime/python/Scripts")).unwrap();
        for file in ["Abrir PIO Rebosteio.bat", "tools/turnstile_solver.py", ".runtime/python/Scripts/python.exe"] {
            std::fs::write(root.join(file), b"").unwrap();
        }
        for relative in ["pio-nailo-rust.exe", "rust-migration/src-tauri/target/release/pio-nailo-rust.exe", "rust-migration/src-tauri/target/debug/pio-nailo-rust.exe"] {
            let found = source_root(&root.join(relative), &std::env::temp_dir()).unwrap();
            assert_eq!(found, root);
            let (python, script, _) = source_login(&found, None).unwrap();
            assert_eq!(python, root.join(".runtime/python/Scripts/python.exe"));
            assert_eq!(script, root.join("tools/turnstile_solver.py"));
        }
        assert_eq!(source_login(&root, Some(PathBuf::from("custom-python"))).unwrap().0, PathBuf::from("custom-python"));
        std::fs::remove_dir_all(&root).unwrap();
    }
}
