#!/usr/bin/env bash
# Copy a bundle to a remote host over ssh and (re)start it there.
# Usage: ./scripts/deploy.sh user@host:/opt/psc-coach [tarball] [--no-restart]
#
# Example:
#   ./scripts/bundle.sh
#   ./scripts/deploy.sh root@192.168.0.10:/opt/psc-coach dist-deploy/psc-coach-20260101-120000.tar.gz
set -euo pipefail

DEST="${1:-}"
TARBALL="${2:-}"
NO_RESTART=0
[[ "${3:-}" == "--no-restart" || "${2:-}" == "--no-restart" ]] && NO_RESTART=1

if [[ -z "$DEST" ]]; then echo "Usage: $0 user@host:/opt/psc-coach [tarball] [--no-restart]" >&2; exit 2; fi
HOST_PART="${DEST%%:*}"
DIR_PART="${DEST#*:}"
[[ "$DIR_PART" == "$DEST" ]] && DIR_PART="/opt/psc-coach"

if [[ -z "$TARBALL" || "$TARBALL" == "--no-restart" ]]; then
  TARBALL="$(ls -t dist-deploy/psc-coach-*.tar.gz 2>/dev/null | head -n1 || true)"
fi
[[ -n "$TARBALL" && -f "$TARBALL" ]] || { echo "No bundle found. Run ./scripts/bundle.sh first." >&2; exit 1; }

echo "Uploading $TARBALL -> $HOST_PART:/tmp/…"
scp "$TARBALL" "$HOST_PART:/tmp/psc-coach-bundle.tar.gz"

echo "Extracting + installing on $HOST_PART…"
ssh "$HOST_PART" bash -s -- "$DIR_PART" "$NO_RESTART" <<'REMOTE'
set -euo pipefail
DIR="$1"; NO_RESTART="$2"
mkdir -p "$DIR"
# Preserve live data + env across deploys.
if [[ -d "$DIR/data" ]]; then cp -a "$DIR/data" /tmp/psc-data-backup; fi
[[ -f "$DIR/.env" ]] && cp -a "$DIR/.env" /tmp/psc-env-backup || true
tar -xzf /tmp/psc-coach-bundle.tar.gz -C /tmp
rm -rf "$DIR.new" && mv /tmp/psc-coach "$DIR.new"
[[ -d /tmp/psc-data-backup ]] && rm -rf "$DIR.new/data" && mv /tmp/psc-data-backup "$DIR.new/data" || true
[[ -f /tmp/psc-env-backup ]] && cp -a /tmp/psc-env-backup "$DIR.new/.env" || true
# Atomic swap, keep previous as .prev for rollback.
[[ -d "$DIR" ]] && rm -rf "$DIR.prev" && mv "$DIR" "$DIR.prev" || true
mv "$DIR.new" "$DIR"
rm -f /tmp/psc-coach-bundle.tar.gz
cd "$DIR"
echo "Installing deps (npm ci)…"
npm ci --no-audit --no-fund
if [[ "$NO_RESTART" != "1" ]]; then
  echo "Restarting daemon…"
  ./psc-daemon.sh restart
else
  echo "Skipped restart (--no-restart)."
fi
REMOTE

echo "Deployed to $DEST"
echo "Check: ssh $HOST_PART 'curl -s http://127.0.0.1:8787/api/health'"
