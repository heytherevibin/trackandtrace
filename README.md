# Trakline

Check an Indian Railways PNR and read exactly what the source returned — every field labelled with its provenance and retrieval time. Free, no account needed. Not affiliated with IRCTC or Indian Railways.

**Data policy (the product's spine):** strict real-only. If a verified railway source did not return a field, the interface says "not returned" — it never guesses, never invents confirmation odds, and fails closed when the source is silent. PNRs never appear in our web addresses or server logs (checks send them in a POST body; result links are `/pnr#<pnr>`), and passenger names are never read or stored.

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind CSS v4 · Supabase (Auth + Postgres) · Base UI · Sonner · Motion · Vitest + Testing Library · Playwright.

## Quick start

```bash
scripts/setup.sh          # installs deps, creates .env.local, optionally starts local Supabase
npm run dev:fixture       # dev server with deterministic, clearly labelled sample data
```

Sample PNRs (fixture mode only; every result is badged "Sample data"):

| PNR | Story |
| --- | --- |
| `2345678901` | Confirmed, coach and berth allotted |
| `2345678903` | RAC 1 |
| `2345678905` | Waitlist 5 (GN) |
| `2345678908` | Cancelled |
| `2345678909` | Three passengers: CNF / RAC / WL |
| `2345678900` | No record at the source |

Production refuses `PNR_SOURCE=fixture` at boot. With `PNR_SOURCE=live` and no provider adapter connected, every check resolves to an explicit unavailable state — by design.

### Real data through RailKit (third-party, primary)

`PNR_SOURCE=railkit` reads **RailKit** (railkit.in) over its REST API (`GET https://api.railkit.in/api/v1/pnr/:pnr`, key in the `x-api-key` header). It is a third party, not affiliated with IRCTC or Indian Railways, and not an official source, so travellers never see its name: results read as Trakline, and the privacy page mentions an unnamed third-party data provider. The published `railkit` npm SDK ships only obfuscated code, so it is deliberately not used: the adapter calls the documented endpoint itself, with its own timeout and fail-closed parsing. The fare and booking time are never read.

1. Buy a paid RailKit plan (commercial use needs one) and put the dashboard key in `.env.local`: `RAILKIT_API_KEY=railkit_…` (server only; never commit or paste it anywhere).
2. Confirm the response shape with your own PNR: `npm run source:probe:railkit -- <PNR>`. It prints field names, types and RailKit's error text only, never record values.
3. Run with it: `npm run dev:railkit` (or set `PNR_SOURCE=railkit` in the deployment's environment).

Anything the adapter cannot read (an unknown seat status, class, or date) fails closed with an explicit unavailable state. RailKit's terms allow display inside your own app and short caching for performance; they forbid reselling or redistributing its data. The official path is CRIS's Pravah API platform.

### Only one source

RailKit is the only provider. `PNR_FALLBACK` names a second one to ask while the first is unavailable, and there is no second one to name, so `none` is the only value that parses and anything else is refused at boot (`src/services/env.ts`). That makes RailKit a single point of failure: an expired paid plan quietly drops to 50 requests a month, and RailKit may suspend a key without notice. `npm run source:health` is how you find out before travellers do — it asks each configured source once and exits non-zero when one cannot answer. The fallback seam is kept, tested and ready for a second provider.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` / `dev:fixture` / `dev:railkit` | Dev server (port 3000): no source, sample data, or RailKit |
| `npm run check` | typecheck → lint → unit tests → production build |
| `npm run test:unit` / `test:e2e` | Vitest / Playwright (desktop 1280 + mobile 390) |
| `npm run db:start` / `db:reset` / `db:types` | Local Supabase stack, migrations + seed, generated DB types |
| `npm run db:link` / `db:push` / `db:types:linked` | Hosted project: link the CLI, apply migrations, regenerate DB types |
| `npm run db:config:diff` / `db:config` | Preview, then push `supabase/config.toml` auth settings to the hosted project |
| `npm run screenshots` | Full-page review screenshots into `.impeccable/review/` |

## Environment

Copy `.env.example` to `.env.local` and fill what you use. Accounts (sign-in, synced watchlist) need `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, plus `SUPABASE_SECRET_KEY` for account deletion; everything else works without them. `PNR_SOURCE=fixture` belongs in `.env.development.local` only.

## Documentation

- [docs/architecture.md](docs/architecture.md) — layers, real-only enforcement points, failure modes
- [docs/api-reference.md](docs/api-reference.md) — every route handler with envelopes and status codes
- [docs/onboarding.md](docs/onboarding.md) — first-day setup, Supabase provisioning, conventions
- [DESIGN.md](DESIGN.md) — the visual world and component grammar
- [PRODUCT.md](PRODUCT.md) — product truth: users, purpose, principles
