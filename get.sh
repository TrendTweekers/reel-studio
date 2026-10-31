#!/bin/bash
# Klipownia one-line installer and updater for macOS:
#   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/TrendTweekers/reel-studio/main/get.sh)"
# For now the line loads this file from raw GitHub. It moves to the klipownia.pl domain later.
# It asks for the licence key from the purchase email, downloads the newest version through the
# Klipownia licence API into ~/Klipownia, then runs install.sh. Safe to run again to update: her
# reels, pictures, music, styles, voice, models and preferences are kept.
# Options:
#   -k, --key KEY        licence key (else env KLIPOWNIA_KEY, else the saved one, else it asks)
#   --api URL            licence API (else env KLIPOWNIA_API, else https://api.klipownia.pl)
#   --root DIR           install folder (default ~/Klipownia)
#   --source GIT|PATH    use git instead of the API (for Peter and Paulina, not for buyers)
#   --download-only      download and unpack, do not run install.sh (tests)
set -e

ROOT="$HOME/Klipownia"
ROOT_SET=0
KEY="${KLIPOWNIA_KEY:-}"
API="${KLIPOWNIA_API:-https://api.klipownia.pl}"
SOURCE=""
DOWNLOAD_ONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    -k|--key) KEY="$2"; shift 2 ;;
    --api) API="$2"; shift 2 ;;
    --root) ROOT="$2"; ROOT_SET=1; shift 2 ;;
    --source) SOURCE="$2"; shift 2 ;;
    --download-only) DOWNLOAD_ONLY=1; shift ;;
    *) echo "Nieznana opcja / Unknown option: $1"; exit 2 ;;
  esac
done
API="${API%/}"

say() { printf "\n\033[1m%s\033[0m\n%s\n" "$1" "$2"; }
fail() { printf "\n\033[1;33m%s\033[0m\n\033[33m%s\033[0m\n" "$1" "$2"; exit 1; }
# Her files that also come with the app. Ours must never replace hers.
KEEP_FILES="settings.json brand.md vocabulary.txt keywords.md instagram/voice.md"

# ---------- Old name: Reel Studio lived in ~/ReelStudio. Move it once.
OLD_ROOT="$HOME/ReelStudio"
if [ "$ROOT_SET" = 0 ] && [ -d "$OLD_ROOT" ] && [ ! -e "$ROOT" ]; then
  say "Przenoszę Reel Studio do nowego folderu: $ROOT" "Moving Reel Studio to the new folder: $ROOT"
  # The running server would keep writing to the old path.
  lsof -ti tcp:8787 2>/dev/null | xargs kill 2>/dev/null || true
  sleep 1
  mv "$OLD_ROOT" "$ROOT" || fail "Nie udało się przenieść folderu $OLD_ROOT. Zamknij Reel Studio i wklej polecenie jeszcze raz." \
    "Could not move the folder $OLD_ROOT. Quit Reel Studio, then paste the command again."
  echo "Gotowe. Twoje rolki, muzyka i style są teraz w $ROOT"
  echo "Done. Your reels, music and styles are now in $ROOT"
fi

KEY_SAVED=1
if [ -n "$SOURCE" ]; then
  # ---------- Git path: clone or update from a git URL or a repo path.
  say "Klipownia: pobieram najnowszą wersję (git)" "Klipownia: getting the newest version (git)"
  git --version >/dev/null 2>&1 || fail "Brakuje programu git." "git is missing."
  if [ ! -d "$ROOT/.git" ]; then
    if [ -d "$ROOT" ] && [ -n "$(ls -A "$ROOT" 2>/dev/null)" ]; then git init -q "$ROOT"; else git clone -q "$SOURCE" "$ROOT"; fi
  fi
  # Her data is ignored by git, so a reset never touches it. A few of her files are tracked: keep hers.
  KEEP_TMP="$(mktemp -d)"
  for k in $KEEP_FILES; do
    if [ -f "$ROOT/$k" ]; then mkdir -p "$KEEP_TMP/$(dirname "$k")"; cp -p "$ROOT/$k" "$KEEP_TMP/$k"; fi
  done
  git -C "$ROOT" fetch -q "$SOURCE" HEAD
  git -C "$ROOT" reset -q --hard FETCH_HEAD
  for k in $KEEP_FILES; do if [ -f "$KEEP_TMP/$k" ]; then cp -p "$KEEP_TMP/$k" "$ROOT/$k"; fi; done
  rm -rf "$KEEP_TMP"
  # The app reads .version before git; a zip install's old one would hide the git version.
  rm -f "$ROOT/.version"
  echo "Wersja / Version: $(git -C "$ROOT" rev-parse --short HEAD)"
