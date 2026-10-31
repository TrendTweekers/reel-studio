#!/bin/bash
# Klipownia installer for macOS (Apple Silicon, macOS 15 or newer). Safe to run again: it only adds what is missing.
# Install folder: ~/Klipownia (get.sh may pass another one in KLIPOWNIA_HOME).
set -eE
# Every message twice: Polish first (the buyers), then English.
say() { printf "\n\033[1m%s\033[0m\n%s\n" "$1" "$2"; }
info() { printf "%s\n%s\n" "$1" "$2"; }
stop() { printf "\n\033[1m%s\033[0m\n\033[1m%s\033[0m\n" "$1" "$2"; exit 1; }

# ---- Preflight: stop early with a clear message on a Mac that cannot run Klipownia ----
[ "$(uname -s)" = "Darwin" ] || stop "Ta instalacja jest dla Maca." "This installer is for a Mac."
if [ "$(sysctl -in hw.optional.arm64 2>/dev/null)" != "1" ]; then
  stop "Ten Mac ma procesor Intel. Klipownia potrzebuje procesora Apple (M1 albo nowszego). Sprawdź: menu Apple > Ten Mac." \
    "This Mac has an Intel chip. Klipownia needs an Apple chip (M1 or newer). Stop here. Check: Apple menu > About This Mac."
fi
if [ "$(uname -m)" != "arm64" ]; then
  stop "Terminal działa w trybie Rosetta. Otwórz Terminal bez Rosetty (Finder > Aplikacje > Narzędzia > Terminal > Pokaż informacje), potem uruchom instalację jeszcze raz." \
    "This Terminal runs in Rosetta mode. Open Terminal again without Rosetta (Finder > Applications > Utilities > Terminal > Get Info), then run the installer again."
fi
MACOS_MAJOR="$(sw_vers -productVersion | cut -d. -f1)"
[ "$MACOS_MAJOR" -ge 15 ] 2>/dev/null || stop \
  "Ten Mac ma macOS $(sw_vers -productVersion). Klipownia potrzebuje macOS 15 albo nowszego. Najpierw zaktualizuj macOS (Ustawienia systemowe > Ogólne > Uaktualnienia), potem uruchom instalację jeszcze raz." \
  "This Mac has macOS $(sw_vers -productVersion). Klipownia needs macOS 15 or newer. Update macOS first (System Settings > General > Software Update), then run the installer again."

TARGET="${KLIPOWNIA_HOME:-$HOME/Klipownia}"
# Old name: Reel Studio lived in ~/ReelStudio. Move it once, with all her reels, music and styles.
OLD_HOME="$HOME/ReelStudio"
if [ -z "${KLIPOWNIA_HOME:-}" ] && [ -d "$OLD_HOME" ] && [ ! -e "$TARGET" ]; then
  say "Przenoszę Reel Studio do nowego folderu: $TARGET" "Moving Reel Studio to the new folder: $TARGET"
  lsof -ti tcp:8787 2>/dev/null | xargs kill 2>/dev/null || true
  sleep 1
  mv "$OLD_HOME" "$TARGET"
  info "Gotowe. Twoje rolki, muzyka i style są teraz w $TARGET" "Done. Your reels, music and styles are now in $TARGET"
fi

FREE_KB="$(df -k / | awk 'NR==2 {print $4}')"
# First install needs about 6 GB plus room for her videos. A second run (the big parts are already
# in the install folder) needs only a little.
if [ -d "$TARGET/.venv" ] && [ -d "$TARGET/models" ]; then NEED_GB=3; else NEED_GB=10; fi
FREE_GB=$(( ${FREE_KB:-0} / 1048576 ))
[ "$FREE_GB" -ge "$NEED_GB" ] || stop \
  "Za mało miejsca na dysku: wolne $FREE_GB GB, Klipownia potrzebuje $NEED_GB GB. Opróżnij Kosz i usuń duże pliki, których nie potrzebujesz (Ustawienia systemowe > Ogólne > Pamięć), potem uruchom instalację jeszcze raz." \
  "Not enough free disk space: $FREE_GB GB free, Klipownia needs $NEED_GB GB. Empty the Bin and delete big files you do not need (System Settings > General > Storage), then run the installer again."

