# Onboarding

## Day one

1. Node ≥ 20, Docker Desktop (for the local Supabase stack).
2. `scripts/setup.sh` — installs, writes `.env.local` from the template, and (with Docker) starts Supabase, applies migrations + seed, prints the local keys.
3. `npm run dev:fixture` and open http://localhost:3000. Check `2345678901`.
4. `npm run check` must be green before any push.

## Supabase

- Local: `npm run db:start` → `npm run db:reset` (migrations + `supabase/seed.sql`). Captured sign-in emails: http://127.0.0.1:54324. Regenerate DB types after any migration: `npm run db:types`.
- Hosted (once, with the CLI logged in): `npx supabase@2.117.0 login`, `projects create trackandtrace --region ap-south-1`, `link`, `db push`, `config push`. Google OAuth credentials and production SMTP are configured in the dashboard. Seed never runs remotely.
- Secrets: only in `.env.local` / Vercel. `SUPABASE_SERVICE_ROLE_KEY` is server-only and used solely for account deletion. `scripts/check-secrets.sh` greps a diff before committing.

## Conventions

- TypeScript strict; no `any` — `unknown` + narrowing. Files ≤ 500 lines. Immutable data.
- TDD: the failing test lands with (before) the change. Unit tests mirror `src/` under `tests/unit`.
- Every UI string lives in `src/messages`; components never carry literals. Dates go through `src/utils/datetime.ts` (en-IN, Asia/Kolkata).
- Design tokens are the only colors: raw hex in components fails `tokens.contract.test.ts`.
- Conventional commits. Never commit `.env*` (except `.env.example`).

## The one rule

No source, no claim. If a change would show a value the source did not return, it is wrong — build the explicit unavailable state instead.
