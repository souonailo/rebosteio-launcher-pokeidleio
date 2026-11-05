# PIO Rebosteio — Multi-Account Launcher

PokeIdle launcher for Windows x64, with four account slots, a Rust backend and WebView2. Rust is now the main implementation. The older Electron source remains for reference and migration tests; its launcher batch file has been removed.

[Português](README.md) · [Tutorial (PT)](TUTORIAL.md) · [Contributing (PT)](CONTRIBUTING.md)

## Run from source

In a prepared checkout, run **`npm run build:release`** or the PowerShell command below, then open **`pio-nailo-rust.exe`** from the repository root. Use `pio-nailo-rust.exe --instance=2` for the second instance.

A new environment requires Rust stable, Microsoft C++ Build Tools, WebView2, Tauri CLI 2.12.1, and the local Python/Camoufox login runtime. Release builds do not install these automatically. Node.js/npm are optional when using the PowerShell build command; Electron is not required.

## Updates and forks

Update source manually while preserving local edits, then rebuild the release. The executable does not update the repository automatically.

The frontend in `rust-migration/ui` is embedded in the release. Both frontend and Rust changes require a new build.

Point shortcuts to the root executable and close it before rebuilding.

## Release build to root (`pio-nailo-rust.exe`)

To compile the optimized native release binary directly into the repository root:

- Run **`npm run build:release`** from the root or invoke PowerShell:
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-release.ps1
  ```
- For installer integration where recompilation is not needed, pass `-CopyOnly`:
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-release.ps1 -CopyOnly
  ```

`tools/build-release.ps1` manages compilation via `cargo tauri build --no-bundle -- --locked`, explicitly controls `CARGO_TARGET_DIR` (defaulting to `rust-migration/src-tauri/target`) to avoid copying stale binaries, halts if `pio-nailo-rust.exe` is currently running, copies the binary to root only on a successful build (preserving previous binaries on compilation failure), and verifies SHA256 integrity.

## Local data and session paths

Rust isolates browsing data, WebView2 profiles, and DPAPI-encrypted credentials under `%APPDATA%`:

- **Default instance:** `%APPDATA%/pionailo` (identifier `com.pionailo.launcher`).
- **Additional instances (`--instance=N`):** `%APPDATA%/pionailo-instancia-N` (identifier `com.pionailo.launcher.instanciaN`, e.g., `pionailo-instancia-2`).

Preserve these directories during updates. Electron and Rust browser profiles are distinct. Development and packaged apps can also have separate frontend preferences because their origins differ. Authentication sends credentials to the relevant services; local encryption does not remove login network traffic.

### Local resources alongside the repository

Keep the executable in this prepared checkout's root. Local login resolves `tools/turnstile_solver.py` and `.runtime/python/Scripts/python.exe` from the executable location, even when launched from a different working directory. An explicit `PIO_NAILO_PYTHON` override retains priority. The build does not copy or modify existing session files.

After validating the root executable, the rule deletes the entire `rust-migration/src-tauri/target` folder. Installer builds first copy and verify the installer in `dist/`, then publish the root executable and clean `target`. Build or validation failures preserve `target`; cleanup errors are reported without deleting the root executable. Subsequent builds recreate the cache and take longer. Do not run concurrent builds in this checkout. A standalone `cargo build --release` does not copy or clean artifacts.

Do not commit credentials, tokens, browser profiles, caches or binaries. Release packages are built manually when a maintainer chooses to publish, rather than on every commit. See the Portuguese contributor guide for commands and versioning.

This startup flow supports Windows x64. [MIT license](LICENSE).
