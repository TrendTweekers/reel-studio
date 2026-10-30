# Reel Studio installer for Windows 10 and 11 (64-bit Intel or AMD). Safe to run again: it only adds
# what is missing. Normally get.ps1 runs it. By hand:
#   powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1
# Test switches: -Root (other app folder), -SkipWinget (install nothing with winget), -ClaudeConfig
# (write the Claude Desktop config to this file only), -NoShortcuts, -NoLogin.
param(
  [string]$Root = (Join-Path $env:USERPROFILE 'ReelStudio'),
  [switch]$SkipWinget,
  [string]$ClaudeConfig,
  [switch]$NoShortcuts,
  [switch]$NoLogin
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'  # the PowerShell progress bar makes downloads 10x slower in 5.1
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
# npm, pip and git print UTF-8. Without this, PowerShell 5.1 shows Polish letters as garbage.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
$env:HF_HUB_DISABLE_SYMLINKS_WARNING = '1'

function Say([string]$pl, [string]$en) {
  Write-Host ''
  Write-Host $pl -ForegroundColor Cyan
  if ($en) { Write-Host $en -ForegroundColor DarkGray }
}
function Info([string]$pl, [string]$en) {
  Write-Host $pl
  if ($en) { Write-Host $en -ForegroundColor DarkGray }
}
function Stop-Install([string]$pl, [string]$en) {
  Write-Host ''
  Write-Host $pl -ForegroundColor Yellow
  if ($en) { Write-Host $en -ForegroundColor Yellow }
  throw 'REEL_STOP'
}

# One timer per step, so the log shows where the time went.
$script:StepTimer = $null
$script:StepName = ''
function Step([int]$n, [string]$pl, [string]$en) {
  End-Step
  $script:StepName = "$n/7"
  $script:StepTimer = [Diagnostics.Stopwatch]::StartNew()
  Say "Krok $n/7: $pl" "Step $n/7: $en"
}
function End-Step {
  if ($script:StepTimer) {
    $t = $script:StepTimer.Elapsed
    Write-Host ("   ({0}: {1} min {2} s)" -f $script:StepName, [int][Math]::Floor($t.TotalMinutes), $t.Seconds) -ForegroundColor DarkGray
    $script:StepTimer = $null
  }
}

# Runs a program, shows and logs its output, and stops the install when it fails.
# PowerShell 5.1 turns stderr lines into errors when $ErrorActionPreference is Stop, so relax it here.
function Run([string]$Exe, [string[]]$ArgList, [switch]$AllowFail) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & $Exe @ArgList 2>&1 | ForEach-Object { "$_" } | Out-Host
  $code = $LASTEXITCODE
  $ErrorActionPreference = $old
  if ($AllowFail) { return ($code -eq 0) }
  if ($code -ne 0) { throw "'$Exe $($ArgList -join ' ')' failed with exit code $code" }
}