# Klipownia always lives in the install folder. Run from somewhere else (Downloads, AirDrop), it copies
# itself there first. Her reels, pictures and music in an existing install folder are never touched.
SRC="$(cd "$(dirname "$0")" && pwd)"
if [ "$SRC" != "$TARGET" ]; then
  say "Kopiuję Klipownię do $TARGET" "Copying Klipownia to $TARGET"
  mkdir -p "$TARGET"
  rsync -a --exclude /node_modules --exclude /.venv --exclude /.venv-tts --exclude /models --exclude /voice --exclude /logs \
    --exclude '/projects/*' --exclude '/board/*' --exclude '/assets/music/*' --exclude '/styles/*' --exclude /settings.json \
    --exclude /brand.md --exclude /vocabulary.txt --exclude /keywords.md --exclude '/instagram/*' --exclude /.install-ok "$SRC/" "$TARGET/"
  [ -f "$TARGET/brand.md" ] || cp "$SRC/brand.md" "$TARGET/brand.md"
  mkdir -p "$TARGET/instagram/drafts"
  [ -f "$TARGET/instagram/voice.md" ] || cp "$SRC/instagram/voice.md" "$TARGET/instagram/voice.md"
  if [ ! -f "$TARGET/vocabulary.txt" ]; then
    if [ -f "$SRC/vocabulary.txt" ]; then cp "$SRC/vocabulary.txt" "$TARGET/vocabulary.txt"; else : > "$TARGET/vocabulary.txt"; fi
  fi
  mkdir -p "$TARGET/projects" "$TARGET/board" "$TARGET/assets/music" "$TARGET/styles"
  KLIPOWNIA_HOME="$TARGET" exec bash "$TARGET/install.sh"
fi
cd "$TARGET"

# ---- Log everything to a file, and say what to do if it fails ----
LOG="$HOME/Library/Logs/Klipownia-install.log"
mkdir -p "$HOME/Library/Logs"
exec > >(tee -a "$LOG") 2>&1
trap 'printf "\n\033[1m%s\n%s\033[0m\n" "Coś poszło nie tak. Odpowiedz na mail z zakupem: zdjęcie tego okna i plik ~/Library/Logs/Klipownia-install.log" "Something went wrong. Reply to the purchase email with a photo of this window and the file ~/Library/Logs/Klipownia-install.log"' ERR
echo "=== Klipownia install, $(date) ==="
rm -f .install-ok
# Files of the old name that an update copied over do not go away by themselves.
rm -f "Start Reel Studio.command" "Stop Reel Studio.command"
rm -rf "mac/Reel Studio.app"

# Python and Node tools used below (Node 24 is keg-only: it is not on PATH by itself)
add_node_path() {
  local p
  p="$(brew --prefix node@24 2>/dev/null)/bin"
  [ -d "$p" ] && export PATH="$p:$PATH"
  return 0
}

say "1/8  Homebrew (instaluje narzędzia poniżej; raz zapyta o hasło do Maca)" "1/8  Homebrew (installs the tools below; it asks for your Mac password once)"
id -Gn | tr ' ' '\n' | grep -qx admin || stop \
  "To konto na Macu nie jest kontem administratora. Zmień to (Ustawienia systemowe > Użytkownicy i grupy), potem uruchom instalację jeszcze raz." \
  "This Mac account is not an Administrator. Make it one (System Settings > Users & Groups), then run the installer again."
