#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if ! command -v node >/dev/null 2>&1; then
  echo "RouteCore requires Node.js 22 or newer." >&2
  exit 1
fi

NODE_MAJOR=$(node -p "Number(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "RouteCore requires Node.js 22 or newer; found $(node --version)." >&2
  exit 1
fi

: "${ROUTECORE_HOME:=$ROOT/data}"
export ROUTECORE_HOME
mkdir -p "$ROUTECORE_HOME"

if [ -f "$ROOT/RouteCore-Demonstration.routecore" ]; then
  exec node "$ROOT/apps/studio/server/main.mjs" \
    --open \
    --project "$ROOT/RouteCore-Demonstration.routecore" \
    "$@"
else
  exec node "$ROOT/apps/studio/server/main.mjs" --open "$@"
fi
