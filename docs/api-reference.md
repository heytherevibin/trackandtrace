# API reference

Every response carries `Cache-Control: no-store`. Errors share one envelope:

```json
{ "ok": false, "code": "RATE_LIMITED", "message": "…", "retryAfter": 42 }
```

Codes: `INVALID_INPUT` 400 · `NOT_FOUND` 404 · `UNAUTHENTICATED` 401 · `RATE_LIMITED` 429 (+ `Retry-After` header) · `SOURCE_UNAVAILABLE` 503 · `INTERNAL` 500.

## POST /api/pnr

Body `{ "pnr": "2345678901", "fresh": true }` (`fresh` optional; unknown fields are refused). The PNR travels in the body because request paths and query strings are recorded in platform request logs and bodies are not. Rate limit 20/min/IP. `fresh: true` bypasses the 60-second read cache. Success:

```json
{ "ok": true, "source": "live|fixture", "cached": false, "latencyMs": 12,
  "rate": { "remaining": 19, "limit": 20 }, "data": { /* PnrResult */ } }
```

`data` validates against `pnrResultSchema` (src/types/schemas.ts) — snapshot (train, class, journey, chart, passengers), lead status, `checkedAt`. `source` is the public one only: `toPublicResult()` maps every provider to `live` before the record leaves the server, and the wire schema accepts nothing else, so a provider is never named to the browser.

## Result links

The result page is `/pnr#<pnr>`: the PNR after "#" is never sent to a server. `POST /check` (form field `pnr`, the pre-hydration form) answers 303 to `/pnr#<pnr>`; old `/pnr/<pnr>` links answer 308 to the same.

## Watchlist (session required; 60 writes/min/user)

- `GET /api/watchlist` → `{ ok, data: WatchlistEntry[] }` newest first
- `POST /api/watchlist` body `{ pnr, label ≤200, checks ≤40 }` → upsert on `(user, pnr)`
- `DELETE /api/watchlist` body `{ pnr }`
- `POST /api/watchlist/merge` body `{ entries: WatchlistUpsert[] ≤50 }` → full list after merge

## Account (session required)

- `GET /api/account/export` → JSON attachment `{ exportedAt, profile, watchlist }`
- `DELETE /api/account` body `{ "confirm": true }` → rows, then auth user, then session. Irreversible.

## Auth

- `GET /auth/callback?code=…` (Google PKCE) or `?token_hash=…&type=magiclink` (email link); `next` must be a same-origin path. Failure → `/login?error=link`.
- `POST /auth/signout` → 303 to `/`.
