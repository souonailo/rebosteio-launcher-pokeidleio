@echo off
setlocal
title PIO Nailo - Build Release
cd /d "%~dp0"

echo ===================================================
echo   PIO Nailo - Compilar Release para a Raiz
echo ===================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\build-release.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"

if %EXIT_CODE% neq 0 (
    echo.
    echo [ERRO] Falha na compilacao da versao de release (codigo %EXIT_CODE%).
    pause
    exit /b %EXIT_CODE%
)

echo.
echo ===================================================
echo   Build de release concluido com sucesso!
echo   Executavel gerado: pio-nailo-rust.exe
echo ===================================================
echo.
echo %cmdcmdline% | find /i "%~0" >nul
if %ERRORLEVEL% equ 0 pause

exit /b 0
