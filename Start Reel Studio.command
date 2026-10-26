#!/bin/bash
# Double-click to start Reel Studio. Keep this window open while you edit; close it to stop.
cd "$(dirname "$0")" || exit 1
[ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"
[ -x /usr/local/bin/brew ] && eval "$(/usr/local/bin/brew shellenv)"
export PATH="/opt/homebrew/opt/node@24/bin:/usr/local/opt/node@24/bin:$HOME/.local/bin:$PATH"
URL="http://localhost:8787"
# Reel Studio answers /api/projects with a JSON list. Anything else on this port is not us.
is_ours() { curl -sf --max-time 3 "$URL/api/projects" 2>/dev/null | grep -q '^ *\['; }

if [ ! -f .install-ok ]; then
  echo "Reel Studio is not installed yet. Running the installer first..."
  bash install.sh || { echo "Install failed. Send Peter a photo of this window and the file ~/Library/Logs/ReelStudio-install.log"; read -r; exit 1; }
  # The installer works in ~/ReelStudio. Continue there, not in this folder.
  cd "$HOME/ReelStudio" || exit 1
fi
if is_ours; then
  echo "Reel Studio is already running."
  open "$URL"
  exit 0
fi
if lsof -ti tcp:8787 >/dev/null 2>&1; then
  echo "Something else is using port 8787, and it is not Reel Studio."
  echo "Double-click 'Stop Reel Studio.command', or restart the Mac. Then try again."
  read -r
  exit 1
fi
(sleep 3 && open "$URL") &
exec caffeinate -i npm start
