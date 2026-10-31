#!/bin/bash
# Double-click to stop Klipownia (the background server on port 8787).
PIDS="$(lsof -ti tcp:8787 2>/dev/null)"
if [ -n "$PIDS" ]; then
  # shellcheck disable=SC2086
  kill $PIDS 2>/dev/null
  echo "Klipownia jest zatrzymana. / Klipownia is stopped."
else
  echo "Klipownia nie była uruchomiona. / Klipownia was not running."
fi
sleep 2
