#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

node -e 'const [maj]=process.versions.node.split(".").map(Number); if (maj<20) { console.error("Node >= 20 required"); process.exit(1); }'
[ -f .env.local ] || { cp .env.example .env.local; echo "Created .env.local — fill in what you use."; }
npm ci

if [ "${WITH_SUPABASE:-1}" = "1" ] && command -v docker >/dev/null 2>&1; then
  npx supabase@2.117.0 start
  npx supabase@2.117.0 db reset
  echo "Local Supabase keys (merge into .env.local):"
  npx supabase@2.117.0 status -o env | sed -n 's/^API_URL=\(.*\)$/NEXT_PUBLIC_SUPABASE_URL=\1/p; s/^ANON_KEY=\(.*\)$/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=\1/p; s/^SERVICE_ROLE_KEY=\(.*\)$/SUPABASE_SECRET_KEY=\1/p'
  npm run db:types
fi

[ "${WITH_E2E:-0}" = "1" ] && npx playwright install chromium chromium-headless-shell
echo "Done. Next: npm run dev:fixture"