else
  # ---------- Licence path (buyers): the key decides what may be downloaded.
  # Flat JSON from our API, read with sed: a fresh Mac has no jq, and its python3 is only a stub
  # that opens an "install developer tools" dialog.
  json_str() { printf '%s' "$1" | tr -d '\r\n' | sed -E -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\"([^\"]*)\".*/\1/p"; }

  SETTINGS="$ROOT/settings.json"
  if [ -z "$KEY" ] && [ -f "$SETTINGS" ]; then
    FLAT="$(tr -d '\r\n' < "$SETTINGS")"
    # {"licence": {"key": "..."}} now, a plain "licence": "..." string before the shop existed.
    KEY="$(printf '%s' "$FLAT" | sed -E -n 's/.*"licence"[[:space:]]*:[[:space:]]*\{[^}]*"key"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/p')"
    [ -n "$KEY" ] || KEY="$(printf '%s' "$FLAT" | sed -E -n 's/.*"licence"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/p')"
  fi

  api_error() { # $1 = HTTP code, $2 = body
    case "$1" in
      404|400) fail "Nie znamy tego klucza. Sprawdź, czy skopiowałaś/eś go w całości z maila po zakupie." \
        "Key not recognised. Check you copied all of it from the purchase email." ;;
      403)
        case "$2" in
          *limit*) fail "Ten klucz działa już na 3 komputerach. Zwolnij jeden w swoim koncie Polar (link jest w mailu z zakupem) i wklej polecenie jeszcze raz." \
            "This key is already used on 3 computers. Free one in your Polar account (the link is in the purchase email), then paste the command again." ;;
          *expired*) fail "Link do pobrania wygasł. Wklej polecenie jeszcze raz." "The download link expired. Paste the command again." ;;
          *) fail "Ten klucz nie jest już aktywny. Odpowiedz na mail z zakupem, pomożemy." \
            "This key is no longer active. Reply to the purchase email and we will help." ;;
        esac ;;
      503) fail "Sklep chwilowo nie odpowiada. Spróbuj jeszcze raz za godzinę. Twój klucz jest w porządku." \
        "The shop is not answering right now. Try again in an hour. Your key is fine." ;;
      000) fail "Brak połączenia z serwerem Klipowni. Sprawdź internet i spróbuj jeszcze raz." \
        "Cannot reach the Klipownia server. Check the internet connection and try again." ;;
      *) fail "Serwer Klipowni odpowiedział błędem $1. Spróbuj jeszcze raz za chwilę." \
        "The Klipownia server answered with error $1. Try again in a moment." ;;
    esac
  }

  WORK="$(mktemp -d)"
  trap 'rm -rf "$WORK"' EXIT
  ASKED=0
  REL=""
  for _ in 1 2 3; do
    if [ -z "$KEY" ]; then
      # Read from the terminal, also when this script itself comes through a pipe.
      ( : </dev/tty ) 2>/dev/null || fail "Brak klucza licencji. Podaj go tak: --key KLUCZ" "No licence key. Pass it like this: --key KEY"
      printf "\n\033[1mWklej klucz licencji z maila po zakupie: \033[0m(Paste the licence key from the purchase email) "
      read -r KEY </dev/tty || true
      ASKED=1
    fi
    KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"
    [ -n "$KEY" ] || continue
    say "Klipownia: sprawdzam klucz i pobieram najnowszą wersję" "Klipownia: checking the key and getting the newest version"
    # Keys are letters, digits and dashes; anything else cannot be a key and needs no URL encoding.
    if printf '%s' "$KEY" | grep -Eq '^[A-Za-z0-9_-]+$'; then
      CODE="$(curl -s --max-time 30 -o "$WORK/release.json" -w '%{http_code}' "$API/v1/release?key=$KEY&platform=mac" || true)"
      BODY="$(cat "$WORK/release.json" 2>/dev/null || true)"
    else
      CODE=404; BODY=""
    fi
    URL="$(json_str "$BODY" url)"
    if [ "$CODE" = 200 ] && [ -n "$URL" ]; then REL=1; break; fi
    # Only a key she just typed is worth asking again. A 403 or 503 does not change by retyping.
    if [ "$ASKED" = 0 ] || { [ "$CODE" != 404 ] && [ "$CODE" != 400 ]; }; then api_error "$CODE" "$BODY"; fi
    printf "\n\033[33m%s\n%s\033[0m\n" "Nie znamy tego klucza. Sprawdź, czy skopiowałaś/eś go w całości z maila po zakupie." \
      "Key not recognised. Check you copied all of it from the purchase email."
    KEY=""
  done
  [ -n "$REL" ] || api_error 404 ""
  VERSION="$(json_str "$BODY" version)"
  echo "Wersja / Version: $VERSION"

  # Download (the link lives 15 minutes), unpack, find the one top folder (reel-studio-<sha>/).
  echo "Pobieram Klipownię... / Downloading Klipownia..."
  CODE="$(curl -sL --max-time 900 -o "$WORK/klipownia.zip" -w '%{http_code}' "$API$URL" || true)"
  [ "$CODE" = 200 ] || api_error "$CODE" "$(head -c 300 "$WORK/klipownia.zip" 2>/dev/null || true)"
  mkdir -p "$WORK/x"
  # macOS always has unzip; the python fallback is for Linux test machines without it.
  if command -v unzip >/dev/null 2>&1; then unzip -q "$WORK/klipownia.zip" -d "$WORK/x"
  else python3 -I -m zipfile -e "$WORK/klipownia.zip" "$WORK/x"; fi
  TOPS=("$WORK"/x/*/)
  if [ "${#TOPS[@]}" != 1 ] || [ ! -d "${TOPS[0]}" ]; then
    fail "Pobrany plik jest niepełny. Wklej polecenie jeszcze raz." "The download is incomplete. Paste the command again."
  fi
  SRC="${TOPS[0]%/}"

  # Copy over ROOT. Her folders stay as they are (the zip has only empty placeholders there), and her
  # files are skipped when she already has them.
  mkdir -p "$ROOT"
  EXCL=()
  for d in projects board styles voice models logs .venv .venv-tts node_modules assets/music instagram/drafts; do EXCL+=(--exclude "/$d"); done
  for k in $KEEP_FILES; do if [ -f "$ROOT/$k" ]; then EXCL+=(--exclude "/$k"); fi; done
  rsync -a "${EXCL[@]}" "$SRC/" "$ROOT/"
  mkdir -p "$ROOT/projects" "$ROOT/board" "$ROOT/assets/music" "$ROOT/styles" "$ROOT/instagram/drafts"
  printf '%s\n' "$VERSION" > "$ROOT/.version"

  # Save the key where Klipownia reads it, so updates work without asking again. The app activates it
  # on first start (this computer gets its slot then). Needs node or a real python3; before Homebrew a
  # Mac may have neither, so it is tried again after install.sh.
  save_key() {
    if command -v node >/dev/null 2>&1; then
      node -e 'const fs=require("fs");const [f,k]=process.argv.slice(1);let c={};
if(fs.existsSync(f)){try{c=JSON.parse(fs.readFileSync(f,"utf8")||"{}")}catch{process.exit(3)}}
const h=typeof c.licence==="string"?c.licence:c.licence&&c.licence.key;
if(h!==k){c.licence={key:k,status:"none"};fs.writeFileSync(f+".tmp",JSON.stringify(c,null,2)+"\n");fs.renameSync(f+".tmp",f)}' "$SETTINGS" "$KEY"
      return
    fi
    # On a Mac /usr/bin/python3 is real only with the developer tools.
    if command -v python3 >/dev/null 2>&1 && { [ "$(uname -s)" != Darwin ] || xcode-select -p >/dev/null 2>&1; }; then
      python3 -I -c 'import json,os,sys
f,k=sys.argv[1],sys.argv[2]
c={}
if os.path.exists(f):
    try: c=json.loads(open(f,encoding="utf-8").read() or "{}")
    except Exception: sys.exit(3)
l=c.get("licence"); h=l if isinstance(l,str) else (l or {}).get("key")
if h!=k:
    c["licence"]={"key":k,"status":"none"}
    open(f+".tmp","w",encoding="utf-8").write(json.dumps(c,indent=2,ensure_ascii=False)+"\n"); os.replace(f+".tmp",f)' "$SETTINGS" "$KEY"
      return
    fi
    return 4
  }
  # Exit 3 = a settings.json we cannot read; left alone, she may have hand-written settings in it.
  KEY_SAVED=0
  if save_key; then KEY_SAVED=1; fi
fi

if [ "$DOWNLOAD_ONLY" = 1 ]; then
  echo "Pobrane do / Downloaded to: $ROOT"
  exit 0
fi
[ -f "$ROOT/install.sh" ] || fail "Brakuje pliku $ROOT/install.sh." "$ROOT/install.sh is missing."
set +e
KLIPOWNIA_HOME="$ROOT" bash "$ROOT/install.sh"
RC=$?
set -e
if [ "$KEY_SAVED" = 0 ]; then
  # install.sh brought node (Homebrew node@24 is keg-only, so not on PATH by itself).
  NODE_DIR="$(/opt/homebrew/bin/brew --prefix node@24 2>/dev/null)/bin"
  [ -d "$NODE_DIR" ] && export PATH="$NODE_DIR:$PATH"
  save_key || echo "Nie udało się zapisać klucza. Wpisz go w Ustawieniach Klipowni. / Could not save the key. Enter it in Klipownia Settings."
fi
exit $RC
