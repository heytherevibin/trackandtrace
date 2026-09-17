#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
MODE="${1:-local}"
case "$MODE" in
  local)  npx supabase@2.117.0 db reset ;;   # migrations + seed against the Docker stack
  remote) : "${SUPABASE_DB_PASSWORD:?export SUPABASE_DB_PASSWORD first}"
          npx supabase@2.117.0 db push --password "$SUPABASE_DB_PASSWORD" ;;  # migrations only; seed never runs remotely
  *) echo "usage: scripts/seed-db.sh [local|remote]"; exit 2 ;;
esac
