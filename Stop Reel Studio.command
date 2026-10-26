#!/bin/bash
# Double-click to stop Reel Studio (the background server on port 8787).
PIDS="$(lsof -ti tcp:8787 2>/dev/null)"
if [ -n "$PIDS" ]; then
  # shellcheck disable=SC2086
  kill $PIDS 2>/dev/null
  echo "Reel Studio is stopped."
else
  echo "Reel Studio was not running."
fi
sleep 2
