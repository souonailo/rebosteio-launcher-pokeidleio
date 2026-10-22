param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"

function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Falha em $Program (codigo $LASTEXITCODE)." }
}
function Install-Winget {
    param([string]$Id, [string[]]$Extra = @())
    if (!(Get-Command winget.exe -ErrorAction SilentlyContinue)) {
        throw 'Instale o App Installer da Microsoft Store para disponibilizar winget. Veja TUTORIAL.md para instalacao manual.'
    }
    Write-Host "Instalando $Id. O Windows pode solicitar permissao de administrador."
    & winget.exe install --id $Id --exact --source winget --accept-source-agreements --accept-package-agreements @Extra
    if ($LASTEXITCODE -eq 3010) { throw 'Instalacao concluida; reinicie o Windows e abra o .bat novamente.' }
    if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel instalar $Id (codigo $LASTEXITCODE). Veja TUTORIAL.md." }
}
function Find-CppTools {
    $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vswhere) {
        return (& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath)
    }
    return $null
}
function Test-Rustc {
    $eap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    Push-Location (Join-Path $root 'rust-migration')
    try {
        $script:RustcOutput = (& rustc.exe -vV 2>&1 | ForEach-Object { $_.ToString() }) -join "`n"
        $code = $LASTEXITCODE
    } catch {
        $script:RustcOutput = $_.Exception.Message
        $code = 1
    } finally {
        Pop-Location
        $ErrorActionPreference = $eap
    }
    return ($code -eq 0 -and $script:RustcOutput -match '(?m)^host:')
}
function Has-WebView2 {
    foreach ($key in @('HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients', 'HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients', 'HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients')) {
        foreach ($child in @(Get-ChildItem $key -ErrorAction SilentlyContinue)) {
            $info = Get-ItemProperty $child.PSPath -ErrorAction SilentlyContinue
            if ($info.name -like '*WebView2*' -and $info.pv -and $info.pv -ne '0.0.0.0') { return $true }
        }
    }
    return $false
}
try {
    if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'Este inicializador requer Windows x64. Veja README.md.' }
    $cpp = Find-CppTools
    $cargo = Get-Command cargo.exe -ErrorAction SilentlyContinue
    $webview = Has-WebView2
    if ($CheckOnly) {
        Write-Host "Rust/Cargo: $([bool]$cargo); C++ Build Tools: $([bool]$cpp); WebView2: $webview"
        Write-Host "Python local: $(Test-Path "$root\.runtime\python\Scripts\python.exe")"
        exit 0
    }
    if (!$cpp) {
        Install-Winget 'Microsoft.VisualStudio.2022.BuildTools' @('--override', '--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended')
        if (!(Find-CppTools)) { throw 'Ferramentas C++ nao encontradas. Reinicie e confira a carga Desktop development with C++.' }
    }
    if (!$cargo) {
        Install-Winget 'Rustlang.Rustup'
        $env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
    }
    if (!$webview) { Install-Winget 'Microsoft.EdgeWebView2Runtime' }
    $toolchains = & rustup.exe toolchain list
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel consultar as toolchains Rust.' }
    if (!($toolchains -match '^stable-x86_64-pc-windows-msvc')) {
        Invoke-Checked 'rustup.exe' @('toolchain', 'install', 'stable', '--profile', 'minimal')
    }
    # O Tauri CLI executa "rustc -vV" e quebra (unwrap em None) se a saida nao tiver "host:".
    # Valida antes, tenta reparar a toolchain e, se falhar, grava o erro real no log.
    $rustcOk = Test-Rustc
    if (!$rustcOk) {
        Write-Host 'rustc nao respondeu corretamente. Reparando a toolchain stable...'
        $eap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
        & rustup.exe toolchain install stable --profile minimal --force 2>&1 | ForEach-Object { Write-Host $_.ToString() }
        & rustup.exe default stable 2>&1 | ForEach-Object { Write-Host $_.ToString() }
        $ErrorActionPreference = $eap
        $rustcOk = Test-Rustc
    }
    if (!$rustcOk) {
        throw "rustc continua sem responder. Saida de 'rustc -vV':`n$($script:RustcOutput)`nAbra um terminal e rode: rustup self update; rustup toolchain uninstall stable; rustup toolchain install stable"
    }

    $python = "$root\.runtime\python\Scripts\python.exe"
    if (!(Test-Path $python)) {
        $basePython = $null
        foreach ($candidate in @("$env:LOCALAPPDATA\Programs\Python\Python311\python.exe", 'python.exe', 'py.exe')) {
            try {
                $pythonArgs = if ($candidate -eq 'py.exe') { @('-3.11', '-c') } else { @('-c') }
                $found = & $candidate @pythonArgs 'import sys; assert sys.version_info >= (3, 9); print(sys.executable)' 2>$null
                if ($LASTEXITCODE -eq 0 -and $found) { $basePython = $found; break }
            } catch { }
        }
        if (!$basePython) {
            Install-Winget 'Python.Python.3.11' @('--scope', 'user')
            $basePython = "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe"
        }
        Invoke-Checked $basePython @('-m', 'venv', "$root\.runtime\python")
    }
    $requirements = Join-Path $root 'requirements-login.txt'
    $marker = "$root\.runtime\python\requirements.sha256"
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $hash = [BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($requirements))).Replace('-', '') }
    finally { $sha.Dispose() }
    if (!(Test-Path $marker) -or (Get-Content $marker -Raw).Trim() -ne $hash) {
        Invoke-Checked $python @('-m', 'pip', 'install', '--disable-pip-version-check', '-r', $requirements)
        Set-Content $marker $hash
    }
    & $python -c 'import sys, camoufox.pkgman; sys.exit(0 if camoufox.pkgman.installed_verstr() else 1)'
    if ($LASTEXITCODE -ne 0) { Invoke-Checked $python @('-m', 'camoufox', 'fetch') }
    $env:PATH = "$root\.runtime\python\Scripts;$env:PATH"
    $env:PIO_NAILO_PYTHON = $python
    $env:PIO_NAILO_SOURCE_LAUNCHER = Join-Path $root 'Abrir PIO Rebosteio.bat'

    $cli = if (Get-Command cargo-tauri.exe -ErrorAction SilentlyContinue) { & cargo-tauri.exe --version } else { '' }
    if ($cli -notmatch '2\.12\.1\b') {
        Invoke-Checked 'cargo.exe' @('install', 'tauri-cli', '--version', '2.12.1', '--locked')
    }
    Set-Location (Join-Path $root 'rust-migration')
    Write-Host 'Abrindo Rust pelo codigo-fonte. A primeira compilacao pode demorar.'
    Write-Host 'A interface usa os arquivos locais; o .bat nao gera pacotes de distribuicao.'
    Invoke-Checked 'cargo.exe' (@('tauri', 'dev', '--no-watch', '--', '--locked') + $args)
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
