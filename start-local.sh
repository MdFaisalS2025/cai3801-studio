#!/usr/bin/env bash
# Runs the real classroom version of the Studio on this computer (Mac or Linux).
#
#   ./start-local.sh           only this computer (http://localhost:8080)
#   ./start-local.sh --share   also gives a temporary public https link for teammates
#                              (needs cloudflared: brew install cloudflared)
#
# Data is kept in platform/backend/data/classroom.db, so accounts survive a restart.
# The first time, the setup code is printed below. Open /setup with it to create the faculty account.
set -euo pipefail
root="$(cd "$(dirname "$0")" && pwd)"
backend="$root/platform/backend"
port="${PORT:-8080}"

echo "Building the site..."
node "$root/build-site.js" > /dev/null

if [ ! -d "$backend/node_modules" ]; then
  echo "Installing server packages (first run only)..."
  (cd "$backend" && npm install --no-audit --no-fund)
fi

export PORT="$port" HOST=127.0.0.1 CLASS_STORE=sqlite LLM_PROVIDER=none
export CLASS_DB="$backend/data/classroom.db" SITE_DIR="$root/site"

tunnel_pid=""
if [ "${1:-}" = "--share" ]; then
  if ! command -v cloudflared > /dev/null; then
    echo "cloudflared is not installed. Install it with:  brew install cloudflared"
    exit 1
  fi
  echo "Starting a temporary public link. Look for the https://...trycloudflare.com address below."
  echo "It works only while this window stays open and this computer is awake."
  cloudflared tunnel --url "http://localhost:$port" &
  tunnel_pid=$!
fi
trap '[ -n "$tunnel_pid" ] && kill "$tunnel_pid" 2>/dev/null || true' EXIT

echo "Studio: http://localhost:$port   (press Ctrl+C to stop)"
cd "$backend"
node classroom/server.js
