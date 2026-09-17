# Architecture

## Layers

```
Browser
  components (src/components/*)            — the visual world; no fetch logic
  stores (src/services/stores/*)           — device state: watchlist, recent, share, install, merge
  api-client (src/services/api-client.ts)  — validated fetch; malformed bodies become errors
Next.js server
  route handlers (src/app/api/*)           — thin: guard → validate → repository/query → jsonOk/jsonError
  pnr-query (src/services/pnr-query.ts)    — the one PNR path: validate → rate limit → cache → source
  sources (src/services/sources/*)         — registry: live seam (unavailable until a provider lands) | fixture (dev only)
  watchlist-repo (src/services/watchlist-repo.ts) — supabase-js over RLS-guarded tables
  session (src/services/session.ts)        — verified JWT claims → SessionUser DTO
  proxy (src/proxy.ts)                     — Supabase session refresh on page requests
Supabase
  auth.users + public.watchlist_entries (supabase/migrations/*) — RLS: owner-only
```

The result page renders server-first: `pnr/[pnr]/page.tsx` validates, then a Suspense-wrapped server loader calls `queryPnr` directly (no HTTP hop). Refresh and re-check go through `GET /api/pnr/[pnr]?fresh=1` from the client.

## Real-only enforcement points

1. `src/services/env.ts` — `PNR_SOURCE=fixture` refuses to boot in production.
2. `src/services/sources/index.ts` — the registry refuses the fixture again at call time.
3. `snapshot.source` — `"live" | "fixture"`; every fixture result renders a visible "Sample data" badge.
4. `public/sw.js` — never caches `/api/*` or `/auth/*`; a stale record can never be served as live.
5. `src/services/log.ts` — every log line is redacted; ten-digit runs never reach the console.
6. Prediction fields exist in the type layer but no component renders them.

## Failure modes (each has an automated assertion)

| Condition | Behaviour |
| --- | --- |
| Source unavailable | UnavailableState with Response / Provenance / Fallback cells; retry |
| Source answered, no record | "No record for this PNR", not an error |
| Rate limited (20/min/IP) | 429 with Retry-After; UI counts down |
| Malformed API body | Client zod validation fails → error state, never rendered as data |
| Supabase unconfigured | Accounts surface says so; watchlist stays device-local; APIs 503 |
| Session expired | 401 → UI returns to local mode |
| Storage unavailable / corrupt | Stores degrade to empty; invalid records dropped on parse |
| Invalid `/pnr/xyz` | Real 404 before any await |

## State

- Device: `tt.watchlist.v2`, `tt.recent.v1`, `tt.theme`, `tt.install.v1`, `tt.mergePrompt.v1` — versioned keys, zod-validated on read, synced across tabs via `useSyncExternalStore`.
- Account: `watchlist_entries` with unique `(user_id, pnr)`; local→account merge is planned by `planMerge` and executed by `POST /api/watchlist/merge`.

## Testing

- `tests/unit` — pure logic and jsdom component tests (Vitest projects; `.test.ts` node, `.test.tsx` jsdom).
- `tests/unit/tokens.contract.test.ts` — the design-system guard: AA contrast in both themes, banned arbitrary classes, spacing rhythm, no raw hex, 500-line cap.
- `tests/integration` — route handlers against an in-memory Supabase fake.
- `tests/e2e` — Playwright, desktop + mobile, fixture mode, axe scans on every surface.