info "Wpisz teraz hasło do Maca (podczas pisania nic nie widać, tak ma być)." "Type your Mac password now (nothing shows while you type; that is normal)."
sudo -v
# keep the password valid while this installer runs
( while true; do sudo -n true 2>/dev/null; sleep 50; kill -0 "$$" 2>/dev/null || exit 0; done ) &
if ! command -v brew >/dev/null 2>&1 && [ ! -x /opt/homebrew/bin/brew ]; then
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
[ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"
command -v brew >/dev/null 2>&1 || stop "Homebrew się nie zainstalował." "Homebrew did not install."

say "2/8  Node, ffmpeg i Python (kilka minut)" "2/8  Node, ffmpeg and Python (a few minutes)"
brew list node@24 >/dev/null 2>&1 || brew install node@24
brew list ffmpeg >/dev/null 2>&1 || brew install ffmpeg
brew list python@3.12 >/dev/null 2>&1 || brew install python@3.12
add_node_path

say "3/8  Zatrzymuję stary serwer Klipowni (jeśli działa)" "3/8  Stopping the old Klipownia server (if it runs)"
lsof -ti tcp:8787 2>/dev/null | xargs kill 2>/dev/null || true
sleep 1

say "4/8  Pakiety aplikacji" "4/8  App packages"
npm ci --no-audit --no-fund
npm run build:web
info "Pobieram przeglądarkę silnika wideo (około 100 MB)..." "Downloading the video engine's browser (about 100 MB)..."
npx remotion browser ensure
info "Instaluję oficjalne umiejętności Remotion dla Claude (wiedza o wideo)..." "Installing the official Remotion skills for Claude (video know-how)..."
npx -y skills@1.7.4 add remotion-dev/skills -a claude-code -y --copy \
  -s remotion-best-practices remotion-markup remotion-captions remotion-multimedia remotion-render remotion-docs \
  || info "Nie udało się teraz zainstalować umiejętności Remotion (brak internetu?). Klipownia działa bez nich." "Could not install the Remotion skills now (no internet?). Klipownia works without them."

say "5/8  Narzędzia do analizy wideo (mowa na tekst, wykrywanie twarzy). Około 1,5 GB. Proszę czekać." "5/8  Video analysis tools (speech to text, face finder). About 1.5 GB. Please wait."
PY="$(brew --prefix python@3.12)/bin/python3.12"
[ -d .venv ] || "$PY" -m venv .venv
.venv/bin/pip install --upgrade pip >/dev/null
.venv/bin/pip install -r tools/requirements.txt -c tools/constraints.txt
[ -f assets/sfx/pop.wav ] || .venv/bin/python tools/gen_sfx.py
info "Pobieram model mowy (1,6 GB). To najwolniejsza część: od 5 do 15 minut." "Downloading the speech model (1.6 GB). This is the slowest part: 5 to 15 minutes."
.venv/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('large-v3-turbo', device='cpu', compute_type='int8', download_root='models')"
info "Pobieram modele do wykrywania twarzy i osoby..." "Downloading the face and person finder models..."
.venv/bin/python -c "import sys; sys.path.insert(0,'tools'); import _facedet, cutout, cover_frames; from _common import model_file; model_file(*_facedet.SHORT); model_file('selfie_multiclass_256x256.tflite', cutout.URL); model_file('selfie_segmenter.tflite', cutout.URL_BIN); model_file('face_landmarker.task', cover_frames.URL)" \
  || info "Nie udało się ich teraz pobrać. Klipownia pobierze je, gdy będą pierwszy raz potrzebne." "Could not download them now. Klipownia downloads them the first time it needs them."

say "6/8  Przeglądarka do edytora" "6/8  A browser for the editor"
HAVE_BROWSER=0
for b in "Google Chrome" "Microsoft Edge" "Brave Browser"; do
  if [ -d "/Applications/$b.app" ] || [ -d "$HOME/Applications/$b.app" ]; then HAVE_BROWSER=1; fi
done
if [ "$HAVE_BROWSER" = 0 ]; then
  info "Klipownia działa najlepiej w Google Chrome (Safari może nie pokazać wyciętego wideo)." "Klipownia works best in Google Chrome (Safari may not show the cut-out video)."
  ANS=""
  printf "Zainstalować teraz Google Chrome? / Install Google Chrome now? [T/n] (samo za 20 sekund / starts by itself in 20 seconds) "
  read -r -t 20 ANS || true
  echo
  case "$ANS" in
    n|N|no|NO|nie|NIE) info "Pominięte. Zainstaluj Google Chrome sama/sam, zanim użyjesz Klipowni." "Skipped. Install Google Chrome yourself before you use Klipownia." ;;
    *) brew install --cask google-chrome ;;
  esac
else
  info "Przeglądarka Chromium jest już zainstalowana." "A Chromium browser is already installed."
fi

