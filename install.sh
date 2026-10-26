#!/bin/bash
# Reel Studio installer for macOS (Apple Silicon, macOS 15 or newer). Safe to run again: it only adds what is missing.
set -eE
say() { printf "\n\033[1m%s\033[0m\n" "$1"; }
stop() { printf "\n\033[1m%s\033[0m\n" "$1"; exit 1; }

# ---- Preflight: stop early with a clear message on a Mac that cannot run Reel Studio ----
[ "$(uname -s)" = "Darwin" ] || stop "This installer is for a Mac."
if [ "$(sysctl -in hw.optional.arm64 2>/dev/null)" != "1" ]; then
  stop "This Mac has an Intel chip. Reel Studio needs an Apple chip (M1 or newer). Stop here. Check: Apple menu > About This Mac."
fi
if [ "$(uname -m)" != "arm64" ]; then
  stop "This Terminal runs in Rosetta mode. Open Terminal again without Rosetta (Finder > Applications > Utilities > Terminal > Get Info), then run the installer again."
fi
MACOS_MAJOR="$(sw_vers -productVersion | cut -d. -f1)"
[ "$MACOS_MAJOR" -ge 15 ] 2>/dev/null || stop "This Mac has macOS $(sw_vers -productVersion). Reel Studio needs macOS 15 or newer. Update macOS first (System Settings > General > Software Update), then run the installer again."
FREE_KB="$(df -k / | awk 'NR==2 {print $4}')"
[ "${FREE_KB:-0}" -ge 15728640 ] || stop "Not enough free disk space. Reel Studio needs 15 GB free. Free up space, then run the installer again."

# Reel Studio always lives in ~/ReelStudio. Run from somewhere else (Downloads, AirDrop), it copies
# itself there first. Her reels, pictures and music in an existing ~/ReelStudio are never touched.
TARGET="$HOME/ReelStudio"
SRC="$(cd "$(dirname "$0")" && pwd)"
if [ "$SRC" != "$TARGET" ]; then
  say "Copying Reel Studio to $TARGET"
  mkdir -p "$TARGET"
  rsync -a --exclude /node_modules --exclude /.venv --exclude /models --exclude '/projects/*' --exclude '/board/*' \
    --exclude '/assets/music/*' --exclude '/styles/*' --exclude /settings.json --exclude /brand.md \
    --exclude /vocabulary.txt --exclude /keywords.md --exclude /.install-ok "$SRC/" "$TARGET/"
  [ -f "$TARGET/brand.md" ] || cp "$SRC/brand.md" "$TARGET/brand.md"
  if [ ! -f "$TARGET/vocabulary.txt" ]; then
    if [ -f "$SRC/vocabulary.txt" ]; then cp "$SRC/vocabulary.txt" "$TARGET/vocabulary.txt"; else : > "$TARGET/vocabulary.txt"; fi
  fi
  mkdir -p "$TARGET/projects" "$TARGET/board" "$TARGET/assets/music" "$TARGET/styles"
  exec bash "$TARGET/install.sh"
fi
cd "$TARGET"

# ---- Log everything to a file, and say what to do if it fails ----
LOG="$HOME/Library/Logs/ReelStudio-install.log"
mkdir -p "$HOME/Library/Logs"
exec > >(tee -a "$LOG") 2>&1
trap 'printf "\n\033[1mSomething went wrong. Send Peter a photo of this window and the file ~/Library/Logs/ReelStudio-install.log\033[0m\n"' ERR
echo "=== Reel Studio install, $(date) ==="
rm -f .install-ok

# Python and Node tools used below (Node 24 is keg-only: it is not on PATH by itself)
add_node_path() {
  local p
  p="$(brew --prefix node@24 2>/dev/null)/bin"
  [ -d "$p" ] && export PATH="$p:$PATH"
  return 0
}

