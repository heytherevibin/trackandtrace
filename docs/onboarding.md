# Onboarding

## Day one

1. Node 24 or newer (Vercel and CI run 24), Docker Desktop (for the local Supabase stack).
2. `scripts/setup.sh` — installs, writes `.env.local` from the template, and (with Docker) starts Supabase, applies migrations + seed, prints the local keys.
3. `npm run dev:fixture` and open http://localhost:3000. Check `2345678901`.
4. `npm run check` must be green before any push. GitHub runs the same checks, plus the browser suite, on every pull request.

## Supabase

- **Hosted project:** "Trakline", ref `xnykpktqtimadelfjgqf`, ap-south-1. Put `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`; add `SUPABASE_SECRET_KEY` only where account deletion must work.
- **CLI, once per machine:** `npx supabase@2.117.0 login`, then `npm run db:link`.
- **Migrations:** `npm run db:migration <name>`, then `npm run db:push` (hosted) and `npm run db:types:linked`. Seed never runs remotely.
- **Auth config** lives in `supabase/config.toml`: the base is the local stack, and `[remotes.production]` overrides it for the hosted project. Always `npm run db:config:diff` before `npm run db:config`, because a push overwrites what the file declares.
- **Email:** Supabase sends through Resend SMTP from `signin@trakline.in`. SMTP is set in the dashboard, and `config.toml` declares none, so a push leaves it alone. The Trakline templates in `supabase/templates/` send a `token_hash` link to `/auth/callback`, which works in any browser. The email rate limit lives only in the dashboard, because config push doesn't manage it.
- **Email confirmation stays on.** The email provider also accepts password sign-ups through the API, and confirmation stops one from claiming someone else's address.
- **Google** stays off until an OAuth client exists: set the provider env vars, `enabled = true`, push, then `AUTH_GOOGLE_ENABLED=1`.
- **Passkeys** are on for the hosted project; `AUTH_PASSKEY_ENABLED=1` offers them (sign in with one, add and remove them on the account). The button appears only where the browser can do the WebAuthn ceremony, and passkeys need https or localhost. auth-js keeps them behind `auth.experimental.passkey`, set in `src/services/supabase/browser.ts`.
- **Local stack:** `npm run db:start`, then `npm run db:reset` (migrations and `supabase/seed.sql`). Captured emails: http://127.0.0.1:54324. `npm run db:types` after any migration.
- **Secrets:** only in `.env.local` or the host's env settings. `SUPABASE_SECRET_KEY` bypasses RLS: server only. `scripts/check-secrets.sh` greps a diff before committing.

## Deploy

- **Vercel**, from `main`. `vercel.json` pins Functions to `bom1` (Mumbai), the same AWS region as the Supabase project, and installs with `npm ci`.
- Production refuses `PNR_SOURCE=fixture`. Set environment variables in the Vercel project, never in the repo; mark keys Sensitive (they then read back as `[SENSITIVE]` from `vercel env pull`, so verify behaviour on the live site instead).
- PNR data: `PNR_SOURCE=railkit`, `RAILKIT_API_KEY`, and `PNR_FALLBACK=rapidapi` with `RAPIDAPI_KEY`. Watch the RailKit plan's renewal date: an expired plan quietly drops to 50 requests a month.

## Conventions

- TypeScript strict; no `any` — `unknown` + narrowing. Files ≤ 500 lines. Immutable data.
- TDD: the failing test lands with (before) the change. Unit tests mirror `src/` under `tests/unit`.
- Every UI string lives in `src/messages`; components never carry literals. Dates go through `src/utils/datetime.ts` (en-IN, Asia/Kolkata).
- Design tokens are the only colors: raw hex in components fails `tokens.contract.test.ts`.
- Conventional commits. Never commit `.env*` (except `.env.example`).

## The one rule

No source, no claim. If a change would show a value the source did not return, it is wrong — build the explicit unavailable state instead.
