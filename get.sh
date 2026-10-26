#!/bin/bash
# Reel Studio one-line installer and updater for macOS:
#   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/TrendTweekers/reel-studio/main/get.sh)"
# Downloads the newest version and runs install.sh. Safe to run again to update: her reels,
# pictures, music, styles and preferences are kept.
set -e
TMP="$(mktemp -d)"
echo "Downloading Reel Studio..."
curl -fsSL https://github.com/TrendTweekers/reel-studio/archive/refs/heads/main.tar.gz | tar -xz -C "$TMP"
bash "$TMP/reel-studio-main/install.sh"
rm -rf "$TMP"
