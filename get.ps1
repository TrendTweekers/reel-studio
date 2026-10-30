# Reel Studio one-line installer and updater for Windows 10 and 11. Paste into PowerShell:
#   irm https://raw.githubusercontent.com/TrendTweekers/reel-studio/main/get.ps1 | iex
# Downloads the newest version into %USERPROFILE%\ReelStudio and runs install.ps1. Safe to run again
# to update: her reels, pictures, music, styles, voice, models and preferences are kept.
# This text runs inside her PowerShell window (iex), so it never calls exit: that would close the window.
param(
  [string]$Root = (Join-Path $env:USERPROFILE 'ReelStudio'),
  [string]$Source = 'https://github.com/TrendTweekers/reel-studio',  # or any git URL or local repo path (tests)
  [switch]$NoInstall,
  [switch]$SkipWinget,
  [string]$ClaudeConfig,
  [switch]$NoShortcuts,
  [switch]$NoLogin
)

& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  [Console]::OutputEncoding = [Text.Encoding]::UTF8  # git and the installer print UTF-8

  # Polish letters are written as \uXXXX: this file must stay ASCII, because PowerShell 5.1 reads a
  # file without a BOM as ANSI, and a BOM breaks "irm | iex". T turns them back into letters.
  function T([string]$s) { [regex]::Unescape($s) }
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
  function Find-Git {
    $g = Get-Command git.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
    if ($g) { return $g }
    foreach ($f in @((Join-Path $env:ProgramFiles 'Git\cmd\git.exe'), (Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd\git.exe'))) {
      if (Test-Path $f) { return $f }
    }
    return $null
  }
  # git writes progress to stderr. PowerShell 5.1 would treat that as an error, so relax it here.
  function Git([string[]]$ArgList) {
    $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    & $script:GitExe @script:GitPre @ArgList
    $code = $LASTEXITCODE
    $ErrorActionPreference = $old
    if ($code -ne 0) { throw "git $($ArgList -join ' ') failed with exit code $code" }
  }

  try {
    Say 'Reel Studio: pobieram najnowsz\u0105 wersj\u0119' 'Reel Studio: getting the newest version'

    $script:GitExe = Find-Git
    if (-not $script:GitExe) {
      if ($SkipWinget) { Fail 'Brakuje programu Git (-SkipWinget jest ustawione).' 'Git is missing and -SkipWinget is set.'; return }
      if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
        Fail 'Brakuje programu winget. Zainstaluj \u201eInstalator aplikacji\u201d (App Installer) ze sklepu Microsoft Store i wklej t\u0119 lini\u0119 jeszcze raz.' `
          'winget is missing. Install "App Installer" from the Microsoft Store, then paste the line again.'
        return
      }
      Say 'Instaluj\u0119 Git... Je\u015bli Windows zapyta o zgod\u0119, kliknij Tak.' 'Installing Git... If Windows asks for permission, click Yes.'
      $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
      & winget.exe install -e --id Git.Git --silent --accept-package-agreements --accept-source-agreements
      $ErrorActionPreference = $old
      Update-SessionPath
      $script:GitExe = Find-Git
      if (-not $script:GitExe) { Fail 'Git si\u0119 nie zainstalowa\u0142. Zamknij to okno, otw\u00f3rz PowerShell jeszcze raz i wklej lini\u0119 ponownie.' 'Git did not install. Close this window, open PowerShell again and paste the line again.'; return }
    }
    # A local repo path (tests) belongs to another user as far as git can tell (for example a WSL folder).
    $script:GitPre = @()
    if ($Source -notmatch '^(https?|ssh|git)://') { $script:GitPre = @('-c', 'safe.directory=*') }

    if (-not (Test-Path (Join-Path $Root '.git'))) {
      if ((Test-Path $Root) -and (Get-ChildItem -Force $Root | Select-Object -First 1)) {
        # An older copy without git (for example from a zip): turn it into a git folder below.
        Git @('init', '-q', $Root)
      } else {
        Git @('clone', $Source, $Root)
      }
    }
    if (Test-Path (Join-Path $Root '.git')) {
      # Update. projects, board, music, styles, settings.json, voice and models are ignored by git,
      # so a reset never touches them. A few of her files are tracked; keep her copies over ours.
      $keep = @('brand.md', 'vocabulary.txt', 'instagram\voice.md')
      $tmp = Join-Path $env:TEMP ("ReelStudio-keep-" + [Guid]::NewGuid().ToString('N'))
      New-Item -ItemType Directory -Force -Path $tmp | Out-Null
      foreach ($k in $keep) {
        $f = Join-Path $Root $k
        if (Test-Path $f) {
          New-Item -ItemType Directory -Force -Path (Split-Path -Parent (Join-Path $tmp $k)) | Out-Null
          Copy-Item $f (Join-Path $tmp $k)
        }
      }
      Git @('-C', $Root, 'fetch', '-q', $Source, 'HEAD')
      Git @('-C', $Root, 'reset', '-q', '--hard', 'FETCH_HEAD')
      foreach ($k in $keep) {
        $b = Join-Path $tmp $k
        if (Test-Path $b) { Copy-Item $b (Join-Path $Root $k) -Force }
      }
      Remove-Item -Recurse -Force $tmp
      $rev = (& $script:GitExe -C $Root rev-parse --short HEAD)
      Write-Host "Wersja / Version: $rev"
    }

    if ($NoInstall) { return }
    $installer = Join-Path $Root 'install.ps1'
    if (-not (Test-Path $installer)) { Fail ((T 'Brakuje pliku {0}.') -f $installer) "$installer is missing."; return }
    # Bypass only for this one child process. The system execution policy stays as it is.
    $a = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $installer, '-Root', $Root)
    if ($SkipWinget) { $a += '-SkipWinget' }
    if ($ClaudeConfig) { $a += @('-ClaudeConfig', $ClaudeConfig) }
    if ($NoShortcuts) { $a += '-NoShortcuts' }
    if ($NoLogin) { $a += '-NoLogin' }
    & powershell.exe @a
  } catch {
    Write-Host "$_" -ForegroundColor Red
    Fail 'Co\u015b posz\u0142o nie tak przy pobieraniu. Zr\u00f3b zdj\u0119cie tego okna i wy\u015blij Peterowi.' 'Something went wrong while downloading. Send Peter a photo of this window.'
  }
}
