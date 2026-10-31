# Klipownia: setup on the user's Mac (for Peter)

Takes 30 to 45 minutes, mostly waiting. You need the user's Mac, the user's Mac password and the user's claude.ai login.

Check first (Apple menu > About This Mac):
- The chip must say Apple M1 or newer. Intel Macs are not supported.
- macOS must be 15 or newer. The installer stops with a clear message if not.
- Their account must be an Administrator (System Settings > Users & Groups).
- At least 15 GB of free disk space.

1. Copy `reel-studio.zip` to the user's Mac (AirDrop is fine) and double-click it to unzip.
2. Open **Terminal** (Cmd+Space, type Terminal, Enter). Type `bash ` (with a space), drag the
   `install.sh` file from the unzipped folder into the Terminal window, press Enter.
   Do not double-click the .command files before this.
3. Type the user's Mac password once when asked (nothing shows while typing; that is normal). Then wait.
   It installs Homebrew, Node, ffmpeg, Python, Chrome (it asks first), Claude Code, and downloads the
   speech model (1.6 GB). The window says "Done" at the end. If it says "Something went wrong",
   take a photo and look at `~/Library/Logs/Klipownia-install.log`. Run the installer again after
   fixing the cause. It continues where it stopped.
4. Log in to Claude once: open Finder > Go > Home > Klipownia and double-click
   **Ask Claude.command**. Press Enter at the theme question, choose "Yes, I trust this folder",
   then choose **"Claude account with subscription"**, log in in the browser and click Authorize.
   When Claude answers, type `/exit`. (Never choose the API key option.)
5. Open **Klipownia** from Applications. Drag it to the Dock. The editing page opens.
6. First real test: AirDrop a short video from their phone, drop it on the page. Speech-to-text
   runs on the CPU, so a 1-minute video takes a few minutes. The first video render is slower too.

Every day after that: click Klipownia in the Dock. That is all.

- Stop the app: double-click `Stop Klipownia.command` in `~/Klipownia`. Do this before an update too.
- Files live in `~/Klipownia`. The user's reels: `~/Klipownia/projects`. Finished videos: in each reel's
  `out` folder, and the Download button on the page.
- Logs: `~/Library/Logs/Klipownia.log` (app) and `~/Library/Logs/Klipownia-install.log` (install).
- Update later: run `install.sh` from a newer zip the same way (always with `bash install.sh`).
  The user's reels, pictures, music, styles, brand.md and vocabulary.txt are kept.

## Windows 10 and 11 (for Peter)

Takes 30 to 45 minutes, mostly waiting. You need the user's PC (64-bit Intel or AMD, not ARM),
about 15 GB free space and the user's claude.ai login (Pro or Max). An administrator account
helps: Node.js and Git ask "Yes/No" once each (UAC). Python and FFmpeg install for the user only.

1. Open **PowerShell** (Windows key, type PowerShell, Enter). Not "as administrator".
2. Paste the line and press Enter:

       irm https://raw.githubusercontent.com/TrendTweekers/reel-studio/main/get.ps1 | iex

   Paste the licence key from the purchase email when asked. `get.ps1` (the one-liner loads it
   from raw GitHub for now; it moves to the klipownia.pl domain later):
   - Key: `-Key`, else env `KLIPOWNIA_KEY`, else `settings.json` of an earlier install
     (`"licence": {"key": ...}` or an old plain string), else it asks (3 tries for a typed key).
   - `GET <API>/v1/release?key=<key>&platform=win` (no activation id; the app activates on first
     start). API: `-Api`, else env `KLIPOWNIA_API`, else `https://api.klipownia.pl`.
     404/400: wrong key. 403: revoked or 3 computers used (`limit`). 503: shop down, try in an hour.
   - Downloads `<API><url>` (valid 15 min), unpacks the zip (one top folder `reel-studio-<sha>/`)
     and copies it over `%USERPROFILE%\Klipownia`. Never touched: `projects`, `board`,
     `assets\music`, `styles`, `voice`, `models`, `logs`, `.venv`, `.venv-tts`, `node_modules`.
     Never replaced when she has them: `settings.json`, `brand.md`, `vocabulary.txt`,
     `keywords.md`, `instagram\voice.md`.
   - Writes `.version`, saves the key in `settings.json` (`licence: {key, status: "none"}`),
     then runs `install.ps1` with `-ExecutionPolicy Bypass` for that one process. The system
     execution policy is not changed.
   - An old `%USERPROFILE%\ReelStudio` (and no `Klipownia` yet) is moved first, after stopping
     its server.
   - Git fallback for us: `-Source <git url or repo path>` clones or updates with git instead
     (`fetch` + `reset --hard`, her tracked files copied back).
3. `install.ps1` prints "Krok 1/7 ... 7/7" with the time per step: winget packages
   (`OpenJS.NodeJS.LTS`, `Python.Python.3.12` per user, `Gyan.FFmpeg`), stops an old server,
   `npm ci` + web build + Remotion browser + Remotion skills, `.venv` with `py -3.12` + pip +
   speech model + face models, Claude Code (official `irm https://claude.ai/install.ps1 | iex`,
   lands in `%USERPROFILE%\.local\bin\claude.exe`), the Claude Desktop connector, and the
   "Klipownia" shortcuts on the Desktop and in the Start menu (old "Reel Studio" shortcuts are
   removed, and an old "reel-studio" connector entry too). At the end it runs
   `claude auth login --claudeai` when Claude is not logged in yet.
4. If it says "Coś poszło nie tak / Something went wrong", look at
   `%USERPROFILE%\Klipownia\logs\Klipownia-install.log`, fix the cause and paste the line again.
   It continues where it stopped.

Every day after that: click **Klipownia** on the Desktop or in the Start menu.

- The shortcut runs `win\start.ps1` hidden: it starts the server (`node --import <tsx loader>
  server/index.ts`, one process) if `http://127.0.0.1:8787/api/projects` does not answer, waits up to
  30 s, then opens Chrome or Edge in app mode. Without `.install-ok` it runs the installer instead.
  While the server runs, `win\keepawake.ps1` keeps the PC from sleeping (like `caffeinate` on a Mac).
- Stop the app: double-click `win\Stop Klipownia.cmd` (ends the node process on port 8787).
- Talk to Claude in the app folder: `win\Ask Claude.cmd` (also the way to log in later).
- Logs: `%USERPROFILE%\Klipownia\logs\` (`Klipownia.log`, `Klipownia-errors.log`,
  `Klipownia-install.log`).
- `start.ps1` sets `REEL_PYTHON=.venv\Scripts\python.exe` and `REEL_TTS_PYTHON=.venv-tts\Scripts\python.exe`
  unless they are set already, and removes `ANTHROPIC_API_KEY` for the server.
- Test switches for `install.ps1`: `-Root <folder>`, `-SkipWinget`, `-ClaudeConfig <file>`,
  `-NoShortcuts`, `-NoLogin`. `get.ps1` takes the same plus `-Key`, `-Api`,
  `-Source <git url or repo path>` and `-NoInstall`. Run from another folder, `install.ps1` first copies itself into `-Root`.
