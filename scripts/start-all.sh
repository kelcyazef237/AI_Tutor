#!/usr/bin/env bash
# Start both frontend + backend (dev mode: Fastify :8787 + Vite :5173).
# Usage: ./scripts/start-all.sh [--no-install]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="/tmp/ai-tutor-dev.log"

if [[ "${1:-}" != "--no-install" && ! -d "$ROOT/node_modules" ]]; then
  echo "Installing dependencies…"
  (cd "$ROOT" && npm install)
fi

# Free the dev ports if something stale is holding them.
for p in 8787 5173; do
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${p}/tcp" 2>/dev/null || true
  fi
done
pkill -f "tsx watch.*apps/server|@psc/server|vite.*5173" 2>/dev/null || true
sleep 1

echo "Starting dev servers (log: $LOG)…"
cd "$ROOT"
nohup npm run dev > "$LOG" 2>&1 &
echo "PID: $!"

# Wait for both to answer.
ok=1
for i in $(seq 1 30); do
  s_ok=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8787/api/health 2>/dev/null || echo 000)
  w_ok=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5173/ 2>/dev/null || echo 000)
  if [[ "$s_ok" == "200" && "$w_ok" == "200" ]]; then
    echo "Backend : http://127.0.0.1:8787/api/health  (200)"
    echo "Frontend: http://127.0.0.1:5173/  (200)"
    LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
    if [[ -n "$LAN_IP" ]]; then
      echo
      echo "On your WLAN / phone: http://$LAN_IP:5173/"
      echo "  (same Wi-Fi network; if it does not load, allow ports 5173 and 8787 through the firewall)"
    fi
    echo "Done. Logs: tail -f $LOG"
    exit 0
  fi
  sleep 1
done
echo "Timed out waiting for dev servers. Last lines:"
tail -n 30 "$LOG" || true
exit 1
