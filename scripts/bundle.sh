#!/usr/bin/env bash
# Build the web frontend and pack a deploy tarball for scp/ssh.
# Usage: ./scripts/bundle.sh [--skip-build]
# Output: ./dist-deploy/psc-coach-<timestamp>.tar.gz
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/dist-deploy"
STAMP="$(date +%Y%m%d-%H%M%S)"
TARBALL="$OUT/psc-coach-${STAMP}.tar.gz"

if [[ "${1:-}" != "--skip-build" ]]; then
  echo "Building frontend…"
  (cd "$ROOT" && npm run build -w @psc/web)
fi
[[ -f "$ROOT/apps/web/dist/index.html" ]] || { echo "Build missing: apps/web/dist/index.html" >&2; exit 1; }

mkdir -p "$OUT"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/psc-coach"
cd "$ROOT"

# Copy everything the server needs; skip junk.
# NOTE: no bare `--exclude='dist'` here — it would also strip apps/web/dist.
tar --exclude='node_modules' --exclude='.git' --exclude='Session' \
    -cf - package.json package-lock.json tsconfig.base.json .env.example \
    packages apps/server apps/web/dist scripts/psc-daemon.sh deploy \
  | tar -xf - -C "$STAGE/psc-coach"

# Ship a daemon launcher at the bundle root for convenience.
cp scripts/psc-daemon.sh "$STAGE/psc-coach/psc-daemon.sh"
mkdir -p "$STAGE/psc-coach/data"
touch "$STAGE/psc-coach/data/.gitkeep"

tar -czf "$TARBALL" -C "$STAGE" psc-coach
echo "Bundle: $TARBALL"
ls -lh "$TARBALL"
echo
echo "Deploy it with:"
echo "  ./scripts/deploy.sh user@your-server:/opt/psc-coach $TARBALL"
