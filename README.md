# Track & Trace

Check an Indian Railways PNR and read exactly what the source returned — every field labelled with its provenance and retrieval time. Free, no account needed. Not affiliated with IRCTC or Indian Railways.

**Data policy (the product's spine):** strict real-only. If a verified railway source did not return a field, the interface says "not returned" — it never guesses, never invents confirmation odds, and fails closed when the source is silent. PNRs and passenger names are never written to logs.

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

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` / `dev:fixture` | Dev server (port 3000), without / with sample data |
| `npm run check` | typecheck → lint → unit tests → production build |
| `npm run test:unit` / `test:e2e` | Vitest / Playwright (desktop 1280 + mobile 390) |
| `npm run db:start` / `db:reset` / `db:types` | Local Supabase stack, migrations + seed, generated DB types |
| `npm run screenshots` | Full-page review screenshots into `.impeccable/review/` |

## Environment

Copy `.env.example` to `.env.local` and fill what you use. Accounts (sign-in, synced watchlist) need the three Supabase keys; everything else works without them. `PNR_SOURCE=fixture` belongs in `.env.development.local` only.

## Documentation

- [docs/architecture.md](docs/architecture.md) — layers, real-only enforcement points, failure modes
- [docs/api-reference.md](docs/api-reference.md) — every route handler with envelopes and status codes
- [docs/onboarding.md](docs/onboarding.md) — first-day setup, Supabase provisioning, conventions
- [DESIGN.md](DESIGN.md) — the visual world and component grammar
- [PRODUCT.md](PRODUCT.md) — product truth: users, purpose, principles
