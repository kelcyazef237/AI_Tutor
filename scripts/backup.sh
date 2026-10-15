#!/usr/bin/env bash
# Safe snapshot of ALL student data (every profile's SQLite DB) while the
# server keeps running. Uses sqlite3 .backup (WAL-safe), falls back to a raw
# copy that includes the -wal/-shm files.
#
# Usage: ./scripts/backup.sh [dest-dir]     (default: ./backups)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${DATA_DIR:-$ROOT/data}"
DEST="${1:-$ROOT/backups}/psc-backup-$(date +%Y%m%d-%H%M%S)"

[[ -d "$DATA_DIR" ]] || { echo "No data directory at $DATA_DIR" >&2; exit 1; }
mkdir -p "$DEST"

shopt -s nullglob
dbs=("$DATA_DIR"/*.db)
[[ ${#dbs[@]} -gt 0 ]] || { echo "No databases found in $DATA_DIR" >&2; exit 1; }

for db in "${dbs[@]}"; do
  name="$(basename "$db")"
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$db" ".backup '$DEST/$name'"
  else
    # Raw copy — include WAL sidecars so nothing committed is lost.
    cp "$db" "$DEST/$name"
    [[ -f "$db-wal" ]] && cp "$db-wal" "$DEST/$name-wal" || true
    [[ -f "$db-shm" ]] && cp "$db-shm" "$DEST/$name-shm" || true
  fi
  echo "  ✓ $name"
done

echo
echo "Backup written to: $DEST"
du -sh "$DEST" | awk '{print "Size: " $1}'
echo
echo "Copy it to your server with:"
echo "  scp -r \"$DEST\" user@your-server:/opt/psc-coach/data-restore"
