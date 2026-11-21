#!/bin/bash
# Double-click to open your local copy of Biomechanics in the browser.
# Browsers won't load the app straight from Finder (file://), so this starts a small local server.
cd "$(dirname "$0")/app" || exit 1
PORT=8000
if ! lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  python3 -m http.server $PORT >/dev/null 2>&1 &
  SERVER=$!
  sleep 1
fi
open "http://localhost:$PORT/"
echo ""
echo "Biomechanics is open in your browser at http://localhost:$PORT/"
if [ -n "$SERVER" ]; then
  echo "Keep this window open while you use it. Close it (or press Ctrl+C) to stop the local copy."
  wait $SERVER
else
  echo "(The local server was already running.) You can close this window."
fi
