#!/bin/bash
# Double-click to talk to Claude about your reels. Write in Polish or English.
cd "$(dirname "$0")" || exit 1
export PATH="$HOME/.local/bin:/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v claude >/dev/null 2>&1; then
  echo "Claude Code nie jest jeszcze zainstalowany. Uruchom instalację Klipowni jeszcze raz. / Claude Code is not installed yet. Run the Klipownia installer again."
  read -r
  exit 1
fi
unset ANTHROPIC_API_KEY  # always use your Claude subscription, never paid API billing
claude