say "1/8  Homebrew (installs the tools below; it asks for your Mac password once)"
id -Gn | tr ' ' '\n' | grep -qx admin || stop "This Mac account is not an Administrator. Make it one (System Settings > Users & Groups), then run the installer again."
echo "Type your Mac password now (nothing shows while you type; that is normal)."
sudo -v
# keep the password valid while this installer runs
( while true; do sudo -n true 2>/dev/null; sleep 50; kill -0 "$$" 2>/dev/null || exit 0; done ) &
if ! command -v brew >/dev/null 2>&1 && [ ! -x /opt/homebrew/bin/brew ]; then
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
[ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"
command -v brew >/dev/null 2>&1 || stop "Homebrew did not install."

say "2/8  Node, ffmpeg and Python (a few minutes)"
brew list node@24 >/dev/null 2>&1 || brew install node@24
brew list ffmpeg >/dev/null 2>&1 || brew install ffmpeg
brew list python@3.12 >/dev/null 2>&1 || brew install python@3.12
add_node_path

say "3/8  Stopping the old Reel Studio server (if it runs)"
lsof -ti tcp:8787 2>/dev/null | xargs kill 2>/dev/null || true
sleep 1

say "4/8  App packages"
npm ci --no-audit --no-fund
npm run build:web
echo "Downloading the video engine's browser (about 100 MB)..."
npx remotion browser ensure
echo "Installing the official Remotion skills for Claude (video know-how)..."
npx -y skills@1.7.4 add remotion-dev/skills -a claude-code -y --copy \
  -s remotion-best-practices remotion-markup remotion-captions remotion-multimedia remotion-render remotion-docs \
  || echo "Could not install the Remotion skills now (no internet?). Reel Studio works without them."

say "5/8  Video analysis tools (speech to text, face finder). About 1.5 GB. Please wait."
PY="$(brew --prefix python@3.12)/bin/python3.12"
[ -d .venv ] || "$PY" -m venv .venv
.venv/bin/pip install --upgrade pip >/dev/null
.venv/bin/pip install -r tools/requirements.txt -c tools/constraints.txt
[ -f assets/sfx/pop.wav ] || .venv/bin/python tools/gen_sfx.py
echo "Downloading the speech model (1.6 GB). This is the slowest part: 5 to 15 minutes."
.venv/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('large-v3-turbo', device='cpu', compute_type='int8', download_root='models')"
echo "Downloading the face and person finder models..."
.venv/bin/python -c "import sys; sys.path.insert(0,'tools'); import faces, cutout, cover_frames; from _common import model_file; [model_file(n,u) for n,u in faces.MODELS.values()]; model_file('selfie_multiclass_256x256.tflite', cutout.URL); model_file('selfie_segmenter.tflite', cutout.URL_BIN); model_file('face_landmarker.task', cover_frames.URL)"

say "6/8  A browser for the editor"
HAVE_BROWSER=0
for b in "Google Chrome" "Microsoft Edge" "Brave Browser"; do
  if [ -d "/Applications/$b.app" ] || [ -d "$HOME/Applications/$b.app" ]; then HAVE_BROWSER=1; fi
done
if [ "$HAVE_BROWSER" = 0 ]; then
  echo "Reel Studio works best in Google Chrome (Safari may not show the cut-out video)."
  ANS=""
  printf "Install Google Chrome now? [Y/n] (starts by itself in 20 seconds) "
  read -r -t 20 ANS || true
  echo
  case "$ANS" in
    n|N|no|NO) echo "Skipped. Install Google Chrome yourself before you use Reel Studio." ;;
    *) brew install --cask google-chrome ;;
  esac
else
  echo "A Chromium browser is already installed."
fi

say "7/8  Claude Code (uses your own Claude subscription, no API key)"
if ! command -v claude >/dev/null 2>&1 && [ ! -x "$HOME/.local/bin/claude" ]; then
  curl -fsSL https://claude.ai/install.sh | bash
fi
# Make 'claude' work in new Terminal windows too (the installer does not do this itself)
if ! grep -qsF '.local/bin' "$HOME/.zshrc"; then
  printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$HOME/.zshrc"
fi
if [ -n "$ANTHROPIC_API_KEY" ]; then
  echo "WARNING: ANTHROPIC_API_KEY is set on this Mac. Claude Code would bill the API, not your subscription."
  echo "Remove it from ~/.zshrc if you did not set it on purpose."
fi

say "8/8  The Reel Studio app"
APP="/Applications/Reel Studio.app"
rm -rf "$APP"
cp -R "mac/Reel Studio.app" "$APP"
echo "$TARGET" > "$APP/Contents/Resources/home.txt"
chmod +x "$APP/Contents/MacOS/ReelStudio"
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true
xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null || true
codesign --force --deep -s - "$APP" >/dev/null 2>&1 || true
chmod +x "Start Reel Studio.command" "Ask Claude.command" "Stop Reel Studio.command" 2>/dev/null || true

# The "Reel Studio" connector for her normal Claude Desktop chat (keeps any other connectors).
NODE_BIN="$(brew --prefix node@24 2>/dev/null)/bin/node"
[ -x "$NODE_BIN" ] || NODE_BIN="$(command -v node)"
if "$NODE_BIN" mcp/register.mjs "$NODE_BIN" "$TARGET"; then
  echo "Claude Desktop: the Reel Studio connector is on. Quit and reopen Claude Desktop to see it."
else
  echo "Could not add the connector to Claude Desktop (Reel Studio itself works)."
fi

date > .install-ok
say "Done"
echo "Open 'Reel Studio' from Applications (or Launchpad). Drag it to the Dock to keep it there."
# One-time Claude login with her subscription (never the API option). Skipped when already logged in.
CLAUDE="$HOME/.local/bin/claude"
[ -x "$CLAUDE" ] || CLAUDE="$(command -v claude || true)"
if [ -n "$CLAUDE" ]; then
  if "$CLAUDE" auth status --json 2>/dev/null | grep -q '"loggedIn": *true'; then
    echo "Claude is already logged in."
  else
    say "Last step: log in to Claude"
    echo "A browser window opens. Log in with your Claude account and click Authorize."
    unset ANTHROPIC_API_KEY
    "$CLAUDE" auth login --claudeai || echo "Login did not finish. You can do it later: double-click 'Ask Claude.command' in ~/ReelStudio."
  fi
fi
echo "To stop Reel Studio: double-click 'Stop Reel Studio.command'."
