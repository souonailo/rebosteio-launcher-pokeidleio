@echo off
setlocal
set PIO_INSTANCE=2
if exist "%~dp0pio-nailo-rust.exe" (
    start "" /d "%~dp0" "%~dp0pio-nailo-rust.exe" --instance=2
    exit /b 0
)
if exist "%~dp0rust-migration\src-tauri\target\release\pio-nailo-rust.exe" (
    start "" /d "%~dp0" "%~dp0rust-migration\src-tauri\target\release\pio-nailo-rust.exe" --instance=2
    exit /b 0
)
if exist "%~dp0rust-migration\src-tauri\target\debug\pio-nailo-rust.exe" (
    start "" /d "%~dp0" "%~dp0rust-migration\src-tauri\target\debug\pio-nailo-rust.exe" --instance=2
    exit /b 0
)
start "" /d "%~dp0" wscript.exe //nologo "%~dp0tools\launch-rust.vbs" --instance=2
exit /b 0
