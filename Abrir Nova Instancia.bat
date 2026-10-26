@echo off
set PIO_INSTANCE=2
if exist "%~dp0rust-migration\src-tauri\target\release\pio-nailo-rust.exe" (
    start "" "%~dp0rust-migration\src-tauri\target\release\pio-nailo-rust.exe" --instance=2
    exit /b 0
)
if exist "%~dp0rust-migration\src-tauri\target\debug\pio-nailo-rust.exe" (
    start "" "%~dp0rust-migration\src-tauri\target\debug\pio-nailo-rust.exe" --instance=2
    exit /b 0
)
start "" wscript.exe //nologo "%~dp0tools\launch-rust.vbs" --instance=2
exit /b
