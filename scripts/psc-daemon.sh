#!/usr/bin/env bash
# Daemon manager for production (single-port: Fastify serves API + built frontend).
# Works both in the repo (scripts/psc-daemon.sh) and in a deployed bundle (./psc-daemon.sh).
#
#   ./scripts/psc-daemon.sh start|stop|restart|status|logs [--no-build]
#
# Env overrides: HOST (default 127.0.0.1), PORT (default 8787),
#   DATA_DIR (default <app>/data), LOG_LEVEL, OLLAMA_*/OPENAI_* via .env file.
set -euo pipefail

resolve_app_dir() {
  local here
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -f "$here/package.json" ]]; then echo "$here"; else echo "$(cd "$here/.." && pwd)"; fi
}
APP_DIR="$(resolve_app_dir)"
PIDFILE="$APP_DIR/.psc-coach.pid"
LOGFILE="$APP_DIR/psc-coach.log"

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8787}"
DATA_DIR="${DATA_DIR:-$APP_DIR/data}"
LOG_LEVEL="${LOG_LEVEL:-info}"

# Load .env next to the app dir if present.
if [[ -f "$APP_DIR/.env" ]]; then set -a; source "$APP_DIR/.env"; set +a; fi

is_running() { [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; }

do_start() {
  local no_build="${1:-}"
  if is_running; then echo "Already running (PID $(cat "$PIDFILE"))."; return 0; fi
  mkdir -p "$DATA_DIR"
  if [[ ! -d "$APP_DIR/node_modules" ]]; then
    echo "node_modules missing — running npm ci…"
    (cd "$APP_DIR" && npm ci)
  fi
  if [[ "$no_build" != "--no-build" && ! -f "$APP_DIR/apps/web/dist/index.html" ]]; then
    echo "Building frontend…"
    (cd "$APP_DIR" && npm run build -w @psc/web)
  fi
  if [[ ! -f "$APP_DIR/apps/web/dist/index.html" ]]; then
    echo "WARNING: apps/web/dist/index.html missing — API-only mode. Run: npm run build -w @psc/web" >&2
  fi
  echo "Starting psc-coach on $HOST:$PORT (log: $LOGFILE)…"
  (cd "$APP_DIR" && HOST="$HOST" PORT="$PORT" DATA_DIR="$DATA_DIR" LOG_LEVEL="$LOG_LEVEL" \
    nohup npm start > "$LOGFILE" 2>&1 & echo $! > "$PIDFILE")
  for _ in $(seq 1 25); do
    code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/health" 2>/dev/null || echo 000)
    [[ "$code" == "200" ]] && break
    sleep 1
  done
  if is_running; then
    echo "Running (PID $(cat "$PIDFILE")). Health:"
    curl -s "http://127.0.0.1:${PORT}/api/health" || true; echo
    echo "Open: http://$HOST:$PORT/"
    if [[ "$HOST" == "0.0.0.0" ]]; then
      LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
      [[ -n "$LAN_IP" ]] && echo "LAN:  http://$LAN_IP:$PORT/  (same Wi-Fi network)"
    fi
  else
    echo "Failed to start. Last log lines:"; tail -n 30 "$LOGFILE" || true; exit 1
  fi
}

do_stop() {
  if ! is_running; then echo "Not running."; rm -f "$PIDFILE"; return 0; fi
  local pid; pid="$(cat "$PIDFILE")"
  echo "Stopping PID $pid…"
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 15); do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
  kill -9 "$pid" 2>/dev/null || true
  rm -f "$PIDFILE"
  echo "Stopped."
}

case "${1:-}" in
  start)   do_start "${2:-}" ;;
  stop)    do_stop ;;
  restart) do_stop; sleep 1; do_start "${2:-}" ;;
  status)
    if is_running; then
      echo "Running (PID $(cat "$PIDFILE"))."
      curl -s "http://127.0.0.1:${PORT}/api/health" || true; echo
    else echo "Not running."; fi ;;
  logs) tail -"${2:-100}" -f "$LOGFILE" 2>/dev/null || echo "No log yet at $LOGFILE" ;;
  *) echo "Usage: $0 {start|stop|restart|status|logs} [--no-build]"; exit 2 ;;
esac
