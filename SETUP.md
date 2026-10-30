# Reel Studio: setup on the user's Mac (for Peter)

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
   take a photo and look at `~/Library/Logs/ReelStudio-install.log`. Run the installer again after
   fixing the cause. It continues where it stopped.
4. Log in to Claude once: open Finder > Go > Home > ReelStudio and double-click
   **Ask Claude.command**. Press Enter at the theme question, choose "Yes, I trust this folder",
   then choose **"Claude account with subscription"**, log in in the browser and click Authorize.
   When Claude answers, type `/exit`. (Never choose the API key option.)
5. Open **Reel Studio** from Applications. Drag it to the Dock. The editing page opens.
6. First real test: AirDrop a short video from their phone, drop it on the page. Speech-to-text
   runs on the CPU, so a 1-minute video takes a few minutes. The first video render is slower too.

Every day after that: click Reel Studio in the Dock. That is all.

- Stop the app: double-click `Stop Reel Studio.command` in `~/ReelStudio`. Do this before an update too.
- Files live in `~/ReelStudio`. The user's reels: `~/ReelStudio/projects`. Finished videos: in each reel's
  `out` folder, and the Download button on the page.
- Logs: `~/Library/Logs/ReelStudio.log` (app) and `~/Library/Logs/ReelStudio-install.log` (install).
- Update later: run `install.sh` from a newer zip the same way (always with `bash install.sh`).
  The user's reels, pictures, music, styles, brand.md and vocabulary.txt are kept.
