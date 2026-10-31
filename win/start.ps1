# Klipownia launcher for Windows. Starts the local server in the background if it is not running,
# then opens the editor. The Desktop and Start menu shortcuts run this file hidden.
param([switch]$NoBrowser)  # tests: start the server only
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
# The server reads PORT too (default 8787). Only tests set it.
$Port = 8787
if ($env:PORT) { $Port = [int]$env:PORT }
$Url = "http://localhost:$Port"
# The server listens on 127.0.0.1 only. Ask that address directly: "localhost" may try IPv6 first.
$Probe = "http://127.0.0.1:$Port/api/projects"
$LogDir = Join-Path $Root 'logs'

function Show-Message([string]$text) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show($text, 'Klipownia', 'OK', 'Warning') | Out-Null
}
# Klipownia answers /api/projects with a JSON list. Anything else on this port is not us.
function Test-Ours {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri $Probe
    return $r.Content.TrimStart().StartsWith('[')
  } catch { return $false }
}

if (-not (Test-Path (Join-Path $Root '.install-ok'))) {
  # Not installed (or the last install stopped half way): run the installer in a visible window.
  Start-Process powershell.exe -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$Root\install.ps1`"")
  exit 0
}

if (-not (Test-Ours)) {
  $busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($busy) {
    Show-Message "Port $Port zajmuje inny program. Uruchom komputer ponownie i otwórz Klipownię jeszcze raz.`n`nPort $Port is used by another program. Restart the PC, then open Klipownia again."
    exit 1
  }
  $node = Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
  if (-not $node) { $node = Join-Path $env:ProgramFiles 'nodejs\node.exe' }
  if (-not (Test-Path $node)) {
    Show-Message "Nie znaleziono Node.js. Wklej jeszcze raz linię instalacyjną z maila po zakupie.`n`nNode.js was not found. Paste the install line from the purchase email again."
    exit 1
  }
  # Tools the server calls (ffmpeg from winget, claude) may not be on PATH in a shortcut's environment.
  $env:Path = (@(
      (Split-Path -Parent $node),
      (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links'),
      (Join-Path $env:USERPROFILE '.local\bin'),
      [Environment]::GetEnvironmentVariable('Path', 'User'),
      [Environment]::GetEnvironmentVariable('Path', 'Machine'),
      $env:Path
    ) | Where-Object { $_ }) -join ';'
  # Always her subscription, never paid API billing.
  Remove-Item Env:ANTHROPIC_API_KEY -ErrorAction SilentlyContinue
  # Windows venvs keep python in Scripts\, not bin\.
  if (-not $env:REEL_PYTHON) { $env:REEL_PYTHON = Join-Path $Root '.venv\Scripts\python.exe' }
  if (-not $env:REEL_TTS_PYTHON) { $env:REEL_TTS_PYTHON = Join-Path $Root '.venv-tts\Scripts\python.exe' }
  # Python 3.12 that creates .venv-tts for the computer voice. A bare "python" may be the Store stub.
  if (-not $env:REEL_SYS_PYTHON -and (Get-Command py.exe -ErrorAction SilentlyContinue)) {
    try {
      $sys = & py.exe -3.12 -c 'import sys; print(sys.executable)' 2>$null
      if ($LASTEXITCODE -eq 0 -and $sys) { $env:REEL_SYS_PYTHON = "$sys".Trim() }
    } catch { }  # PowerShell 5.1 throws on any stderr line while $ErrorActionPreference is Stop
  }
  $env:PYTHONUTF8 = '1'
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  # One node process (tsx as a loader, not the tsx CLI that starts a second node), so Stop can end it cleanly.
  $loader = ([Uri](Join-Path $Root 'node_modules\tsx\dist\loader.mjs')).AbsoluteUri
  $server = Start-Process -FilePath $node -ArgumentList @('--import', $loader, 'server/index.ts') -WorkingDirectory $Root -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $LogDir 'Klipownia.log') -RedirectStandardError (Join-Path $LogDir 'Klipownia-errors.log')
  # No sleep while the server runs, so a long render is not cut off. Ends by itself when node ends.
  Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSScriptRoot\keepawake.ps1`"", '-NodePid', $server.Id)
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-Ours) { break }
  }
  if (-not (Test-Ours)) {
    Show-Message "Klipownia nie chce się uruchomić. Wyślij nam pliki z folderu (odpowiedz na mail z zakupem):`n$LogDir`n`nKlipownia could not start. Send us the files in the folder above (reply to the purchase email)."
    exit 1
  }
}

if ($NoBrowser) { exit 0 }
# Its own window (app mode) in Chrome or Edge. Edge comes with every Windows 10 and 11.
$browsers = @(
  (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
  (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
)
foreach ($b in $browsers) {
  if (Test-Path $b) {
    Start-Process -FilePath $b -ArgumentList @("--app=$Url", '--window-size=1440,900')
    exit 0
  }
}
Start-Process $Url