say "7/8  Claude Code (używa Twojej subskrypcji Claude, bez klucza API)" "7/8  Claude Code (uses your own Claude subscription, no API key)"
if ! command -v claude >/dev/null 2>&1 && [ ! -x "$HOME/.local/bin/claude" ]; then
  curl -fsSL https://claude.ai/install.sh | bash
fi
# Make 'claude' work in new Terminal windows too (the installer does not do this itself)
if ! grep -qsF '.local/bin' "$HOME/.zshrc"; then
  printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$HOME/.zshrc"
fi
if [ -n "$ANTHROPIC_API_KEY" ]; then
  info "UWAGA: na tym Macu jest ustawiony ANTHROPIC_API_KEY. Claude Code płaciłby wtedy za API, a nie z subskrypcji." \
    "WARNING: ANTHROPIC_API_KEY is set on this Mac. Claude Code would bill the API, not your subscription."
  info "Usuń go z ~/.zshrc, jeśli nie ustawiłaś/eś go celowo." "Remove it from ~/.zshrc if you did not set it on purpose."
fi

say "8/8  Aplikacja Klipownia" "8/8  The Klipownia app"
# The old name's app would still open the old folder; one app in Applications only.
rm -rf "/Applications/Reel Studio.app"
APP="/Applications/Klipownia.app"
rm -rf "$APP"
cp -R "mac/Klipownia.app" "$APP"
echo "$TARGET" > "$APP/Contents/Resources/home.txt"
chmod +x "$APP/Contents/MacOS/Klipownia"
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true
xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null || true
codesign --force --deep -s - "$APP" >/dev/null 2>&1 || true
chmod +x "Start Klipownia.command" "Ask Claude.command" "Stop Klipownia.command" 2>/dev/null || true

# The "Klipownia" connector for her normal Claude Desktop chat (keeps any other connectors and
# removes the old "reel-studio" one).
NODE_BIN="$(brew --prefix node@24 2>/dev/null)/bin/node"
[ -x "$NODE_BIN" ] || NODE_BIN="$(command -v node)"
if "$NODE_BIN" mcp/register.mjs "$NODE_BIN" "$TARGET"; then
  info "Claude Desktop: łącznik Klipowni jest włączony. Zamknij i otwórz ponownie Claude Desktop, żeby go zobaczyć." \
    "Claude Desktop: the Klipownia connector is on. Quit and reopen Claude Desktop to see it."
else
  info "Nie udało się dodać łącznika do Claude Desktop (sama Klipownia działa)." "Could not add the connector to Claude Desktop (Klipownia itself works)."
fi

date > .install-ok
say "Gotowe" "Done"
info "Otwórz „Klipownia” z folderu Aplikacje (albo z Launchpada). Przeciągnij ją do Docka, żeby tam została." \
  "Open 'Klipownia' from Applications (or Launchpad). Drag it to the Dock to keep it there."
info "Jeśli w Docku jest jeszcze stara ikona „Reel Studio”, usuń ją (przeciągnij poza Dock)." \
  "If the Dock still has the old 'Reel Studio' icon, remove it (drag it out of the Dock)."
# One-time Claude login with her subscription (never the API option). Skipped when already logged in.
CLAUDE="$HOME/.local/bin/claude"
[ -x "$CLAUDE" ] || CLAUDE="$(command -v claude || true)"
if [ -n "$CLAUDE" ]; then
  if "$CLAUDE" auth status --json 2>/dev/null | grep -q '"loggedIn": *true'; then
    info "Claude jest już zalogowany." "Claude is already logged in."
  else
    say "Ostatni krok: zaloguj się do Claude" "Last step: log in to Claude"
    info "Otworzy się okno przeglądarki. Zaloguj się kontem Claude i kliknij Authorize." "A browser window opens. Log in with your Claude account and click Authorize."
    unset ANTHROPIC_API_KEY
    "$CLAUDE" auth login --claudeai || info "Logowanie się nie skończyło. Możesz to zrobić później: kliknij dwa razy „Ask Claude.command” w $TARGET." \
      "Login did not finish. You can do it later: double-click 'Ask Claude.command' in $TARGET."
  fi
fi
info "Żeby zatrzymać Klipownię: kliknij dwa razy „Stop Klipownia.command” w $TARGET." "To stop Klipownia: double-click 'Stop Klipownia.command' in $TARGET."
