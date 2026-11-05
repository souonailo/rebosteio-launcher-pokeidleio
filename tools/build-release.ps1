param(
    [switch]$CopyOnly
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$destination = Join-Path $root 'pio-nailo-rust.exe'

function Assert-DestinationNotRunning {
    param([string]$Path)

    $normalizedTarget = [System.IO.Path]::GetFullPath($Path)
    $running = Get-Process -Name 'pio-nailo-rust' -ErrorAction SilentlyContinue | Where-Object {
        try {
            $_.Path -and [System.IO.Path]::GetFullPath($_.Path) -eq $normalizedTarget
        } catch {
            $false
        }
    }
    if ($running) {
        $pids = ($running | ForEach-Object { $_.Id }) -join ', '
        throw "O executavel de destino ('$Path') esta em execucao (PID(s): $pids). Feche o PIO Nailo antes de compilar ou copiar a versao de release."
    }

    if (Test-Path -LiteralPath $Path) {
        try {
            $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
            $stream.Close()
            $stream.Dispose()
        } catch {
            throw "O executavel de destino ('$Path') esta bloqueado ou em uso por outro processo: $($_.Exception.Message)"
        }
    }
}

# 1. Validar se o executável de destino específico na raiz está em execução
Assert-DestinationNotRunning $destination

# 2. Fixar CARGO_TARGET_DIR no default absoluto do projeto para build e CopyOnly
$targetDir = [System.IO.Path]::GetFullPath((Join-Path $root 'rust-migration\src-tauri\target'))
$env:CARGO_TARGET_DIR = $targetDir
$sourceExe = Join-Path $targetDir 'release\pio-nailo-rust.exe'

# 3. Compilação (a menos que -CopyOnly tenha sido solicitado)
if (!$CopyOnly) {
    Write-Host "Compilando release nativa do PIO Nailo (cargo tauri build --no-bundle -- --locked)..."
    $env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"

    $rustDir = Join-Path $root 'rust-migration'
    Push-Location $rustDir
    try {
        $cargoCmd = if (Get-Command cargo.exe -ErrorAction SilentlyContinue) { 'cargo.exe' } else { 'cargo' }
        & $cargoCmd tauri build --no-bundle -- --locked
        if ($LASTEXITCODE -ne 0) {
            throw "Falha na compilacao da release via 'cargo tauri build' (codigo $LASTEXITCODE)."
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "Modo CopyOnly ativado: pulando compilacao e reutilizando binario existente no target."
}

# 4. Validar existência do binário gerado
if (!(Test-Path -LiteralPath $sourceExe)) {
    throw "Executavel compilado de release nao foi encontrado em: '$sourceExe'."
}

# 5. Nova validação antes da substituição
Assert-DestinationNotRunning $destination

# 6. Copiar de forma segura e atômica, preservando o destino existente em caso de falha de compilação
$sourceHash = (Get-FileHash -LiteralPath $sourceExe -Algorithm SHA256).Hash
Write-Host "SHA256 (fonte): $sourceHash"

$tempDest = "$destination.tmp.$([System.Guid]::NewGuid().ToString('N'))"
try {
    Copy-Item -LiteralPath $sourceExe -Destination $tempDest -Force
    $tempHash = (Get-FileHash -LiteralPath $tempDest -Algorithm SHA256).Hash
    if ($tempHash -ne $sourceHash) {
        throw "Falha de integridade: SHA256 do arquivo temporario ($tempHash) diverge da fonte ($sourceHash)."
    }
    if (Test-Path -LiteralPath $destination) {
        [System.IO.File]::Replace($tempDest, $destination, [NullString]::Value)
    } else {
        [System.IO.File]::Move($tempDest, $destination)
    }
} catch {
    if (Test-Path -LiteralPath $tempDest) {
        Remove-Item -LiteralPath $tempDest -Force -ErrorAction SilentlyContinue
    }
    throw "Falha ao copiar executavel para a raiz: $($_.Exception.Message)"
}

# 7. Validação final de SHA256 no destino
$destHash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
if ($destHash -ne $sourceHash) {
    throw "Falha de integridade no destino: SHA256 em '$destination' ($destHash) nao confere com a fonte ($sourceHash)."
}

Write-Host "Executavel de release atualizado com sucesso na raiz: $destination"
Write-Host "SHA256 validado: $destHash"

# Limpar somente o target deste checkout, depois de validar a copia final.
$expectedTarget = [IO.Path]::GetFullPath((Join-Path $root 'rust-migration\src-tauri\target'))
$resolvedTarget = (Resolve-Path -LiteralPath $targetDir -ErrorAction Stop).ProviderPath
if ($resolvedTarget -ne $expectedTarget) {
    throw 'Release salvo, mas a limpeza foi cancelada: caminho target inesperado.'
}
foreach ($path in @($root, (Join-Path $root 'rust-migration'), (Join-Path $root 'rust-migration\src-tauri'), $resolvedTarget)) {
    if ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw 'Release salvo, mas a limpeza foi cancelada: caminho contem link ou junction.'
    }
}
$links = Get-ChildItem -LiteralPath $resolvedTarget -Force -Recurse -Attributes ReparsePoint -ErrorAction Stop
if ($links) { throw 'Release salvo, mas a limpeza foi cancelada: target contem links ou junctions.' }
Remove-Item -LiteralPath $resolvedTarget -Recurse -Force -ErrorAction Stop
Write-Host 'Target removido. Use o pio-nailo-rust.exe da pasta principal.'