# winget changes PATH in the registry only. Read it again so this window finds the new programs.
function Update-SessionPath {
  $parts = @()
  $parts += [Environment]::GetEnvironmentVariable('Path', 'Machine') -split ';'
  $parts += [Environment]::GetEnvironmentVariable('Path', 'User') -split ';'
  $parts += $env:Path -split ';'
  $parts += (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links')
  $parts += (Join-Path $env:USERPROFILE '.local\bin')
  $seen = @{}
  $out = foreach ($p in $parts) {
    if ($p -and -not $seen.ContainsKey($p.ToLower())) { $seen[$p.ToLower()] = 1; $p }
  }
  $env:Path = $out -join ';'
}

function Install-Winget([string]$Id, [string]$Name, [string[]]$Extra = @()) {
  if ($SkipWinget) {
    Stop-Install "Brakuje programu $Name, a instalacja przez winget jest wyłączona (-SkipWinget)." "$Name is missing and -SkipWinget is set."
  }
  if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
    Stop-Install 'Brakuje programu winget. Zainstaluj „Instalator aplikacji” (App Installer) ze sklepu Microsoft Store i uruchom instalację jeszcze raz.' `
      'winget is missing. Install "App Installer" from the Microsoft Store, then run the installer again.'
  }
  Info "Instaluję $Name... Jeśli Windows zapyta o zgodę, kliknij Tak." "Installing $Name... If Windows asks for permission, click Yes."
  # A non-zero code can also mean "already installed". The caller checks again for the program itself.
  Run 'winget.exe' (@('install', '-e', '--id', $Id, '--silent', '--accept-package-agreements', '--accept-source-agreements') + $Extra) -AllowFail | Out-Null
  Update-SessionPath
}

function Find-Exe([string]$Name, [string[]]$Fallbacks) {
  $c = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { return $c.Source }
  foreach ($f in $Fallbacks) { if ($f -and (Test-Path $f)) { return $f } }
  return $null
}

function Find-Node {
  $n = Find-Exe 'node.exe' @((Join-Path $env:ProgramFiles 'nodejs\node.exe'))
  if (-not $n) { return $null }
  $v = (& $n -v) -replace '^v', ''
  if ([int]($v.Split('.')[0]) -lt 22) { return $null }  # Remotion and the server need Node 22 or newer
  return $n
}

function Find-Python312 {
  $py = Find-Exe 'py.exe' @((Join-Path $env:WINDIR 'py.exe'), (Join-Path $env:LOCALAPPDATA 'Programs\Python\Launcher\py.exe'))
  if ($py) {
    $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    $exe = & $py -3.12 -c 'import sys; print(sys.executable)' 2>$null
    $ErrorActionPreference = $old
    if ($LASTEXITCODE -eq 0 -and $exe -and (Test-Path $exe.Trim())) { return $exe.Trim() }
  }
  foreach ($f in @((Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'), (Join-Path $env:ProgramFiles 'Python312\python.exe'))) {
    if (Test-Path $f) { return $f }
  }
  return $null
}

function Test-SamePath([string]$a, [string]$b) {
  $fa = [IO.Path]::GetFullPath($a).TrimEnd('\')
  $fb = [IO.Path]::GetFullPath($b).TrimEnd('\')
  return ($fa -ieq $fb)
}

# ---- Run from somewhere else (a zip in Downloads, the dev folder): copy the app into $Root first.
# Her reels, pictures, music, styles and settings in an existing $Root are never touched.
$Here = $PSScriptRoot
if (-not (Test-SamePath $Here $Root)) {
  Say "Kopiuję Reel Studio do $Root" "Copying Reel Studio to $Root"
  New-Item -ItemType Directory -Force -Path $Root | Out-Null
  $xd = @('.git', 'node_modules', '.venv', '.venv-tts', 'models', 'projects', 'board', 'styles', 'voice', 'logs', 'out', 'audit', '.incoming', 'instagram', (Join-Path 'assets' 'music'), (Join-Path 'web' 'dist')) |
    ForEach-Object { Join-Path $Here $_ }
  $xf = @('.install-ok', '*.log')
  foreach ($keep in @('settings.json', 'brand.md', 'vocabulary.txt', 'keywords.md')) {
    if (Test-Path (Join-Path $Root $keep)) { $xf += (Join-Path $Here $keep) }
  }
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  & robocopy.exe $Here $Root /E /NFL /NDL /NJH /NJS /NP /R:1 /W:1 /XD @xd /XF @xf | Out-Host
  $rc = $LASTEXITCODE
  $ErrorActionPreference = $old
  if ($rc -ge 8) { throw "robocopy failed with code $rc" }
  foreach ($d in @('projects', 'board', 'assets\music', 'styles', 'instagram\drafts')) {
    New-Item -ItemType Directory -Force -Path (Join-Path $Root $d) | Out-Null
  }
  foreach ($f in @('instagram\voice.md', 'instagram\voice.template.md')) {
    $src = Join-Path $Here $f
    if ((Test-Path $src) -and -not (Test-Path (Join-Path $Root $f))) { Copy-Item $src (Join-Path $Root $f) }
  }
  & (Join-Path $Root 'install.ps1') @PSBoundParameters
  return
}
Set-Location $Root

# ---- Log everything to a file, and say what to do if it fails
$LogDir = Join-Path $Root 'logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Log = Join-Path $LogDir 'ReelStudio-install.log'
try { Start-Transcript -Path $Log -Append | Out-Null } catch { }
$Total = [Diagnostics.Stopwatch]::StartNew()
$ok = $false
try {
  Write-Host "=== Reel Studio install, $(Get-Date) ==="
  Remove-Item (Join-Path $Root '.install-ok') -ErrorAction SilentlyContinue

  # ---- Preflight: stop early with a clear message on a PC that cannot run Reel Studio
  $arch = $env:PROCESSOR_ARCHITEW6432
  if (-not $arch) { $arch = $env:PROCESSOR_ARCHITECTURE }
  if ($arch -ne 'AMD64') {
    Stop-Install 'Ten komputer ma procesor ARM. Reel Studio potrzebuje komputera z procesorem Intel albo AMD (64-bit).' `
      'This PC has an ARM processor. Reel Studio needs a 64-bit Intel or AMD PC.'
  }
  if ([Environment]::OSVersion.Version.Build -lt 17763) {
    Stop-Install 'Ten Windows jest za stary. Zaktualizuj Windows 10 (Ustawienia > Windows Update) i uruchom instalację jeszcze raz.' `
      'This Windows is too old. Update Windows 10 (Settings > Windows Update), then run the installer again.'
  }
  # First install: about 6 GB plus room for her videos. A second run needs only a little.
  if ((Test-Path (Join-Path $Root '.venv')) -and (Test-Path (Join-Path $Root 'models'))) { $needGb = 3 } else { $needGb = 15 }
  $drive = Get-PSDrive -Name ([IO.Path]::GetPathRoot($Root).Substring(0, 1))
  $freeGb = [int][Math]::Floor($drive.Free / 1GB)
  if ($freeGb -lt $needGb) {
    Stop-Install "Za mało miejsca na dysku: wolne $freeGb GB, Reel Studio potrzebuje $needGb GB. Opróżnij Kosz i usuń duże pliki, których nie potrzebujesz, potem uruchom instalację jeszcze raz." `
      "Not enough free disk space: $freeGb GB free, Reel Studio needs $needGb GB. Empty the Recycle Bin and delete big files, then run the installer again."
  }
  Update-SessionPath

  Step 1 'Programy: Node.js, Python i FFmpeg (kilka minut)' 'Programs: Node.js, Python and FFmpeg (a few minutes)'
  $Node = Find-Node
  if (-not $Node) { Install-Winget 'OpenJS.NodeJS.LTS' 'Node.js'; $Node = Find-Node }
  if (-not $Node) { Stop-Install 'Node.js się nie zainstalował. Zamknij to okno, otwórz PowerShell jeszcze raz i uruchom instalację ponownie.' 'Node.js did not install. Close this window, open PowerShell again and run the installer again.' }
  Info "Node.js: $Node ($(& $Node -v))"
  $NodeDir = Split-Path -Parent $Node
  $Npm = Join-Path $NodeDir 'npm.cmd'
  $Npx = Join-Path $NodeDir 'npx.cmd'

  $Py = Find-Python312
  if (-not $Py) { Install-Winget 'Python.Python.3.12' 'Python 3.12' @('--scope', 'user'); $Py = Find-Python312 }
  if (-not $Py) { Stop-Install 'Python 3.12 się nie zainstalował. Zamknij to okno i uruchom instalację jeszcze raz.' 'Python 3.12 did not install. Close this window and run the installer again.' }
  Info "Python 3.12: $Py"

  $ff = Find-Exe 'ffmpeg.exe' @((Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\ffmpeg.exe'))
  if (-not $ff) { Install-Winget 'Gyan.FFmpeg' 'FFmpeg'; $ff = Find-Exe 'ffmpeg.exe' @((Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\ffmpeg.exe')) }
  if (-not $ff) { Stop-Install 'FFmpeg się nie zainstalował. Zamknij to okno i uruchom instalację jeszcze raz.' 'FFmpeg did not install. Close this window and run the installer again.' }
  Info "FFmpeg: $ff"

  Step 2 'Zatrzymuję stary serwer Reel Studio (jeśli działa)' 'Stopping the old Reel Studio server (if it runs)'
  # Windows locks files of a running server, so npm ci would fail.
  & (Join-Path $Root 'win\stop.ps1') -Quiet

  Step 3 'Pakiety aplikacji (kilka minut)' 'App packages (a few minutes)'
  Run $Npm @('ci', '--no-audit', '--no-fund')
  Run $Npm @('run', 'build:web')
  Info 'Pobieram przeglądarkę silnika wideo (około 100 MB)...' "Downloading the video engine's browser (about 100 MB)..."
  Run $Npx @('remotion', 'browser', 'ensure')
  Info 'Instaluję oficjalne umiejętności Remotion dla Claude (wiedza o wideo)...' 'Installing the official Remotion skills for Claude (video know-how)...'
  $skillsOk = Run $Npx @('-y', 'skills@1.7.4', 'add', 'remotion-dev/skills', '-a', 'claude-code', '-y', '--copy',
    '-s', 'remotion-best-practices', 'remotion-markup', 'remotion-captions', 'remotion-multimedia', 'remotion-render', 'remotion-docs') -AllowFail
  if (-not $skillsOk) { Info 'Nie udało się teraz zainstalować umiejętności Remotion (brak internetu?). Reel Studio działa bez nich.' 'Could not install the Remotion skills now (no internet?). Reel Studio works without them.' }

  Step 4 'Narzędzia do analizy wideo (mowa na tekst, wykrywanie twarzy). Około 1,5 GB, poczekaj.' 'Video analysis tools (speech to text, face finder). About 1.5 GB. Please wait.'
  $VPy = Join-Path $Root '.venv\Scripts\python.exe'
  if (-not (Test-Path $VPy)) { Run $Py @('-m', 'venv', '.venv') }
  Run $VPy @('-m', 'pip', 'install', '--upgrade', 'pip', '--quiet', '--disable-pip-version-check')
  Run $VPy @('-m', 'pip', 'install', '--disable-pip-version-check', '-r', 'tools\requirements.txt', '-c', 'tools\constraints.txt')
  if (-not (Test-Path (Join-Path $Root 'assets\sfx\pop.wav'))) { Run $VPy @('tools\gen_sfx.py') }
  Info 'Pobieram model mowy (1,6 GB). To najdłuższa część: 5 do 15 minut. Okno może wyglądać, jakby stało, to normalne.' `
    'Downloading the speech model (1.6 GB). This is the slowest part: 5 to 15 minutes. The window may look stuck; that is normal.'
  Run $VPy @('-c', "from faster_whisper import WhisperModel; WhisperModel('large-v3-turbo', device='cpu', compute_type='int8', download_root='models')")
  Info 'Pobieram modele do wykrywania twarzy i sylwetki...' 'Downloading the face and person finder models...'
  $facesOk = Run $VPy @('-c', "import sys; sys.path.insert(0,'tools'); import _facedet, cutout, cover_frames; from _common import model_file; model_file(*_facedet.SHORT); model_file('selfie_multiclass_256x256.tflite', cutout.URL); model_file('selfie_segmenter.tflite', cutout.URL_BIN); model_file('face_landmarker.task', cover_frames.URL)") -AllowFail
  if (-not $facesOk) { Info 'Nie udało się ich teraz pobrać. Reel Studio pobierze je, gdy będą pierwszy raz potrzebne.' 'Could not download them now. Reel Studio downloads them the first time it needs them.' }

  Step 5 'Claude Code (korzysta z Twojej subskrypcji Claude, bez klucza API)' 'Claude Code (uses your own Claude subscription, no API key)'
  $ClaudeExe = Find-Exe 'claude.exe' @((Join-Path $env:USERPROFILE '.local\bin\claude.exe'))
  if ($ClaudeExe) {
    Info "Claude Code jest już zainstalowany: $ClaudeExe" "Claude Code is already installed: $ClaudeExe"
  } else {
    # The official native installer (https://code.claude.com/docs/en/setup). Own process, so its exit cannot end this one.
    Run 'powershell.exe' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'irm https://claude.ai/install.ps1 | iex')
    Update-SessionPath
    $ClaudeExe = Find-Exe 'claude.exe' @((Join-Path $env:USERPROFILE '.local\bin\claude.exe'))
    if (-not $ClaudeExe) { Stop-Install 'Claude Code się nie zainstalował. Uruchom instalację jeszcze raz.' 'Claude Code did not install. Run the installer again.' }
    # Make 'claude' work in new windows too, in case the installer did not add it to PATH.
    $bin = Join-Path $env:USERPROFILE '.local\bin'
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    if (($ClaudeExe -like "$bin*") -and (($userPath -split ';') -notcontains $bin)) {
      [Environment]::SetEnvironmentVariable('Path', (($userPath.TrimEnd(';') + ';' + $bin).TrimStart(';')), 'User')
    }
  }
  if ([Environment]::GetEnvironmentVariable('ANTHROPIC_API_KEY', 'User') -or [Environment]::GetEnvironmentVariable('ANTHROPIC_API_KEY', 'Machine')) {
    Info 'UWAGA: na tym komputerze ustawiony jest ANTHROPIC_API_KEY. Claude Code płaciłby wtedy za API, a nie z Twojej subskrypcji. Usuń go, jeśli nie ustawiłaś/eś go celowo.' `
      'WARNING: ANTHROPIC_API_KEY is set on this PC. Claude Code would bill the API, not your subscription. Remove it unless you set it on purpose.'
  }

  Step 6 'Łącznik Reel Studio w Claude Desktop' 'The Reel Studio connector for Claude Desktop'
  # Classic install reads %APPDATA%\Claude. The Microsoft Store (MSIX) build reads a redirected copy
  # under its package folder, so write there too when it exists.
  if ($ClaudeConfig) {
    $configs = @($ClaudeConfig)
  } else {
    $configs = @((Join-Path $env:APPDATA 'Claude\claude_desktop_config.json'))
    Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Packages') -Directory -Filter 'Claude_*' -ErrorAction SilentlyContinue | ForEach-Object {
      $configs += (Join-Path $_.FullName 'LocalCache\Roaming\Claude\claude_desktop_config.json')
    }
  }
  $haveDesktop = (Test-Path (Join-Path $env:LOCALAPPDATA 'AnthropicClaude')) -or
    (Test-Path (Join-Path $env:LOCALAPPDATA 'Programs\Claude')) -or
    [bool](Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Packages') -Directory -Filter 'Claude_*' -ErrorAction SilentlyContinue)
  $connOk = $true
  foreach ($cfg in $configs) {
    # register.mjs merges one entry, keeps other servers, backs up to .bak and never touches invalid JSON.
    if (-not (Run $Node @((Join-Path $Root 'mcp\register.mjs'), $Node, $Root, $cfg) -AllowFail)) { $connOk = $false }
  }
  if (-not $connOk) {
    Info 'Nie udało się dodać łącznika do Claude Desktop (samo Reel Studio działa).' 'Could not add the connector to Claude Desktop (Reel Studio itself works).'
  } elseif ($haveDesktop) {
    Info 'Claude Desktop: łącznik Reel Studio jest włączony. Zamknij Claude Desktop całkiem (także ikonę przy zegarze) i otwórz go znowu.' `
      'Claude Desktop: the Reel Studio connector is on. Quit Claude Desktop fully (also the icon near the clock) and open it again.'
  } else {
    Info 'Claude Desktop nie jest jeszcze zainstalowany. Łącznik jest już zapisany i zadziała, gdy go zainstalujesz (https://claude.com/download).' `
      'Claude Desktop is not installed yet. The connector is saved and works once you install it (https://claude.com/download).'
  }

  Step 7 'Skróty „Reel Studio” na pulpicie i w menu Start' 'The "Reel Studio" shortcuts on the Desktop and in the Start menu'
  $ps = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $startPs1 = Join-Path $Root 'win\start.ps1'
  $icon = Join-Path $Root 'win\ReelStudio.ico'
  $targets = @(
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Reel Studio.lnk'),
    (Join-Path ([Environment]::GetFolderPath('Programs')) 'Reel Studio.lnk')
  )
  if ($NoShortcuts) {
    Info 'Pomijam skróty (-NoShortcuts). Utworzyłbym:' 'Skipping shortcuts (-NoShortcuts). Would create:'
    foreach ($t in $targets) { Info "   $t -> $ps -WindowStyle Hidden -File `"$startPs1`"" }
  } else {
    $shell = New-Object -ComObject WScript.Shell
    foreach ($t in $targets) {
      $lnk = $shell.CreateShortcut($t)
      $lnk.TargetPath = $ps
      $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startPs1`""
      $lnk.WorkingDirectory = $Root
      $lnk.WindowStyle = 7  # minimized, so no window flashes before PowerShell hides itself
      $lnk.Description = 'Reel Studio'
      if (Test-Path $icon) { $lnk.IconLocation = "$icon,0" }
      $lnk.Save()
      Info "   $t"
    }
  }
  End-Step

  Set-Content -Path (Join-Path $Root '.install-ok') -Value (Get-Date -Format o)
  $ok = $true
  $m = [int][Math]::Floor($Total.Elapsed.TotalMinutes)
  Say "Gotowe ($m min)" "Done ($m min)"
  Info 'Otwórz „Reel Studio” ikoną na pulpicie albo z menu Start.' 'Open "Reel Studio" from the Desktop icon or the Start menu.'

  # One-time Claude login with her subscription (never the API option). Skipped when already logged in.
  if (-not $NoLogin) {
    Remove-Item Env:ANTHROPIC_API_KEY -ErrorAction SilentlyContinue
    $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    $status = (& $ClaudeExe auth status --json 2>$null) -join ''
    $ErrorActionPreference = $old
    if ($status -match '"loggedIn"\s*:\s*true') {
      Info 'Claude jest już zalogowany.' 'Claude is already logged in.'
    } else {
      Say 'Ostatni krok: zaloguj się do Claude' 'Last step: log in to Claude'
      Info 'Otworzy się okno przeglądarki. Zaloguj się swoim kontem Claude (Pro albo Max) i kliknij Authorize. Nigdy nie wybieraj opcji z kluczem API.' `
        'A browser window opens. Log in with your Claude account (Pro or Max) and click Authorize. Never choose the API key option.'
      if (-not (Run $ClaudeExe @('auth', 'login', '--claudeai') -AllowFail)) {
        Info 'Logowanie się nie skończyło. Możesz to zrobić później: kliknij dwa razy „Ask Claude.cmd” w folderze win.' `
          "Login did not finish. You can do it later: double-click 'Ask Claude.cmd' in the win folder."
      }
    }
  }
  Info 'Żeby zatrzymać Reel Studio: kliknij dwa razy „Stop Reel Studio.cmd” w folderze win.' "To stop Reel Studio: double-click 'Stop Reel Studio.cmd' in the win folder."
  Info "   $Root\win"
} catch {
  End-Step
  if ("$_" -ne 'REEL_STOP') { Write-Host "$_" -ForegroundColor Red }
  Write-Host ''
  Write-Host "Coś poszło nie tak. Zrób zdjęcie tego okna i wyślij Peterowi razem z plikiem $Log" -ForegroundColor Yellow
  Write-Host "Something went wrong. Send Peter a photo of this window and the file $Log" -ForegroundColor Yellow
  Write-Host 'Potem uruchom instalację jeszcze raz: zacznie od miejsca, w którym przerwała. / Then run the installer again: it continues where it stopped.'
} finally {
  try { Stop-Transcript | Out-Null } catch { }
}
if (-not $ok) { exit 1 }
