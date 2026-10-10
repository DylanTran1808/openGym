#!/bin/sh
# gettingprime: run openGym on this Mac behind Tailscale Funnel (docs/MAC_HOSTING.md).
#
#   ./gp.sh start    back up ./data, build + start the stack, make sure Funnel is on
#   ./gp.sh stop     stop the stack (data stays in ./data)
#   ./gp.sh lock     invite-only from now on (run once, right after creating your own profile)
#   ./gp.sh status   containers + Funnel
#   ./gp.sh logs     follow the API log
#
# Data is written to ./data the moment it changes, so stopping never loses anything; every start
# copies it to ~/Library/Application Support/GettingPrime/backups/<date> first and keeps the last 14.
set -eu
cd "$(dirname "$0")"
export PATH="$PATH:$HOME/.orbstack/bin:/Applications/Tailscale.app/Contents/MacOS"

BACKUPS="$HOME/Library/Application Support/GettingPrime/backups"
KEEP=14
[ -f .env ] || { echo "No .env — see docs/MAC_HOSTING.md"; exit 1; }
PORT=$(sed -n 's/^WEB_PORT=//p' .env)
PORT=${PORT:-8080}

backup() {
  [ -d data ] && [ -n "$(ls -A data 2>/dev/null)" ] || return 0
  mkdir -p "$BACKUPS" && chmod 700 "$BACKUPS"
  dest="$BACKUPS/$(date +%Y-%m-%d_%H%M%S)"
  cp -Rp data "$dest"
  echo "Backed up data → $dest"
  # Oldest first past the newest $KEEP. Names are timestamps, so a plain sort is chronological.
  ls -1 "$BACKUPS" | sort -r | tail -n +$((KEEP + 1)) | while read -r old; do rm -rf "${BACKUPS:?}/$old"; done
}

funnel() {
  # Persists across reboots once on. The first time, Tailscale prints a link to enable Funnel.
  tailscale funnel --bg "$PORT" || echo "Funnel not on yet — follow the link above, then run ./gp.sh start again."
}

case "${1:-}" in
  start)
    backup
    # --build: the images are ours (this fork), never upstream's prebuilt ones; unchanged layers are cached.
    docker compose up -d --build
    funnel
    echo "Up: https://$(sed -n 's/^RP_ID=//p' .env)"
    ;;
  stop)
    docker compose down
    ;;
  lock)
    sed -i '' 's/^INVITE_ONLY=.*/INVITE_ONLY=1/' .env
    docker compose up -d api
    echo "Invite-only on: new profiles need a code from Settings → Admin."
    ;;
  status)
    docker compose ps
    tailscale funnel status
    ;;
  logs)
    docker compose logs -f api
    ;;
  *)
    sed -n '3,8p' "$0"
    exit 1
    ;;
esac
