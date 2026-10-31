# Klipownia one-line installer and updater for Windows 10 and 11. Paste into PowerShell:
#   irm https://raw.githubusercontent.com/TrendTweekers/reel-studio/main/get.ps1 | iex
# For now the line loads this file from raw GitHub. It moves to the klipownia.pl domain later.
# It asks for the licence key from the purchase email, downloads the newest version through the
# Klipownia licence API into %USERPROFILE%\Klipownia, then runs install.ps1. Safe to run again to
# update: her reels, pictures, music, styles, voice, models and preferences are kept.
# With -Source <git url or repo path> it uses git instead (for Peter and Paulina, not for buyers).
# This text runs inside her PowerShell window (iex), so it never calls exit: that would close the window.
param(
  [string]$Root = (Join-Path $env:USERPROFILE 'Klipownia'),
  [string]$Key,
  [string]$Api,
  [string]$Source,
  [switch]$NoInstall,
  [switch]$SkipWinget,
  [string]$ClaudeConfig,
  [switch]$NoShortcuts,
  [switch]$NoLogin
)

& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'  # the progress bar makes downloads 10x slower in PowerShell 5.1
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  [Console]::OutputEncoding = [Text.Encoding]::UTF8  # git and the installer print UTF-8

  # Polish letters are written as \uXXXX: this file must stay ASCII, because PowerShell 5.1 reads a
  # file without a BOM as ANSI, and a BOM breaks "irm | iex". T turns them back into letters
  # (only \uXXXX, so Windows paths with backslashes pass through unchanged).
  function T([string]$s) {
    [regex]::Replace($s, '\\u([0-9a-fA-F]{4})', { param($m) [string][char][Convert]::ToInt32($m.Groups[1].Value, 16) })
  }
  function Say([string]$pl, [string]$en) {
    Write-Host ''
    Write-Host (T $pl) -ForegroundColor Cyan
    if ($en) { Write-Host $en -ForegroundColor DarkGray }
  }
  function Fail([string]$pl, [string]$en) {
    Write-Host ''
    Write-Host (T $pl) -ForegroundColor Yellow
    if ($en) { Write-Host $en -ForegroundColor Yellow }
  }
  function Update-SessionPath {
    $parts = @([Environment]::GetEnvironmentVariable('Path', 'Machine'), [Environment]::GetEnvironmentVariable('Path', 'User'), $env:Path) -join ';'
    $seen = @{}
    $env:Path = (($parts -split ';') | Where-Object { $_ -and -not $seen.ContainsKey($_.ToLower()) -and ($seen[$_.ToLower()] = 1) }) -join ';'
  }
  # Her files that also come with the app. Ours must never replace hers.
  $KeepFiles = @('settings.json', 'brand.md', 'vocabulary.txt', 'keywords.md', 'instagram\voice.md')

  # ---------- Old name: Reel Studio lived in %USERPROFILE%\ReelStudio. Move it once.
  $oldRoot = Join-Path $env:USERPROFILE 'ReelStudio'
  if (-not $PSBoundParameters.ContainsKey('Root') -and (Test-Path $oldRoot) -and -not (Test-Path $Root)) {
    Say "Przenosz\u0119 Reel Studio do nowego folderu: $Root" "Moving Reel Studio to the new folder: $Root"
    # A running server locks its files, so stop it first.
    Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
      $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
      if ($p -and $p.ProcessName -eq 'node') { Stop-Process -Id $p.Id -Force }
    }
    Start-Sleep -Seconds 1
    try {
      Move-Item -Path $oldRoot -Destination $Root
      Write-Host (T "Gotowe. Twoje rolki, muzyka i style s\u0105 teraz w $Root") -ForegroundColor Green
      Write-Host "Done. Your reels, music and styles are now in $Root" -ForegroundColor DarkGray
    } catch {
      Fail "Nie uda\u0142o si\u0119 przenie\u015b\u0107 folderu $oldRoot. Zamknij okna Reel Studio i Eksploratora plik\u00f3w, potem wklej lini\u0119 jeszcze raz." `
        "Could not move the folder $oldRoot. Close the Reel Studio and File Explorer windows, then paste the line again."
      return
    }
  }

  try {
    if ($Source) {
      # ---------- Git path: clone or update from a git URL or a repo path.
      Say 'Klipownia: pobieram najnowsz\u0105 wersj\u0119 (git)' 'Klipownia: getting the newest version (git)'
      $gitExe = Get-Command git.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
      if (-not $gitExe -and -not $SkipWinget -and (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
        Say 'Instaluj\u0119 Git... Je\u015bli Windows zapyta o zgod\u0119, kliknij Tak.' 'Installing Git... If Windows asks for permission, click Yes.'
        $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
        & winget.exe install -e --id Git.Git --silent --accept-package-agreements --accept-source-agreements
        $ErrorActionPreference = $old
        Update-SessionPath
        $gitExe = Get-Command git.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
      }
      if (-not $gitExe -and (Test-Path (Join-Path $env:ProgramFiles 'Git\cmd\git.exe'))) { $gitExe = Join-Path $env:ProgramFiles 'Git\cmd\git.exe' }
      if (-not $gitExe) { Fail 'Brakuje programu Git.' 'Git is missing.'; return }
      # A local repo path belongs to another user as far as git can tell (for example a WSL folder).
      $pre = @()
      if ($Source -notmatch '^(https?|ssh|git)://') { $pre = @('-c', 'safe.directory=*') }
      # git writes progress to stderr. PowerShell 5.1 would treat that as an error, so relax it here.
      $runGit = {
        param([string[]]$a)
        $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
        & $gitExe @pre @a
        $code = $LASTEXITCODE
        $ErrorActionPreference = $old
        if ($code -ne 0) { throw "git $($a -join ' ') failed with exit code $code" }
      }
      if (-not (Test-Path (Join-Path $Root '.git'))) {
        if ((Test-Path $Root) -and (Get-ChildItem -Force $Root | Select-Object -First 1)) { & $runGit @('init', '-q', $Root) }
        else { & $runGit @('clone', $Source, $Root) }
      }
      # projects, board, music, styles, settings.json, voice and models are ignored by git, so a reset
      # never touches them. A few of her files are tracked; keep her copies over ours.
      $tmp = Join-Path $env:TEMP ('Klipownia-keep-' + [Guid]::NewGuid().ToString('N'))
      foreach ($k in $KeepFiles) {
        $f = Join-Path $Root $k
        if (Test-Path $f) {
          New-Item -ItemType Directory -Force -Path (Split-Path -Parent (Join-Path $tmp $k)) | Out-Null
          Copy-Item $f (Join-Path $tmp $k)
        }
      }
      & $runGit @('-C', $Root, 'fetch', '-q', $Source, 'HEAD')
      & $runGit @('-C', $Root, 'reset', '-q', '--hard', 'FETCH_HEAD')
      foreach ($k in $KeepFiles) {
        $b = Join-Path $tmp $k
        if (Test-Path $b) { Copy-Item $b (Join-Path $Root $k) -Force }
      }
      if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
      Write-Host "Wersja / Version: $(& $gitExe -C $Root rev-parse --short HEAD)"
    } else {
      # ---------- Licence path (buyers): the key decides what may be downloaded.
      if (-not $Api) { $Api = $env:KLIPOWNIA_API }
      if (-not $Api) { $Api = 'https://api.klipownia.pl' }
      $Api = $Api.TrimEnd('/')

      # Key: -Key, then KLIPOWNIA_KEY, then the key an earlier install saved, then ask her.
      $settingsFile = Join-Path $Root 'settings.json'
      if (-not $Key) { $Key = $env:KLIPOWNIA_KEY }
      if (-not $Key -and (Test-Path $settingsFile)) {
        try {
          $lic = (Get-Content $settingsFile -Raw -Encoding UTF8 | ConvertFrom-Json).licence
          if ($lic -is [string]) { $Key = $lic } elseif ($lic -and $lic.key) { $Key = $lic.key }
        } catch { }  # a broken settings.json only means: ask for the key
      }

      # GET with the HTTP code and the JSON body, also for 4xx and 5xx (PowerShell 5.1 throws on those).
      function Get-Json([string]$url) {
        try {
          $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 -Uri $url
          return @{ Code = [int]$r.StatusCode; Body = ($r.Content | ConvertFrom-Json) }
        } catch [System.Net.WebException] {
          $resp = $_.Exception.Response
          if (-not $resp) { return @{ Code = 0; Body = $null } }
          $body = $null
          try { $body = (New-Object IO.StreamReader($resp.GetResponseStream())).ReadToEnd() | ConvertFrom-Json } catch { }
          return @{ Code = [int]$resp.StatusCode; Body = $body }
        }
      }
      function Show-ApiError($r) {
        $status = ''
        if ($r.Body) { $status = "$($r.Body.status) $($r.Body.error)" }
        if ($r.Code -eq 404 -or $r.Code -eq 400) {
          Fail 'Nie znamy tego klucza. Sprawd\u017a, czy skopiowa\u0142a\u015b/e\u015b go w ca\u0142o\u015bci z maila po zakupie.' 'Key not recognised. Check you copied all of it from the purchase email.'
        } elseif ($r.Code -eq 403 -and $status -match 'limit') {
          Fail 'Ten klucz dzia\u0142a ju\u017c na 3 komputerach. Zwolnij jeden w swoim koncie Polar (link jest w mailu z zakupem) i wklej lini\u0119 jeszcze raz.' `
            'This key is already used on 3 computers. Free one in your Polar account (the link is in the purchase email), then paste the line again.'
        } elseif ($r.Code -eq 403 -and $status -match 'expired') {
          Fail 'Link do pobrania wygas\u0142. Wklej lini\u0119 jeszcze raz.' 'The download link expired. Paste the line again.'
        } elseif ($r.Code -eq 403) {
          Fail 'Ten klucz nie jest ju\u017c aktywny. Odpowiedz na mail z zakupem, pomo\u017cemy.' 'This key is no longer active. Reply to the purchase email and we will help.'
        } elseif ($r.Code -eq 503) {
          Fail 'Sklep chwilowo nie odpowiada. Spr\u00f3buj jeszcze raz za godzin\u0119. Tw\u00f3j klucz jest w porz\u0105dku.' 'The shop is not answering right now. Try again in an hour. Your key is fine.'
        } elseif ($r.Code -eq 0) {
          Fail 'Brak po\u0142\u0105czenia z serwerem Klipowni. Sprawd\u017a internet i spr\u00f3buj jeszcze raz.' 'Cannot reach the Klipownia server. Check the internet connection and try again.'
        } else {
          Fail "Serwer Klipowni odpowiedzia\u0142 b\u0142\u0119dem $($r.Code). Spr\u00f3buj jeszcze raz za chwil\u0119." "The Klipownia server answered with error $($r.Code). Try again in a moment."
        }
      }

      $rel = $null
      $asked = $false
      for ($try = 1; $try -le 3; $try++) {
        if (-not $Key) {
          Write-Host ''
          Write-Host (T 'Wklej klucz licencji z maila po zakupie i naci\u015bnij Enter (prawy przycisk myszy wkleja).') -ForegroundColor Cyan
          $Key = Read-Host 'Paste the licence key from the purchase email and press Enter'
          $asked = $true
        }
        $Key = "$Key".Trim()
        if (-not $Key) { continue }
        Say 'Klipownia: sprawdzam klucz i pobieram najnowsz\u0105 wersj\u0119' 'Klipownia: checking the key and getting the newest version'
        $r = Get-Json "$Api/v1/release?key=$([Uri]::EscapeDataString($Key))&platform=win"
        if ($r.Code -eq 200 -and $r.Body.url) { $rel = $r.Body; break }
        Show-ApiError $r
        # Only a key she just typed is worth asking again. A 403 or 503 does not change by retyping.
        if (-not $asked -or ($r.Code -ne 404 -and $r.Code -ne 400)) { return }
        $Key = $null
      }
      if (-not $rel) { return }
      Write-Host "Wersja / Version: $($rel.version)"

      # Download (the link lives 15 minutes), unpack, find the one top folder (reel-studio-<sha>/).
      $work = Join-Path $env:TEMP ('Klipownia-' + [Guid]::NewGuid().ToString('N'))
      New-Item -ItemType Directory -Force -Path $work | Out-Null
      $zip = Join-Path $work 'klipownia.zip'
      Write-Host (T 'Pobieram Klipowni\u0119... / Downloading Klipownia...')
      try {
        Invoke-WebRequest -UseBasicParsing -TimeoutSec 900 -Uri "$Api$($rel.url)" -OutFile $zip
      } catch [System.Net.WebException] {
        $code = 0
        $body = $null
        if ($_.Exception.Response) {
          $code = [int]$_.Exception.Response.StatusCode
          try { $body = (New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd() | ConvertFrom-Json } catch { }
        }
        Show-ApiError @{ Code = $code; Body = $body }
        Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
        return
      }
      Expand-Archive -Path $zip -DestinationPath (Join-Path $work 'x') -Force
      $top = @(Get-ChildItem -Directory (Join-Path $work 'x'))
      if ($top.Count -ne 1) {
        Fail 'Pobrany plik jest niepe\u0142ny. Wklej lini\u0119 jeszcze raz.' 'The download is incomplete. Paste the line again.'
        Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
        return
      }
      $src = $top[0].FullName

      # Copy over $Root. Her folders stay as they are: the zip has only empty placeholders there,
      # and her files are skipped when she already has them.
      New-Item -ItemType Directory -Force -Path $Root | Out-Null
      $xd = @('projects', 'board', 'styles', 'voice', 'models', 'logs', '.venv', '.venv-tts', 'node_modules', (Join-Path 'assets' 'music')) |
        ForEach-Object { Join-Path $src $_ }
      $xf = @()
      foreach ($k in $KeepFiles) { if (Test-Path (Join-Path $Root $k)) { $xf += (Join-Path $src $k) } }
      $robo = @($src, $Root, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:1', '/W:1', '/XD') + $xd
      if ($xf.Count) { $robo += @('/XF') + $xf }
      $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
      & robocopy.exe @robo | Out-Host
      $rc = $LASTEXITCODE
      $ErrorActionPreference = $old
      if ($rc -ge 8) { throw "robocopy failed with code $rc" }
      foreach ($d in @('projects', 'board', 'assets\music', 'styles', 'instagram\drafts')) {
        New-Item -ItemType Directory -Force -Path (Join-Path $Root $d) | Out-Null
      }
      Set-Content -Path (Join-Path $Root '.version') -Value $rel.version -Encoding ASCII
      Remove-Item -Recurse -Force $work

      # Save the key where Klipownia reads it, so updates work without asking again.
      # The app activates it on first start (this computer gets its slot then).
      $cfg = $null
      if (Test-Path $settingsFile) {
        try { $cfg = Get-Content $settingsFile -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $cfg = $null }  # never rewrite a file we cannot read
      } else {
        $cfg = New-Object PSObject
      }
      if ($cfg) {
        $have = $cfg.licence
        if ($have -and $have -isnot [string]) { $have = $have.key }
        if ($have -ne $Key) {
          $cfg | Add-Member -NotePropertyName licence -NotePropertyValue ([pscustomobject]@{ key = $Key; status = 'none' }) -Force
          [IO.File]::WriteAllText($settingsFile, ($cfg | ConvertTo-Json -Depth 20) + "`n", (New-Object Text.UTF8Encoding($false)))
        }
      }
    }

    if ($NoInstall) { return }
    $installer = Join-Path $Root 'install.ps1'
    if (-not (Test-Path $installer)) { Fail "Brakuje pliku $installer." "$installer is missing."; return }
    # Bypass only for this one child process. The system execution policy stays as it is.
    $a = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $installer, '-Root', $Root)
    if ($SkipWinget) { $a += '-SkipWinget' }
    if ($ClaudeConfig) { $a += @('-ClaudeConfig', $ClaudeConfig) }
    if ($NoShortcuts) { $a += '-NoShortcuts' }
    if ($NoLogin) { $a += '-NoLogin' }
    & powershell.exe @a
  } catch {
    Write-Host "$_" -ForegroundColor Red
    Fail 'Co\u015b posz\u0142o nie tak przy pobieraniu. Zr\u00f3b zdj\u0119cie tego okna i wy\u015blij nam (odpowiedz na mail z zakupem).' 'Something went wrong while downloading. Send us a photo of this window (reply to the purchase email).'
  }
}
