# Onboarding

## Day one

1. Node 24 or newer (Vercel and CI run 24), Docker Desktop (for the local Supabase stack).
2. `scripts/setup.sh` — installs, writes `.env.local` from the template, and (with Docker) starts Supabase, applies migrations + seed, prints the local keys.
3. `npm run dev:fixture` and open http://localhost:3000. Check `2345678901`.
4. `npm run check` must be green before any push. GitHub runs the same checks, plus the browser suite, on every pull request.

## Console, locally

`npm run dev:fixture` also serves the team console at http://admin.localhost:3000 (Chrome and Firefox resolve `*.localhost` to this machine). The console refuses to run against the hosted Supabase project, and says so. To see its pages, point both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` at the local stack (`npm run db:start`) — the env schema requires them together, and the hosted key won't authenticate against a local stack — or start with both Supabase variables blank: `NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= npm run dev:fixture`.

The console's tables live in the private `console` schema. `npm run db:reset` applies its migrations to the local stack, and `npm run db:test` runs the pgTAP tests (CI runs the same). Nothing reads those tables directly: every caller goes through a `public.console_*` function.

## Supabase

- **Hosted project:** "Trakline", ref `xnykpktqtimadelfjgqf`, ap-south-1. Put `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`; add `SUPABASE_SECRET_KEY` only where account deletion must work.
- **CLI, once per machine:** `npx supabase@2.117.0 login`, then `npm run db:link`.
- **Migrations:** `npm run db:migration <name>`, then `npm run db:push` (hosted) and `npm run db:types:linked`. Seed never runs remotely.
- **Auth config** lives in `supabase/config.toml`: the base is the local stack, and `[remotes.production]` overrides it for the hosted project. Always `npm run db:config:diff` before `npm run db:config`, because a push overwrites what the file declares.
- **Email:** Supabase sends through Resend SMTP from `signin@trakline.in`. SMTP is set in the dashboard, and `config.toml` declares none, so a push leaves it alone. The Trakline templates in `supabase/templates/` send a `token_hash` link to `/auth/callback`, which works in any browser. The email rate limit lives only in the dashboard, because config push doesn't manage it.
- **Email confirmation stays on.** The email provider also accepts password sign-ups through the API, and confirmation stops one from claiming someone else's address.
- **Google** stays off until an OAuth client exists: set the provider env vars, `enabled = true`, push, then `AUTH_GOOGLE_ENABLED=1`.
- **Passkeys** are bound to **trakline.in** (Dashboard > Authentication > Passkeys: RP ID `trakline.in`, origin `https://trakline.in`, display name Trakline). `supabase config push` can't set these, so `config.toml` only records them. Changing the RP ID invalidates every existing passkey. `AUTH_PASSKEY_ENABLED` is `1` on Production and `0` on Preview, because vercel.app previews can't use a trakline.in passkey. For local passkey testing, use the local Supabase stack with RP ID `localhost`. The button appears only where the browser can do the WebAuthn ceremony. auth-js keeps passkeys behind `auth.experimental.passkey`, set in `src/services/supabase/browser.ts`.
- **Local stack:** `npm run db:start`, then `npm run db:reset` (migrations and `supabase/seed.sql`). Captured emails: http://127.0.0.1:54324. `npm run db:types` after any migration.
- **Secrets:** only in `.env.local` or the host's env settings. `SUPABASE_SECRET_KEY` bypasses RLS: server only. `scripts/check-secrets.sh` greps a diff before committing.

## Deploy

- **Vercel**, from `main`. `vercel.json` pins Functions to `bom1` (Mumbai), the same AWS region as the Supabase project, and installs with `npm ci`.
- Production refuses `PNR_SOURCE=fixture`. Set environment variables in the Vercel project, never in the repo; mark keys Sensitive (they then read back as `[SENSITIVE]` from `vercel env pull`, so verify behaviour on the live site instead).
- PNR data: `PNR_SOURCE=railkit`, `RAILKIT_API_KEY`, and `PNR_FALLBACK=rapidapi` with `RAPIDAPI_KEY`. Watch the RailKit plan's renewal date: an expired plan quietly drops to 50 requests a month.
- **Shared store** (required on Production and Preview, which refuse to boot without it). Upstash Redis (Mumbai, Free) connected to the project provides `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. The `KV_REST_API_*` names from Vercel's integration also work. Add one `DATA_KEY` per environment, which no one ever needs to see: `openssl rand -base64 32 | tr -d '\n' | vercel env add DATA_KEY <production|preview> --sensitive --yes --scope trakline`. Rotating it empties the cache and resets limit windows. Local and CI runs keep limits and the cache in memory.
- **Error tracking:** the Vercel Sentry integration (project `sentry-trakline`, connected to Production and Preview) supplies `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN`. There is no log drain, and none should be added: raw logs would bypass the scrubber. Without the DSN (local runs, CI), Sentry is off.

## Conventions

- TypeScript strict; no `any` — `unknown` + narrowing. Files ≤ 500 lines. Immutable data.
- TDD: the failing test lands with (before) the change. Unit tests mirror `src/` under `tests/unit`.
- Every UI string lives in `src/messages`; components never carry literals. Dates go through `src/utils/datetime.ts` (en-IN, Asia/Kolkata).
- Design tokens are the only colors: raw hex in components fails `tokens.contract.test.ts`.
- Conventional commits. Never commit `.env*` (except `.env.example`).

## The one rule

No source, no claim. If a change would show a value the source did not return, it is wrong — build the explicit unavailable state instead.
