#!/usr/bin/env bash
# Stop dev servers started by start-all.sh.
set -uo pipefail
pkill -f "concurrently.*psc/server" 2>/dev/null && echo "stopped concurrently" || true
pkill -f "tsx watch.*src/index.ts" 2>/dev/null && echo "stopped server" || true
pkill -f "vite" 2>/dev/null && echo "stopped vite" || true
if command -v fuser >/dev/null 2>&1; then
  fuser -k 8787/tcp 2>/dev/null || true
  fuser -k 5173/tcp 2>/dev/null || true
fi
echo "Dev servers stopped."
