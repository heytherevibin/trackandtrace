# Phase 2a: console hosts and the sign-in shell — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** admin.trakline.in (and admin.localhost locally) serves its own console tree with a strict nonce CSP, beginning with Console Sign In's email states. trakline.in serves nothing of it, and nothing on the traveller site changes.

**Architecture:**
- **Two root layouts.** Traveller pages move unchanged into the `src/app/(site)` route group. The console gets `src/app/console` with its own root layout.
- **`src/proxy.ts` reads the Host header.**
  - On the console host, it rewrites `/x` to `/console/x` and sets a per-request nonce CSP.
  - On other hosts, it answers 404 for `/console/*` and otherwise refreshes Supabase sessions as today.
- **`next.config.ts`** splits its headers by host.
- **The sign-in route** answers the same for every address. Sending links arrives with members in plan 2c.

**Tech stack:** Next.js 16.3.4 (proxy, route groups, typed routes), React 19, Tailwind 4, Base UI, zod 4, Vitest 4, Playwright 1.62.

**Spec:** `docs/superpowers/specs/2026-09-19-phase-2-admin-core-design.md`, sections 3A–3C. Also read `docs/design/sheets/console/ConsoleSignIn.dc.html` (the approved drawing), `docs/design/sheets/console/industry.css` (each class names the app component it mirrors) and `AGENTS.md` (read `node_modules/next/dist/docs/` before writing Next code).

## Global constraints

- Start from `main` after PR #20 (steel text) and PR #21 (this spec) are merged. Branch: `feat/console-hosts`.
- **TDD:** write the failing test first and run it to see it fail. Conventional commits, with **no Co-Authored-By trailer**.
- **Code:**
  - TypeScript strict, no `any`.
  - `readonly` props and immutable data.
  - `@/` path aliases.
  - Files of 500 lines or fewer.
  - Every UI string in a messages module.
- **Contract tests to respect:**
  - `tests/unit/tokens.contract.test.ts`: no `text-[`, `rounded-[`, `tracking-[`, `shadow-[`, `duration-[`, `z-[` or `[var(--`. Numeric margin, padding, gap and inset steps are limited to {0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 24}.
  - `tests/unit/privacy/no-provider-names.test.ts`: no provider names under `src/app`, `src/components` or `src/messages`.
  - `tests/unit/privacy/no-pnr-in-urls.test.ts`.
- **Console hosts are constants:** `admin.trakline.in` when `VERCEL_ENV=production`, and `admin.localhost` everywhere else.
- **Proxy matcher values must be literals.** Next analyses them statically, and ignores variables.
- **Read the host from the `Host` header.** `request.nextUrl` reads `localhost` under `next dev`.
- The console has **no Server Actions**. Its route handlers accept only same-origin requests.
- **Copy is transcribed from the drawing, word for word.** The one exception is the two availability sentences, which are in the spec.
- **Before each commit:** `npm run typecheck && npm run lint && npm run test:unit`. **Before the PR:** also `npm run build`, plus the Playwright specs if Chromium is installed locally (CI always runs them).
- **PR:** into `main`, with `verify` and `e2e` green, a body ending "🤖 Generated with [Claude Code](https://claude.com/claude-code)", and merged only with the owner's go-ahead.

## Files

| File | Responsibility |
|---|---|
| `src/app/(site)/**` | Every traveller page and its root layout, moved unchanged; `[...missing]/page.tsx` for unmatched addresses |
| `src/console/hosts.ts` | Reads the Host header; which host is the console's |
| `src/console/availability.ts` | Whether this deployment may run the console (production, or a local database) |
| `src/console/csp.ts` | The console's nonce CSP and Sentry report address |
| `src/proxy.ts` | Routes by host: console rewrite and nonce, `/console` 404 elsewhere, today's session refresh |
| `next.config.ts` | Headers split by host; `poweredByHeader: false` |
| `src/components/hydration-marker.tsx` | Extracted from `providers.tsx`, shared by both trees |
| `src/components/theme/theme-provider.tsx` | Gains an optional `nonce` for next-themes' boot script |
| `src/components/ui/badge.tsx` | Gains a `steel` variant (readable-steel edge and words) and `caps` |
| `src/console/href.ts` | `consoleHref()`: a console address as the browser sees it |
| `src/console/messages/**` | Console copy (`frame`, `signIn`, `availability`) |
| `src/console/same-origin.ts` | Refuses cross-site requests to console route handlers |
| `src/console/sign-in-limits.ts` | 5 per 10 min per address, 20 per 10 min per connection |
| `src/console/components/*` | `ConsoleProviders`, `EnvStrip`, `ConsoleMasthead`, `SignedOutFrame`, `Unavailable` |
| `src/app/console/layout.tsx`, `page.tsx`, `[...missing]/page.tsx` | The console root layout; `/` and unknown paths go to sign in |
| `src/app/console/login/page.tsx`, `sign-in-form.tsx` | Console Sign In: email, invalid, sending, sent, too many |
| `src/app/console/api/sign-in/route.ts` | One answer for every address |
| `tests/unit/console/*`, `tests/integration/console/*`, `tests/e2e/console/*` | Tests for the above |
| `playwright.config.ts` | `console-desktop` and `console-mobile` projects at `http://admin.localhost:4210` |
| `docs/architecture.md`, `docs/onboarding.md` | The two trees and local console use |

---

### Task 1: Move the traveller pages into `(site)`

**Files:**
- Move (`git mv`) into `src/app/(site)/`:
  - `layout.tsx`, `page.tsx`, `error.tsx`, `not-found.tsx`
  - `opengraph-image.tsx`, `twitter-image.tsx`
  - the folders `account/`, `accuracy/`, `login/`, `offline/`, `pnr/` (with `[pnr]/route.ts`), `pre-booking/`, `privacy/`, `tos/`, `watchlist/`
- Keep at `src/app/`:
  - `api/`, `auth/`, `check/`
  - `global-error.tsx`, `globals.css`, `fonts.ts`
  - `manifest.ts`, `robots.ts`, `apple-icon.tsx`, `icon.svg`, `favicon.ico`
- Create: `src/app/(site)/[...missing]/page.tsx`
- Modify:
  - `src/app/(site)/layout.tsx` (imports)
  - `tests/unit/tokens.contract.test.ts:97` (the OG image's path)
  - the seven tests that import moved pages
  - `tests/integration/api/pnr-links.test.ts` (`pnr/[pnr]`)

**Interfaces:** none new. Every URL stays the same.

- [ ] **Step 1: Move the files**

```bash
mkdir -p "src/app/(site)"
for f in layout.tsx page.tsx error.tsx not-found.tsx opengraph-image.tsx twitter-image.tsx; do git mv "src/app/$f" "src/app/(site)/$f"; done
for d in account accuracy login offline pnr pre-booking privacy tos watchlist; do git mv "src/app/$d" "src/app/(site)/$d"; done
```

- [ ] **Step 2: Fix the moved layout's imports.** In `src/app/(site)/layout.tsx`, change `import "./globals.css";` to `import "../globals.css";`, and `import { fontVars } from "./fonts";` to `import { fontVars } from "../fonts";`.

- [ ] **Step 3: Add the catch-all.** With no app-wide root layout, unmatched addresses need a page that raises the site's own not-found.

```tsx
// src/app/(site)/[...missing]/page.tsx
import { notFound } from "next/navigation";

/** Unmatched traveller addresses show the site's not-found page, inside the site's layout (there is no app-wide root layout). */
export default function Missing(): never {
  notFound();
}
```

- [ ] **Step 4: Point tests at the new paths.** Apply these replacements:

| Old import | New import | In |
|---|---|---|
| `@/app/accuracy/page` | `@/app/(site)/accuracy/page` | `tests/unit/app/accuracy/accuracy-page.test.tsx` |
| `@/app/account/` | `@/app/(site)/account/` | `account-view.test.tsx`, `passkeys-plate.test.tsx` |
| `@/app/login/login-form` | `@/app/(site)/login/login-form` | `login-form.test.tsx` |
| `@/app/pre-booking/pre-booking-form` | `@/app/(site)/pre-booking/pre-booking-form` | `pre-booking-form.test.tsx` |
| `@/app/watchlist/` | `@/app/(site)/watchlist/` | `watchlist-format.test.ts`, `watchlist-view.test.tsx` |
| `@/app/pnr/[pnr]/route` | `@/app/(site)/pnr/[pnr]/route` | `tests/integration/api/pnr-links.test.ts` (twice) |
| `"src/app/opengraph-image.tsx"` | `"src/app/(site)/opengraph-image.tsx"` | `tests/unit/tokens.contract.test.ts:97` |

Search for any `vi.mock("@/app/…")` of a moved module and update it the same way:

```bash
grep -rn '@/app/\(account\|accuracy\|login\|pre-booking\|watchlist\|pnr/\[pnr\]\)' tests
```

Expected: no output.

- [ ] **Step 5: Verify nothing changed for travellers**

```bash
npm run typecheck && npm run test:unit && npm run build
```

Expected: all pass. The build's route list shows the same URLs as before, plus `/[...missing]`.

If Chromium is installed, also run:

```bash
npx playwright test tests/e2e/pages.spec.ts tests/e2e/csp.spec.ts --project=desktop
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add -A src/app tests
git commit -m "refactor(app): move the traveller pages into the (site) route group"
```

---

### Task 2: Console hosts and availability

**Files:**
- Create: `src/console/hosts.ts`, `src/console/availability.ts`
- Test: `tests/unit/console/hosts.test.ts`, `tests/unit/console/availability.test.ts`

**Interfaces (produces):**
- `requestHost(header: string | null): string | null`
- `consoleHostFor(vercelEnv: string | undefined): "admin.trakline.in" | "admin.localhost"`
- `isConsoleHost(header: string | null, vercelEnv: string | undefined): boolean`
- `type ConsoleAvailability = "available" | "production-only" | "local-database-needed"`
- `consoleAvailability(current: { readonly VERCEL_ENV?: string; readonly NEXT_PUBLIC_SUPABASE_URL?: string }): ConsoleAvailability`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/console/hosts.test.ts
import { describe, expect, it } from "vitest";
import { consoleHostFor, isConsoleHost, requestHost } from "@/console/hosts";

describe("requestHost", () => {
  it.each([
    ["admin.trakline.in", "admin.trakline.in"],
    ["ADMIN.Trakline.in:443", "admin.trakline.in"],
    ["admin.localhost:4210", "admin.localhost"],
    [" trakline.in ", "trakline.in"],
  ])("reads %j as %j", (header, host) => {
    expect(requestHost(header)).toBe(host);
  });

  it.each([null, "", "[::1]:4210", "admin.trakline.in/evil", "a b"])("refuses %j", (header) => {
    expect(requestHost(header)).toBeNull();
  });
});

describe("the console host", () => {
  it("is admin.trakline.in in production and admin.localhost everywhere else", () => {
    expect(consoleHostFor("production")).toBe("admin.trakline.in");
    expect(consoleHostFor("preview")).toBe("admin.localhost");
    expect(consoleHostFor(undefined)).toBe("admin.localhost");
  });

  it("matches only this deployment's own console host", () => {
    expect(isConsoleHost("admin.trakline.in", "production")).toBe(true);
    expect(isConsoleHost("admin.localhost:4210", undefined)).toBe(true);
    expect(isConsoleHost("admin.localhost:4210", "production")).toBe(false);
    expect(isConsoleHost("admin.trakline.in", "preview")).toBe(false);
    expect(isConsoleHost("trakline.in", "production")).toBe(false);
    expect(isConsoleHost("admin.trakline.in.evil.com", "production")).toBe(false);
  });
});
```

```ts
// tests/unit/console/availability.test.ts
import { describe, expect, it } from "vitest";
import { consoleAvailability } from "@/console/availability";

// Previews and localhost share the production Supabase project, so the console must refuse to act on it there.
describe("consoleAvailability", () => {
  it("runs in production", () => {
    expect(consoleAvailability({ VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" })).toBe("available");
  });

  it("refuses previews", () => {
    expect(consoleAvailability({ VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" })).toBe("production-only");
  });

  it("runs locally against a local database, or none", () => {
    expect(consoleAvailability({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })).toBe("available");
    expect(consoleAvailability({ NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" })).toBe("available");
    expect(consoleAvailability({})).toBe("available");
  });

  it("refuses a local server pointed at a hosted project", () => {
    expect(consoleAvailability({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" })).toBe("local-database-needed");
    expect(consoleAvailability({ VERCEL_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" })).toBe("local-database-needed");
    expect(consoleAvailability({ NEXT_PUBLIC_SUPABASE_URL: "not a url" })).toBe("local-database-needed");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx vitest run tests/unit/console/hosts.test.ts tests/unit/console/availability.test.ts
```

Expected: FAIL, because `@/console/hosts` and `@/console/availability` can't be resolved.

- [ ] **Step 3: Implement**

```ts
// src/console/hosts.ts
// Which host a request is for. The console answers only on its own host, and the traveller site on every
// other. Hosts are constants per environment, so a preview never serves the console.

export const CONSOLE_HOST_PRODUCTION = "admin.trakline.in";
export const CONSOLE_HOST_LOCAL = "admin.localhost";

/** The request's host, lower-cased and without its port. Null when the header is missing or unreadable. */
export function requestHost(header: string | null): string | null {
  if (!header) return null;
  const host = header.trim().toLowerCase().replace(/:\d+$/, "");
  return /^[a-z0-9.-]+$/.test(host) ? host : null;
}

/** Production answers only on admin.trakline.in; every other environment only on admin.localhost. */
export function consoleHostFor(vercelEnv: string | undefined): typeof CONSOLE_HOST_PRODUCTION | typeof CONSOLE_HOST_LOCAL {
  return vercelEnv === "production" ? CONSOLE_HOST_PRODUCTION : CONSOLE_HOST_LOCAL;
}

export function isConsoleHost(header: string | null, vercelEnv: string | undefined): boolean {
  return requestHost(header) === consoleHostFor(vercelEnv);
}
```

```ts
// src/console/availability.ts
// Previews and local servers use the production Supabase project, so the console would act on real data there.
// It runs in production, or locally against a local database (or none, when there is nothing to act on).

export type ConsoleAvailability = "available" | "production-only" | "local-database-needed";

const LOCAL_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function consoleAvailability(current: { readonly VERCEL_ENV?: string; readonly NEXT_PUBLIC_SUPABASE_URL?: string }): ConsoleAvailability {
  if (current.VERCEL_ENV === "production") return "available";
  if (current.VERCEL_ENV === "preview") return "production-only";
  if (!current.NEXT_PUBLIC_SUPABASE_URL) return "available";
  try {
    return LOCAL_HOSTS.has(new URL(current.NEXT_PUBLIC_SUPABASE_URL).hostname) ? "available" : "local-database-needed";
  } catch {
    return "local-database-needed";
  }
}
```

- [ ] **Step 4: Run the tests again.** Same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/console/hosts.ts src/console/availability.ts tests/unit/console
git commit -m "feat(console): tell the console host apart, and where the console may run"
```

---

### Task 3: The console CSP

**Files:**
- Create: `src/console/csp.ts`
- Test: `tests/unit/console/csp.test.ts`

**Interfaces (produces):**
- `newNonce(): string`
- `THEME_BOOT_HASH: string`: the quoted `'sha256-…'` of `THEME_BOOT_SCRIPT`, which `src/app/global-error.tsx` inlines
- `sentryReportUri(dsn: string | undefined, vercelEnv: string | undefined): string | null`
- `consoleCsp(options: { readonly nonce: string; readonly dev: boolean; readonly supabaseOrigin: string | null; readonly reportUri: string | null }): string`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/console/csp.test.ts
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { THEME_BOOT_SCRIPT } from "@/components/theme/theme-boot";
import { THEME_BOOT_HASH, consoleCsp, newNonce, sentryReportUri } from "@/console/csp";

const directive = (policy: string, name: string) => policy.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("the console CSP", () => {
  const policy = consoleCsp({ nonce: "abc123", dev: false, supabaseOrigin: "https://x.supabase.co", reportUri: null });

  it("runs only scripts carrying this request's nonce, and what they load", () => {
    const scripts = directive(policy, "script-src");
    expect(scripts).toContain("'nonce-abc123'");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
  });

  it("allows the one inline boot script by its hash", () => {
    const expected = `'sha256-${createHash("sha256").update(THEME_BOOT_SCRIPT).digest("base64")}'`;
    expect(THEME_BOOT_HASH).toBe(expected);
    expect(directive(policy, "script-src")).toContain(expected);
  });

  it("frames nothing, loads no plugins and pins the base", () => {
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("upgrade-insecure-requests");
  });

  it("talks only to itself and Supabase", () => {
    expect(directive(policy, "connect-src")).toBe("connect-src 'self' https://x.supabase.co wss://x.supabase.co");
  });

  it("allows eval and the dev socket in development only", () => {
    const dev = consoleCsp({ nonce: "n", dev: true, supabaseOrigin: null, reportUri: null });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toBe("connect-src 'self' ws:");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });

  it("reports to Sentry from production only", () => {
    const dsn = "https://abc@o1.ingest.de.sentry.io/2";
    expect(sentryReportUri(dsn, "production")).toBe("https://o1.ingest.de.sentry.io/api/2/security/?sentry_key=abc");
    expect(sentryReportUri(dsn, "preview")).toBeNull();
    expect(sentryReportUri(undefined, "production")).toBeNull();
    expect(consoleCsp({ nonce: "n", dev: false, supabaseOrigin: null, reportUri: "https://r" })).toContain("report-uri https://r");
  });

  it("makes a fresh nonce each time", () => {
    const a = newNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(newNonce()).not.toBe(a);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
npx vitest run tests/unit/console/csp.test.ts
```

Expected: FAIL, because `@/console/csp` doesn't resolve.

- [ ] **Step 3: Implement**

```ts
// src/console/csp.ts
import { createHash } from "node:crypto";
import { THEME_BOOT_SCRIPT } from "@/components/theme/theme-boot";

// The console's policy, set per request by the proxy.
// - Scripts run only with this request's nonce, plus what those scripts load ('strict-dynamic'), and the one
//   hashed boot script that global-error.tsx inlines.
// - Styles keep 'unsafe-inline': a nonce can't cover a style attribute, and the toast library injects a <style>
//   without one.

export interface ConsoleCspOptions {
  readonly nonce: string;
  readonly dev: boolean;
  readonly supabaseOrigin: string | null;
  readonly reportUri: string | null;
}

export const THEME_BOOT_HASH = `'sha256-${createHash("sha256").update(THEME_BOOT_SCRIPT).digest("base64")}'`;

/** A fresh, unguessable nonce for each request. */
export function newNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

/** Sentry's CSP report endpoint, from the public DSN. Production only, as on the traveller site. */
export function sentryReportUri(dsn: string | undefined, vercelEnv: string | undefined): string | null {
  if (!dsn || vercelEnv !== "production") return null;
  try {
    const url = new URL(dsn);
    return `${url.protocol}//${url.host}/api${url.pathname}/security/?sentry_key=${url.username}`;
  } catch {
    return null;
  }
}

export function consoleCsp({ nonce, dev, supabaseOrigin, reportUri }: ConsoleCspOptions): string {
  const supabase = supabaseOrigin ? ` ${supabaseOrigin} ${supabaseOrigin.replace("http", "ws")}` : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${THEME_BOOT_HASH}${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${supabase}${dev ? " ws:" : ""}`,
    "worker-src 'none'",
    "manifest-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
    ...(reportUri ? [`report-uri ${reportUri}`] : []),
  ].join("; ");
}
```

- [ ] **Step 4: Run the test again.** Same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/console/csp.ts tests/unit/console/csp.test.ts
git commit -m "feat(console): a nonce content security policy for the console host"
```

---

### Task 4: The proxy routes by host

**Files:**
- Modify: `src/proxy.ts` (all of it)
- Modify: `tests/unit/app/proxy-matcher.test.ts` (rewrite it)
- Test: `tests/unit/proxy.test.ts` (new)

**Interfaces:**
- Consumes: `isConsoleHost` (Task 2); `consoleCsp`, `newNonce`, `sentryReportUri` (Task 3).
- Produces: console requests reach `/console/<path>` with the request headers `x-nonce` and `Content-Security-Policy`. Pages read the nonce with `(await headers()).get("x-nonce")`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/app/proxy-matcher.test.ts (replaces the file)
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { config } from "@/proxy";

// Traveller hosts: pages only, never the API, static assets or the /monitoring tunnel (as before).
// The console host: everything but Next's own files, the tunnel and the icons.
// /console on any host: always, so the proxy can answer 404.

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe("the proxy matcher", () => {
  it.each(["https://trakline.in/", "https://trakline.in/pnr", "https://trakline.in/account", "https://trakline.in/watchlist"])("runs on the traveller page %s", (url) => {
    expect(matches(url)).toBe(true);
  });

  it.each(["https://trakline.in/monitoring", "https://trakline.in/api/pnr", "https://trakline.in/_next/static/chunks/app.js", "https://trakline.in/sw.js", "https://trakline.in/brand/mark.svg"])("skips %s", (url) => {
    expect(matches(url)).toBe(false);
  });

  it.each(["https://admin.trakline.in/", "https://admin.trakline.in/login", "https://admin.trakline.in/api/sign-in", "https://admin.trakline.in/robots.txt", "http://admin.localhost:4210/login"])("runs on the console page %s", (url) => {
    expect(matches(url)).toBe(true);
  });

  it.each(["https://admin.trakline.in/_next/static/chunks/app.js", "https://admin.trakline.in/monitoring", "https://admin.trakline.in/favicon.ico", "https://admin.trakline.in/icon.svg"])("lets the console host's %s through untouched", (url) => {
    expect(matches(url)).toBe(false);
  });

  it("always runs on /console, so it can refuse it", () => {
    expect(matches("https://trakline.in/console/login")).toBe(true);
  });
});
```

```ts
// tests/unit/proxy.test.ts
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// The proxy is the host router. With Supabase unconfigured, the traveller branch passes requests through untouched.
vi.mock("@/services/supabase/public-env", () => ({ isSupabaseConfigured: () => false, supabasePublicEnv: { url: "", publishableKey: "" } }));

const { proxy } = await import("@/proxy");

function request(url: string): NextRequest {
  return new NextRequest(url, { headers: { host: new URL(url).host } });
}

afterEach(() => vi.unstubAllEnvs());

describe("the proxy on the console host", () => {
  it("rewrites a page into the console tree, with a nonce policy on the request and the response", async () => {
    const response = await proxy(request("http://admin.localhost:4210/login"));
    expect(response.headers.get("x-middleware-rewrite")).toBe("http://admin.localhost:4210/console/login");
    const policy = response.headers.get("content-security-policy") ?? "";
    const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
    expect(nonce).toBeTruthy();
    expect(response.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(policy);
  });

  it("maps the home page onto the console's home", async () => {
    const response = await proxy(request("http://admin.localhost:4210/"));
    expect(response.headers.get("x-middleware-rewrite")).toBe("http://admin.localhost:4210/console");
  });

  it("keeps the query string", async () => {
    const response = await proxy(request("http://admin.localhost:4210/login?step=key"));
    expect(response.headers.get("x-middleware-rewrite")).toBe("http://admin.localhost:4210/console/login?step=key");
  });

  it("gives each request its own nonce", async () => {
    const a = (await proxy(request("http://admin.localhost:4210/login"))).headers.get("x-middleware-request-x-nonce");
    const b = (await proxy(request("http://admin.localhost:4210/login"))).headers.get("x-middleware-request-x-nonce");
    expect(a).not.toBe(b);
  });

  it("answers 404 to the internal /console addresses, so each page has one address", async () => {
    expect((await proxy(request("http://admin.localhost:4210/console/login"))).status).toBe(404);
  });

  it("closes robots and refuses the traveller service worker and manifest", async () => {
    const robots = await proxy(request("http://admin.localhost:4210/robots.txt"));
    expect(await robots.text()).toBe("User-agent: *\nDisallow: /\n");
    expect((await proxy(request("http://admin.localhost:4210/sw.js"))).status).toBe(404);
    expect((await proxy(request("http://admin.localhost:4210/manifest.webmanifest"))).status).toBe(404);
  });

  it("serves the console only on production's own console host", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const { resetEnvCache } = await import("@/services/env");
    resetEnvCache();
    expect((await proxy(request("https://admin.trakline.in/login"))).headers.get("x-middleware-rewrite")).toBe("https://admin.trakline.in/console/login");
    expect((await proxy(request("http://admin.localhost:4210/login"))).headers.get("x-middleware-rewrite")).toBeNull();
    resetEnvCache();
  });
});

describe("the proxy on traveller hosts", () => {
  it("answers 404 to the console tree", async () => {
    expect((await proxy(request("https://trakline.in/console/login"))).status).toBe(404);
    expect((await proxy(request("http://localhost:4210/console"))).status).toBe(404);
  });

  it("leaves traveller pages alone, with no console policy", async () => {
    const response = await proxy(request("https://trakline.in/pnr"));
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("content-security-policy")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx vitest run tests/unit/app/proxy-matcher.test.ts tests/unit/proxy.test.ts
```

Expected: FAIL. The console URLs don't match, and there's no rewrite.

- [ ] **Step 3: Implement.** Replace `src/proxy.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { consoleCsp, newNonce, sentryReportUri } from "@/console/csp";
import { isConsoleHost } from "@/console/hosts";
import { env } from "@/services/env";
import { isSupabaseConfigured, supabasePublicEnv } from "@/services/supabase/public-env";
import type { Database } from "@/types/supabase";

// One app, two hosts.
// - The console host rewrites every page into /console, with a fresh nonce policy.
// - Every other host answers 404 to /console, and refreshes an expiring Supabase session on page requests, as
//   before. Route handlers under /api make their own client.

const CONSOLE_PREFIX = "/console";
const ROBOTS_CLOSED = "User-agent: *\nDisallow: /\n";

function notFound(): NextResponse {
  return new NextResponse(null, { status: 404 });
}

function isConsolePath(pathname: string): boolean {
  return pathname === CONSOLE_PREFIX || pathname.startsWith(`${CONSOLE_PREFIX}/`);
}

function supabaseOrigin(): string | null {
  try {
    return supabasePublicEnv.url ? new URL(supabasePublicEnv.url).origin : null;
  } catch {
    return null;
  }
}

function consoleRequest(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (isConsolePath(pathname)) return notFound();
  if (pathname === "/robots.txt") return new NextResponse(ROBOTS_CLOSED, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  if (pathname === "/sw.js" || pathname === "/manifest.webmanifest") return notFound();

  const current = env();
  const nonce = newNonce();
  const policy = consoleCsp({
    nonce,
    dev: current.NODE_ENV === "development",
    supabaseOrigin: supabaseOrigin(),
    reportUri: sentryReportUri(process.env.NEXT_PUBLIC_SENTRY_DSN, current.VERCEL_ENV),
  });
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);

  const destination = request.nextUrl.clone();
  destination.pathname = pathname === "/" ? CONSOLE_PREFIX : `${CONSOLE_PREFIX}${pathname}`;
  const response = NextResponse.rewrite(destination, { request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

async function refreshSession(request: NextRequest): Promise<NextResponse> {
  if (!isSupabaseConfigured()) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(supabasePublicEnv.url, supabasePublicEnv.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // No logic between client creation and this call: it performs the refresh.
  await supabase.auth.getClaims();
  return response;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (isConsoleHost(request.headers.get("host"), env().VERCEL_ENV)) return consoleRequest(request);
  if (isConsolePath(request.nextUrl.pathname)) return notFound();
  return refreshSession(request);
}

// Literals only: Next reads the matcher statically. The host pattern is anchored and escaped by Next itself.
export const config = {
  matcher: [
    {
      source: "/((?!api/|monitoring|_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.webmanifest|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
      missing: [{ type: "host", value: "(?:admin\\.trakline\\.in|admin\\.localhost)" }],
    },
    {
      source: "/((?!_next/|__nextjs|monitoring|favicon\\.ico|icon\\.svg|apple-icon|brand/).*)",
      has: [{ type: "host", value: "(?:admin\\.trakline\\.in|admin\\.localhost)" }],
    },
    "/console/:path*",
  ],
};
```

If `tsc` rejects the matcher's object literals, add `as const` to the matcher array. The shape comes from `MiddlewareConfigMatcherInput`.

- [ ] **Step 4: Run the tests again.** Same command. Expected: PASS.

If `x-middleware-next` or `x-middleware-request-*` are named differently in this Next version, read `node_modules/next/dist/server/web/spec-extension/response.js` and assert on the names it sets. Don't weaken what the tests check.

- [ ] **Step 5: Commit**

```bash
git add src/proxy.ts tests/unit/app/proxy-matcher.test.ts tests/unit/proxy.test.ts
git commit -m "feat(proxy): route the console host into its own tree with a nonce policy"
```

---

### Task 5: Headers by host

**Files:**
- Modify: `next.config.ts`: the `headers()` block, and add `poweredByHeader: false`
- Test: `tests/unit/next-config.test.ts`: add a `describe` block

- [ ] **Step 1: Write the failing test.** Append to `tests/unit/next-config.test.ts`:

```ts
describe("headers by host", () => {
  async function headersAt(url: string) {
    return (await unstable_getResponseFromNextConfig({ url, nextConfig })).headers;
  }

  it("keeps the traveller policy off the console host, whose own policy comes from the proxy", async () => {
    for (const url of ["https://admin.trakline.in/login", "http://admin.localhost:4210/login"]) {
      const headers = await headersAt(url);
      expect(headers.get("content-security-policy"), url).toBeNull();
      expect(headers.get("x-robots-tag"), url).toBe("noindex, nofollow, noarchive");
      expect(headers.get("referrer-policy"), url).toBe("no-referrer");
      expect(headers.get("cross-origin-opener-policy"), url).toBe("same-origin");
      expect(headers.get("cross-origin-resource-policy"), url).toBe("same-origin");
      expect(headers.get("permissions-policy"), url).toContain("publickey-credentials-get=(self)");
      expect(headers.get("x-frame-options"), url).toBe("DENY");
      expect(headers.get("strict-transport-security"), url).toContain("includeSubDomains");
    }
  });

  it("keeps the traveller host's headers as they were", async () => {
    const headers = await headersAt("https://trakline.in/pnr");
    expect(headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(headers.get("x-robots-tag")).toBeNull();
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
npx vitest run tests/unit/next-config.test.ts
```

Expected: FAIL. The console host still gets the traveller CSP and has no X-Robots-Tag.

- [ ] **Step 3: Implement.** In `next.config.ts`:
  - Add `poweredByHeader: false,` after `typedRoutes: true,`.
  - Replace `async headers()` with the following:

```ts
  async headers() {
    // Constants, as the proxy's matcher: the console host in production, and admin.localhost everywhere else.
    const consoleHost = { type: "host" as const, value: "(?:admin\\.trakline\\.in|admin\\.localhost)" };
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
      {
        source: "/:path*",
        missing: [consoleHost],
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
      {
        // The console's nonce policy is set per request by src/proxy.ts; nothing here may send a second one.
        source: "/:path*",
        has: [consoleHost],
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), publickey-credentials-get=(self), publickey-credentials-create=(self)" },
        ],
      },
    ];
  },
```

Also update the comment above `const csp` to say "(the console host gets a nonce policy from src/proxy.ts)".

- [ ] **Step 4: Run it again.** Same command. Expected: PASS, including the existing redirect and CSP tests.

- [ ] **Step 5: Commit**

```bash
git add next.config.ts tests/unit/next-config.test.ts
git commit -m "feat(headers): console-host headers, and the traveller policy on traveller hosts only"
```

---

### Task 6: Console copy, `consoleHref`, the badge variant and the import boundary

**Files:**
- Create:
  - `src/console/messages/en-IN/frame.ts`, `src/console/messages/en-IN/sign-in.ts`, `src/console/messages/en-IN/availability.ts`
  - `src/console/messages/index.ts`
  - `src/console/href.ts`
- Modify: `src/components/ui/badge.tsx`, adding a `steel` variant and `caps`
- Test:
  - `tests/unit/console/messages.test.ts`
  - `tests/unit/console/boundary.contract.test.ts`
  - `tests/unit/components/badge.test.tsx` (add cases)

**Interfaces (produces):**
- `consoleMessages.frame`: `productName`, `consoleTag`, `home`, and `environment.production`, `environment.preview`, `environment.previewHost(host)`.
- `consoleMessages.signIn`:
  - `pageTitle`, `title`, `lead`, `form`, `plate`
  - `emailLabel`, `emailPlaceholder`, `send`, `sending`, `legend`, `invalid`, `tooMany`
  - `sent.title`, `sent.detail`, `sent.again`, `sent.againIn(s)`, `sent.different`
- `consoleMessages.availability`: `plate`, `productionOnly`, `localDatabase`.
- `consoleHref(path: \`/${string}\`): Route`.
- `<Badge variant="steel" caps>`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/console/messages.test.ts
import { describe, expect, it } from "vitest";
import { consoleMessages } from "@/console/messages";

function leaves(tree: unknown, path: string[] = []): [string, unknown][] {
  if (typeof tree !== "object" || tree === null) return [[path.join("."), tree]];
  return Object.entries(tree as Record<string, unknown>).flatMap(([k, v]) => leaves(v, [...path, k]));
}

describe("console messages", () => {
  it("has no empty strings and no placeholder text", () => {
    for (const [key, value] of leaves(consoleMessages)) {
      if (typeof value === "string") {
        expect(value.trim().length, key).toBeGreaterThan(0);
        expect(value, key).not.toMatch(/lorem|todo|tbd/i);
      } else {
        expect(typeof value, key).toBe("function");
      }
    }
  });

  it("words the sent state the same for every address", () => {
    expect(consoleMessages.signIn.sent.detail).toBe("If this address belongs to a console member, a sign-in link is on its way.");
    expect(consoleMessages.signIn.sent.againIn(42)).toBe("Send again in 42 s");
    expect(consoleMessages.frame.environment.previewHost("admin.localhost:4210")).toBe("Staging data · admin.localhost:4210");
  });
});
```

```ts
// tests/unit/console/boundary.contract.test.ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Console code (which may name providers) never reaches traveller code. Only the console tree, its pages, and the
// host router may import @/console.
const ROOT = join(__dirname, "..", "..", "..");
const ALLOWED = [`src${sep}console${sep}`, `src${sep}app${sep}console${sep}`, `src${sep}proxy.ts`];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("the console boundary", () => {
  it("is imported only by console code and the proxy", () => {
    const offenders = sourceFiles(join(ROOT, "src"))
      .map((file) => relative(ROOT, file))
      .filter((file) => !ALLOWED.some((prefix) => file.startsWith(prefix)))
      .filter((file) => /(?:from\s+|import\()\s*["']@\/console\//.test(readFileSync(join(ROOT, file), "utf8")));
    expect(offenders).toEqual([]);
  });
});
```

Add to `tests/unit/components/badge.test.tsx`:

```tsx
  it("draws the console's steel tag: readable steel edge and words, frame tags in capitals", () => {
    render(
      <Badge variant="steel" caps>
        Console
      </Badge>,
    );
    const tag = screen.getByText("Console");
    expect(tag).toHaveClass("border", "border-accent-text", "text-accent-text", "font-display", "font-semibold", "uppercase", "tracking-caps");
    expect(tag).not.toHaveClass("border-accent", "text-accent");
  });
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx vitest run tests/unit/console/messages.test.ts tests/unit/console/boundary.contract.test.ts tests/unit/components/badge.test.tsx
```

Expected:
- The messages test fails to resolve its import.
- The badge case fails. `steel` isn't a variant, so the tag falls back to the accent fill.
- The boundary test passes already. It guards later tasks.

- [ ] **Step 3: Implement**

```ts
// src/console/messages/en-IN/frame.ts
import type { MessageTree } from "@/messages/types";

// The console frame, as drawn in B0 and B2 (docs/design/sheets/console).
export const frame = {
  productName: "Trakline",
  consoleTag: "Console",
  home: "Trakline console",
  environment: {
    production: "Production",
    preview: "Preview",
    previewHost: (host: string) => `Staging data · ${host}`,
  },
} as const satisfies MessageTree;
```

```ts
// src/console/messages/en-IN/sign-in.ts
import type { MessageTree } from "@/messages/types";

// Console Sign In (Form TC-02), word for word from docs/design/sheets/console/ConsoleSignIn.dc.html.
export const signIn = {
  pageTitle: "Sign in",
  title: "Console sign in",
  lead: "For the Trakline team. Use your console email, not your everyday account.",
  form: "Form TC-02",
  plate: "Email link",
  emailLabel: "Console email",
  emailPlaceholder: "name@example.com",
  send: "Email me a sign-in link",
  sending: "Sending…",
  legend: "The link works once and expires in 1 hour.",
  invalid: "Enter an email address like name@example.com.",
  tooMany: "Too many sign-in requests. Try again in 10 minutes.",
  sent: {
    title: "Check your inbox",
    detail: "If this address belongs to a console member, a sign-in link is on its way.",
    again: "Send it again",
    againIn: (seconds: number) => `Send again in ${seconds} s`,
    different: "Use a different email",
  },
} as const satisfies MessageTree;
```

```ts
// src/console/messages/en-IN/availability.ts
import type { MessageTree } from "@/messages/types";

// Where the console refuses to run (spec 3A): previews and local servers use the production database.
export const availability = {
  plate: "Console",
  productionOnly: "The console runs only in production.",
  localDatabase: "Point the app at a local Supabase to use the console.",
} as const satisfies MessageTree;
```

```ts
// src/console/messages/index.ts
import { availability } from "./en-IN/availability";
import { frame } from "./en-IN/frame";
import { signIn } from "./en-IN/sign-in";

/** Console copy. It may name providers; traveller code never imports it (tests/unit/console/boundary.contract.test.ts). */
export const consoleMessages = { frame, signIn, availability } as const;
```

```ts
// src/console/href.ts
import type { Route } from "next";

/** A console address as the browser sees it on the console host. typedRoutes knows these pages only as /console/…, so the cast lives here, once. */
export function consoleHref(path: `/${string}`): Route {
  return path as Route;
}
```

In `src/components/ui/badge.tsx`:
- Extend the type to `export type TagVariant = "accent" | "outline" | "neutral" | "steel";`.
- Add `steel: "border border-accent-text text-accent-text",` to `VARIANT`.
- Add `readonly caps?: boolean;` to `BadgeProps`.
- Resolve `steel`, and add the caps classes:

```tsx
export function Badge({ variant, tone, icon, caps = false, className, children, ...rest }: BadgeProps) {
  const resolved: TagVariant =
    variant === "outline" || variant === "steel" ? variant : variant === "neutral" || tone === "neutral" ? "neutral" : "accent";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-[3px] text-2xs leading-normal tracking-head",
        VARIANT[resolved],
        // The console frame's own tags (environment, CONSOLE, the member's role): condensed capitals.
        caps && "font-display font-semibold uppercase tracking-caps",
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </span>
  );
}
```

Also add a line to the comment above `VARIANT`: `"steel" = the console's .tag-outline: readable steel edge and words (B0 review).`

- [ ] **Step 4: Run the tests again.** Same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/console/messages src/console/href.ts src/components/ui/badge.tsx tests/unit/console tests/unit/components/badge.test.tsx
git commit -m "feat(console): console copy, addresses, the steel tag and the import boundary"
```

---

### Task 7: The console layout and signed-out frame

**Files:**
- Create:
  - `src/components/hydration-marker.tsx`
  - `src/console/components/console-providers.tsx`, `env-strip.tsx`, `console-masthead.tsx`, `signed-out-frame.tsx`, `unavailable.tsx`
  - `src/app/console/layout.tsx`, `src/app/console/page.tsx`, `src/app/console/[...missing]/page.tsx`
- Modify:
  - `src/components/providers.tsx` (import the extracted `HydrationMarker`)
  - `src/components/theme/theme-provider.tsx` (optional `nonce`)
- Test: `tests/unit/console/frame.test.tsx`

**Interfaces:**
- Consumes: `consoleMessages` and `Badge` `steel`/`caps` (Task 6); `consoleAvailability` and `consoleHostFor` (Task 2).
- Produces:
  - `SignedOutFrame({ children })`: a server component that reads `headers()` for the host.
  - `EnvStrip({ production, host })`.
  - `ConsoleMasthead()`.
  - `ConsoleProviders({ nonce, children })`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/console/frame.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EnvStrip } from "@/console/components/env-strip";

// B0: Production and Preview differ by shape and word, never by colour.
describe("the environment strip", () => {
  it("draws production as a hairline with a filled tag and the host", () => {
    const { container } = render(<EnvStrip production host="admin.trakline.in" />);
    expect(screen.getByText("Production")).toHaveClass("bg-accent-soft", "uppercase");
    expect(screen.getByText("admin.trakline.in")).toBeInTheDocument();
    expect(container.firstElementChild).not.toHaveClass("border-dashed");
  });

  it("draws preview as a dashed rule with an outline tag and the staging line", () => {
    const { container } = render(<EnvStrip production={false} host="admin.localhost:4210" />);
    expect(screen.getByText("Preview")).toHaveClass("border-accent-text", "uppercase");
    expect(screen.getByText("Staging data · admin.localhost:4210")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("border-dashed");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
npx vitest run tests/unit/console/frame.test.tsx
```

Expected: FAIL. `@/console/components/env-strip` doesn't resolve.

- [ ] **Step 3: Implement the shared pieces**

```tsx
// src/components/hydration-marker.tsx
"use client";

import { useEffect } from "react";

/** Marks the document once React is interactive; styles and tests key off it (html[data-hydrated]). */
export function HydrationMarker(): null {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return null;
}
```

In `src/components/providers.tsx`:
- Delete the local `HydrationMarker` function and the `useEffect` import.
- Add `import { HydrationMarker } from "@/components/hydration-marker";`.

In `src/components/theme/theme-provider.tsx`:
- Accept `nonce` and pass it through as `export function ThemeProvider({ nonce, children }: { readonly nonce?: string; readonly children: ReactNode })`.
- Add `nonce={nonce}` to `<NextThemes …>`. next-themes 0.4.6 accepts `nonce` and puts it on its boot script.

- [ ] **Step 4: Implement the console frame.** Transcribe from `ConsoleSignIn.dc.html` (`envStrip`, `masthead(…, { signedIn: false })`) and the `industry.css` classes named below.

```tsx
// src/console/components/env-strip.tsx
import { Badge } from "@/components/ui/badge";
import { consoleMessages } from "@/console/messages";
import { cn } from "@/utils/cn";

const m = consoleMessages.frame.environment;

/**
 * The environment strip, 28px, always visible. Production is a hairline rule with a filled tag, and Preview a dashed
 * rule with an outline tag: shape and word differ, never colour (B0).
 */
export function EnvStrip({ production, host }: { readonly production: boolean; readonly host: string }) {
  return (
    <div className={cn("flex h-7 shrink-0 items-center gap-2 border-b px-4 sm:gap-2.5 sm:px-6", production ? "border-line" : "border-dashed border-line-strong")}>
      <Badge variant={production ? "accent" : "steel"} caps>
        {production ? m.production : m.preview}
      </Badge>
      <span className="legend-md min-w-0 truncate">{production ? host : m.previewHost(host)}</span>
    </div>
  );
}
```

```tsx
// src/console/components/console-masthead.tsx
import Link from "next/link";
import { Mark } from "@/components/brand/mark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";

const m = consoleMessages.frame;

/**
 * The console masthead, 56px, as drawn for Sign In and Setup: the mark, TRAKLINE, the CONSOLE tag and the theme
 * button. Signed-in parts (the clock and the member box) arrive with sessions.
 */
export function ConsoleMasthead() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-4 sm:gap-3 sm:px-6">
      <Link href={consoleHref("/")} aria-label={m.home} className="inline-flex items-center gap-2.5 text-ink-1 no-underline max-sm:size-11 max-sm:justify-center">
        <Mark size={24} />
        <span className="font-display text-lg font-semibold uppercase tracking-brand max-sm:hidden">{m.productName}</span>
      </Link>
      <Badge variant="steel" caps>
        {m.consoleTag}
      </Badge>
      <div className="flex-1" />
      <ThemeToggle className="max-sm:size-11" />
    </header>
  );
}
```

```tsx
// src/console/components/signed-out-frame.tsx
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { env } from "@/services/env";
import { ConsoleMasthead } from "./console-masthead";
import { EnvStrip } from "./env-strip";

/** Sign In and Setup: the environment strip, the masthead, and one 440px column (full width on phones). */
export async function SignedOutFrame({ children }: { readonly children: ReactNode }) {
  const host = (await headers()).get("host") ?? "";
  return (
    <div className="flex min-h-dvh flex-col">
      <EnvStrip production={env().VERCEL_ENV === "production"} host={host} />
      <ConsoleMasthead />
      <main id="main" className="flex flex-1 justify-center px-4 py-8 sm:px-6 sm:py-18">
        <div className="flex w-full flex-col sm:w-[440px]">{children}</div>
      </main>
    </div>
  );
}
```

```tsx
// src/console/components/unavailable.tsx
import { Led } from "@/components/ui/led";
import { Plate } from "@/components/ui/plate";
import type { ConsoleAvailability } from "@/console/availability";
import { consoleMessages } from "@/console/messages";
import { SignedOutFrame } from "./signed-out-frame";

const m = consoleMessages.availability;

/** Shown instead of any console page where the console must not run (spec 3A). */
export function Unavailable({ reason }: { readonly reason: Exclude<ConsoleAvailability, "available"> }) {
  return (
    <SignedOutFrame>
      <Plate title={m.plate} cells="tight" padding="none" bodyClassName="px-4 py-5 sm:p-6">
        <p role="status" className="flex items-center gap-2.5 text-sm text-ink-1">
          <Led />
          {reason === "production-only" ? m.productionOnly : m.localDatabase}
        </p>
      </Plate>
    </SignedOutFrame>
  );
}
```

```tsx
// src/console/components/console-providers.tsx
"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import type { ReactNode } from "react";
import { HydrationMarker } from "@/components/hydration-marker";
import { ThemeProvider } from "@/components/theme/theme-provider";

/** The console's client context: the shared theme (its boot script carries this request's nonce) and motion. No traveller session. */
export function ConsoleProviders({ nonce, children }: { readonly nonce: string | undefined; readonly children: ReactNode }) {
  return (
    <ThemeProvider nonce={nonce}>
      <LazyMotion features={domAnimation} strict>
        <MotionConfig reducedMotion="user">
          <HydrationMarker />
          {children}
        </MotionConfig>
      </LazyMotion>
    </ThemeProvider>
  );
}
```

- [ ] **Step 5: Implement the console tree**

```tsx
// src/app/console/layout.tsx
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import "../globals.css";
import { DARK, LIGHT } from "@/components/brand/brand-colors";
import { consoleAvailability } from "@/console/availability";
import { ConsoleProviders } from "@/console/components/console-providers";
import { Unavailable } from "@/console/components/unavailable";
import { isConsoleHost } from "@/console/hosts";
import { env } from "@/services/env";
import { fontVars } from "../fonts";

export const metadata: Metadata = {
  title: { default: "Trakline console", template: "%s · Trakline console" },
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: LIGHT.surface0 },
    { media: "(prefers-color-scheme: dark)", color: DARK.surface0 },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// The console's own root layout: its own document, the shared tokens and fonts, and none of the traveller shell.
// Reading headers() makes every console page dynamic, which the nonce policy needs.
export default async function ConsoleLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const requested = await headers();
  const current = env();
  // A backstop behind the proxy: this tree renders only on the console host.
  if (!isConsoleHost(requested.get("host"), current.VERCEL_ENV)) notFound();
  const availability = consoleAvailability(current);
  return (
    <html lang="en" className={fontVars} suppressHydrationWarning>
      <body className="bg-surface-0 text-ink-1">
        <ConsoleProviders nonce={requested.get("x-nonce") ?? undefined}>
          {availability === "available" ? children : <Unavailable reason={availability} />}
        </ConsoleProviders>
      </body>
    </html>
  );
}
```

```tsx
// src/app/console/page.tsx
import { redirect } from "next/navigation";
import { consoleHref } from "@/console/href";

/** The console's home. Until sessions exist (plan 2c) it is the sign-in page. */
export default function ConsoleHome(): never {
  redirect(consoleHref("/login"));
}
```

```tsx
// src/app/console/[...missing]/page.tsx
import { redirect } from "next/navigation";
import { consoleHref } from "@/console/href";

/** Unknown console addresses go to sign in. Plan 2d gives signed-in members a not-found state. */
export default function ConsoleMissing(): never {
  redirect(consoleHref("/login"));
}
```

- [ ] **Step 6: Run the unit test, then check the tree by hand**

```bash
npx vitest run tests/unit/console/frame.test.tsx && npm run typecheck && npm run build
```

Expected: PASS, and the build lists `/console`, `/console/[...missing]` and `/console/login` (after Task 9) as dynamic (ƒ).

In the build output, check that `notFound()` in the console root layout builds. If Next refuses `notFound()` in a root layout:
- render `<Unavailable reason="production-only" />` for a foreign host instead;
- write down why in a comment.

- [ ] **Step 7: Commit**

```bash
git add src/components/hydration-marker.tsx src/components/providers.tsx src/components/theme/theme-provider.tsx src/console/components src/app/console tests/unit/console/frame.test.tsx
git commit -m "feat(console): the console's own root layout, environment strip and signed-out masthead"
```

---

### Task 8: `POST /api/sign-in` gives one answer

**Files:**
- Create: `src/console/same-origin.ts`, `src/console/sign-in-limits.ts`, `src/app/console/api/sign-in/route.ts`
- Test: `tests/integration/console/sign-in.test.ts`

**Interfaces:**
- `assertSameOrigin(req: Request): void`: throws a 403 `AppError` otherwise.
- `CONSOLE_SIGN_IN_LIMITS`: `{ perAddress: { limit: 5, windowMs: 600_000 }, perConnection: { limit: 20, windowMs: 600_000 } }`.
- `assertSignInAllowed(email: string, ip: string, limiter?: RateLimiter): Promise<void>`: throws `RATE_LIMITED` with `consoleMessages.signIn.tooMany`.
- `POST(req: Request): Promise<Response>`: 200 `{ ok: true }` for every valid address.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/console/sign-in.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// The console's sign-in route answers the same for every address and never says whether it belongs to a member.
// Plan 2c adds sending, for members only, behind this same answer.

let route: typeof import("@/app/console/api/sign-in/route");

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://admin.localhost:4210/api/sign-in", {
    method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", "x-forwarded-for": "198.51.100.7", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  vi.resetModules();
  route = await import("@/app/console/api/sign-in/route");
});

describe("POST /api/sign-in on the console", () => {
  it("answers the same for any valid address", async () => {
    for (const email of ["asha@example.com", "nobody@example.org"]) {
      const response = await route.POST(post({ email }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    }
  });

  it("refuses an address that isn't one, with the drawn wording", async () => {
    const response = await route.POST(post({ email: "asha@example" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_INPUT", message: "Enter an email address like name@example.com." });
  });

  it("refuses requests from another site", async () => {
    const response = await route.POST(post({ email: "asha@example.com" }, { "sec-fetch-site": "same-site" }));
    expect(response.status).toBe(403);
  });

  it("limits one address to 5 requests in 10 minutes", async () => {
    for (let i = 0; i < 5; i++) expect((await route.POST(post({ email: "asha@example.com" }))).status).toBe(200);
    const sixth = await route.POST(post({ email: "Asha@Example.com" }));
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toMatchObject({ code: "RATE_LIMITED", message: "Too many sign-in requests. Try again in 10 minutes." });
  });

  it("limits one connection to 20 requests in 10 minutes", async () => {
    for (let i = 0; i < 20; i++) expect((await route.POST(post({ email: `a${i}@example.com` }))).status).toBe(200);
    expect((await route.POST(post({ email: "b@example.com" }))).status).toBe(429);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
npx vitest run tests/integration/console/sign-in.test.ts
```

Expected: FAIL. The route module doesn't exist.

- [ ] **Step 3: Implement**

```ts
// src/console/same-origin.ts
import { AppError } from "@/services/errors";

/**
 * Console route handlers accept requests only from console pages.
 * - Browsers mark those `Sec-Fetch-Site: same-origin`. trakline.in is same-site with the console but not
 *   same-origin, so its pages are refused.
 * - A request without that header must carry an Origin matching the host.
 */
export function assertSameOrigin(req: Request): void {
  const site = req.headers.get("sec-fetch-site");
  if (site === "same-origin") return;
  if (site === null) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("host") ?? new URL(req.url).host;
    try {
      if (origin && new URL(origin).host === host) return;
    } catch {
      // An unreadable Origin is refused below.
    }
  }
  throw new AppError("INVALID_INPUT", "Cross-site requests are refused.", { status: 403 });
}
```

```ts
// src/console/sign-in-limits.ts
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";
import { addressKey, type RateLimiter } from "@/services/rate-limit";
import { createRateLimiter } from "@/services/shared-store";

// Console sign-in links are few and precious: 5 per address and 20 per connection in any 10 minutes, so
// "Try again in 10 minutes" is always true. Shared across instances when the store is configured; the store
// sees only hashed keys.
export const CONSOLE_SIGN_IN_LIMITS = {
  perAddress: { limit: 5, windowMs: 600_000 },
  perConnection: { limit: 20, windowMs: 600_000 },
} as const;

let shared: RateLimiter | null = null;

export async function assertSignInAllowed(email: string, ip: string, limiter: RateLimiter = (shared ??= createRateLimiter())): Promise<void> {
  const { perAddress, perConnection } = CONSOLE_SIGN_IN_LIMITS;
  const connection = await limiter.check(`console-sign-in:ip:${addressKey(ip)}`, perConnection.limit, perConnection.windowMs);
  const address = connection.ok ? await limiter.check(`console-sign-in:email:${email}`, perAddress.limit, perAddress.windowMs) : connection;
  if (!address.ok) {
    throw new AppError("RATE_LIMITED", consoleMessages.signIn.tooMany, { retryAfter: address.retryAfterSeconds });
  }
}
```

```ts
// src/app/console/api/sign-in/route.ts
import { z } from "zod";
import { consoleMessages } from "@/console/messages";
import { assertSameOrigin } from "@/console/same-origin";
import { assertSignInAllowed } from "@/console/sign-in-limits";
import { jsonError, jsonOk } from "@/services/api-response";
import { clientIp } from "@/services/rate-limit";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

const body = z.object({ email: z.email({ error: consoleMessages.signIn.invalid }).max(254) }).strict();

/**
 * Console sign-in (Form TC-02). One answer for every address: nothing here says whether it belongs to a member.
 * Sending a link to members arrives in plan 2c, behind this same answer.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
    const { email } = await readBody(req, body);
    await assertSignInAllowed(email.toLowerCase(), clientIp(null, req.headers.get("x-forwarded-for")));
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
```

If `z.email({ error })` isn't the zod 4 spelling this repo uses, match `src/types/schemas.ts`, keeping the drawn message.

- [ ] **Step 4: Run it again.** Same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/console/same-origin.ts src/console/sign-in-limits.ts src/app/console/api tests/integration/console
git commit -m "feat(console): the sign-in route answers the same for every address"
```

---

### Task 9: Console Sign In, the email states

**Files:**
- Create: `src/app/console/login/page.tsx`, `src/app/console/login/sign-in-form.tsx`
- Test: `tests/unit/console/sign-in-form.test.tsx`

**Interfaces:** consumes `POST /api/sign-in` (Task 8), `consoleMessages.signIn` (Task 6) and `SignedOutFrame` (Task 7).

Transcribe from `ConsoleSignIn.dc.html`, states Email, Email invalid, Sending, Sent and Too many. `industry.css` → app classes:

| Drawing | App |
|---|---|
| `.plate` + `.tb` | `blueprint`, `<Corners/>`, `<PlateHeader cells="tight" meta={["Form TC-02"]} />` |
| `.sweep` at the top of the plate | `<SweepBar />` before the header |
| `.label` / `.well` / `.alert` | `FieldLabel` / `Input` / `FieldError` |
| `.btn-primary.btn-block` (`.btn-lg` on phones) | `Button variant="primary" fullWidth` plus `max-sm:h-11` |
| `.hint` | `text-label text-ink-3` |
| `.state-title` / `.state-detail` | `h2.text-3xl.tracking-head` / `p.text-body.text-ink-2` |
| `.ph-title` / `.ph-lead` | `h1.optical-hang.text-5xl.tracking-display` / `p.text-base.text-ink-2` |

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/console/sign-in-form.test.tsx
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { SignInForm } = await import("@/app/console/login/sign-in-form");

function answer(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

function submit(email: string) {
  fireEvent.change(screen.getByLabelText("Console email"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
}

beforeEach(() => vi.useRealTimers());
afterEach(() => vi.unstubAllGlobals());

describe("Console Sign In", () => {
  it("opens on the email state, as drawn", () => {
    render(<SignInForm />);
    expect(screen.getByLabelText("Console email")).toHaveAttribute("placeholder", "name@example.com");
    expect(screen.getByText("The link works once and expires in 1 hour.")).toBeInTheDocument();
    expect(screen.getByText("Form TC-02")).toBeInTheDocument();
  });

  it("refuses a malformed address before asking the server", async () => {
    const fetch = answer(200, { ok: true });
    vi.stubGlobal("fetch", fetch);
    render(<SignInForm />);
    submit("asha@example");
    expect(await screen.findByText("Enter an email address like name@example.com.")).toBeInTheDocument();
    expect(screen.getByLabelText("Console email")).toHaveAttribute("aria-invalid", "true");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("says the same thing for every address once sent, and counts down to Send it again", async () => {
    vi.stubGlobal("fetch", answer(200, { ok: true }));
    render(<SignInForm />);
    submit("asha@example.com");
    expect(await screen.findByRole("heading", { name: "Check your inbox" })).toHaveFocus();
    expect(screen.getByText("If this address belongs to a console member, a sign-in link is on its way.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send again in \d+ s/ })).toBeDisabled();
  });

  it("goes back to the email state with Use a different email", async () => {
    vi.stubGlobal("fetch", answer(200, { ok: true }));
    render(<SignInForm />);
    submit("asha@example.com");
    fireEvent.click(await screen.findByRole("button", { name: "Use a different email" }));
    await waitFor(() => expect(screen.getByLabelText("Console email")).toHaveFocus());
  });

  it("shows too many and disables sending", async () => {
    vi.stubGlobal("fetch", answer(429, { ok: false, code: "RATE_LIMITED", message: "Too many sign-in requests. Try again in 10 minutes.", retryAfter: 540 }));
    render(<SignInForm />);
    submit("asha@example.com");
    expect(await screen.findByText("Too many sign-in requests. Try again in 10 minutes.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeDisabled();
  });

  it("shows Sending… while the request is out", async () => {
    let release: (value: Response) => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => (release = resolve))));
    render(<SignInForm />);
    submit("asha@example.com");
    expect(await screen.findByRole("button", { name: "Sending…" })).toBeDisabled();
    await act(async () => release(new Response(JSON.stringify({ ok: true }), { status: 200 })));
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
npx vitest run tests/unit/console/sign-in-form.test.tsx
```

Expected: FAIL. The module doesn't exist.

- [ ] **Step 3: Implement the form**

```tsx
// src/app/console/login/sign-in-form.tsx
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { Corners } from "@/components/ui/corners";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PlateHeader } from "@/components/ui/plate";
import { SweepBar } from "@/components/ui/sweep-bar";
import { consoleMessages } from "@/console/messages";
import { apiRequest } from "@/services/api-client";

const m = consoleMessages.signIn;
const RESEND_AFTER_SECONDS = 60;
const EMAIL = z.email();
const SENT = z.object({ ok: z.literal(true) });

type Stage =
  | { readonly kind: "email"; readonly error: string | null; readonly blocked: boolean }
  | { readonly kind: "sending" }
  | { readonly kind: "sent"; readonly wait: number };

/** Console Sign In (Form TC-02): the email states. The key step arrives with sessions (plan 2c). */
export function SignInForm() {
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "email", error: null, blocked: false });
  const emailRef = useRef<HTMLInputElement>(null);
  const sentRef = useRef<HTMLHeadingElement>(null);

  // One tick a second while "Send again in N s" counts down.
  useEffect(() => {
    if (stage.kind !== "sent" || stage.wait === 0) return;
    const timer = window.setTimeout(() => setStage({ kind: "sent", wait: stage.wait - 1 }), 1000);
    return () => window.clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    if (stage.kind === "sent" && stage.wait === RESEND_AFTER_SECONDS) sentRef.current?.focus();
  }, [stage]);

  async function send(address: string): Promise<void> {
    setStage({ kind: "sending" });
    const result = await apiRequest("/api/sign-in", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: address }) }, SENT);
    if (result.ok) {
      setStage({ kind: "sent", wait: RESEND_AFTER_SECONDS });
      return;
    }
    setStage({ kind: "email", error: result.error.message, blocked: result.error.code === "RATE_LIMITED" });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const address = email.trim();
    if (!EMAIL.safeParse(address).success) {
      setStage({ kind: "email", error: m.invalid, blocked: false });
      return;
    }
    void send(address);
  }

  function differentEmail(): void {
    setStage({ kind: "email", error: null, blocked: false });
    window.setTimeout(() => emailRef.current?.focus(), 0);
  }

  const sending = stage.kind === "sending";
  return (
    <section className="blueprint" aria-labelledby="console-sign-in-plate">
      <Corners />
      {sending ? <SweepBar /> : null}
      <PlateHeader title={m.plate} titleId="console-sign-in-plate" cells="tight" meta={[m.form]} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:p-6">
        {stage.kind === "sent" ? (
          <>
            <h2 ref={sentRef} tabIndex={-1} className="text-3xl tracking-head outline-none">
              {m.sent.title}
            </h2>
            <p className="text-body text-ink-2">{m.sent.detail}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" className="max-sm:h-11" disabled={stage.wait > 0} onClick={() => void send(email.trim())}>
                {stage.wait > 0 ? m.sent.againIn(stage.wait) : m.sent.again}
              </Button>
              <Button variant="ghost" className="max-sm:h-11" onClick={differentEmail}>
                {m.sent.different}
              </Button>
            </div>
          </>
        ) : (
          <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field invalid={stage.kind === "email" && stage.error !== null}>
              <FieldLabel>{m.emailLabel}</FieldLabel>
              <Input
                ref={emailRef}
                type="email"
                autoComplete="email"
                placeholder={m.emailPlaceholder}
                value={email}
                disabled={sending}
                onChange={(event) => setEmail(event.currentTarget.value)}
                size="sm"
                className="max-sm:h-11 max-sm:text-base"
              />
              {stage.kind === "email" && stage.error ? <FieldError match>{stage.error}</FieldError> : null}
            </Field>
            <Button type="submit" variant="primary" fullWidth className="max-sm:h-11" disabled={sending || (stage.kind === "email" && stage.blocked)}>
              {sending ? m.sending : m.send}
            </Button>
            <p className="text-label text-ink-3">{m.legend}</p>
          </form>
        )}
      </div>
    </section>
  );
}
```

Notes for the implementer:
- `FieldError match` forces Base UI's error to show for a server-given message; check `@base-ui/react/field` Error props, whose `match` accepts `true`. If Base UI renders the error only on its own validity, render `<p role="alert" className="text-label font-medium text-ink-alert">` instead, and set `aria-invalid` and `aria-describedby` on the input yourself. The test asserts `aria-invalid="true"`.
- `Input` forwards `ref` to the control (Base UI `Field.Control`). If it doesn't, add `forwardRef` to `src/components/ui/input.tsx`.
- If the app's `.well` (`src/styles/utilities.css`) already sets 16px text below `sm`, drop `max-sm:text-base`.

- [ ] **Step 4: Implement the page**

```tsx
// src/app/console/login/page.tsx
import type { Metadata } from "next";
import { Mark } from "@/components/brand/mark";
import { SignedOutFrame } from "@/console/components/signed-out-frame";
import { consoleMessages } from "@/console/messages";
import { SignInForm } from "./sign-in-form";

const m = consoleMessages.signIn;

export const metadata: Metadata = { title: m.pageTitle };

export default function ConsoleSignInPage() {
  return (
    <SignedOutFrame>
      <span className="inline-flex">
        <Mark size={40} />
      </span>
      <h1 className="optical-hang mt-6 text-5xl tracking-display">{m.title}</h1>
      <p className="mt-3.5 text-base text-ink-2">{m.lead}</p>
      <div className="mt-8">
        <SignInForm />
      </div>
    </SignedOutFrame>
  );
}
```

- [ ] **Step 5: Run it again, then check the whole unit suite**

```bash
npx vitest run tests/unit/console/sign-in-form.test.tsx && npm run test:unit
```

Expected: PASS, including `tokens.contract.test.ts`. If the contract test rejects a class, replace it with an allowed step or token rather than an exemption.

- [ ] **Step 6: Look at it.**
  1. Start `npm run dev -- --port 4210` through the preview tool (`.claude/launch.json` "dev" is on 4210; blank the Supabase variables as Playwright does, or expect the local-database message).
  2. Open `http://admin.localhost:4210/login` at 1440 and 390, Day and Night.
  3. Compare it with `ConsoleSignIn.dc.html` (states Email, Email invalid, Sending, Sent, Too many). Spacing, sizes and copy must match the drawing.

- [ ] **Step 7: Commit**

```bash
git add src/app/console/login tests/unit/console/sign-in-form.test.tsx
git commit -m "feat(console): Console Sign In, email states, as drawn"
```

---

### Task 10: End-to-end on the console host

**Files:**
- Modify: `playwright.config.ts` (console projects, and ignore console specs in the traveller projects)
- Create:
  - `tests/e2e/console/host.spec.ts`, `tests/e2e/console/sign-in.spec.ts`
  - `tests/e2e/console/scans.spec.ts` (axe, CSP, phone widths)
  - `tests/e2e/layout.ts`: `layoutBreaks` moved out of `responsive.spec.ts`
- Modify: `tests/e2e/responsive.spec.ts`, to import `layoutBreaks` from `./layout`

- [ ] **Step 1: Share the layout check.** Move the `layoutBreaks(page)` function from `tests/e2e/responsive.spec.ts` into `tests/e2e/layout.ts` as `export async function layoutBreaks(page: Page): Promise<string[]>`, word for word, and import it back in `responsive.spec.ts`. Run `npx playwright test tests/e2e/responsive.spec.ts --list` to confirm the traveller specs are still listed.

- [ ] **Step 2: Add the console projects.** In `playwright.config.ts`:
  - Add `testIgnore: /console\//` to the `desktop` and `mobile` projects.
  - Append the following to `projects`, only when `!remote`:

```ts
    // The console host, served by the same dev server: Chromium resolves *.localhost to this machine.
    ...(remote
      ? []
      : [
          { name: "console-desktop", testMatch: /console\/.*\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, baseURL: `http://admin.localhost:${PORT}` } },
          { name: "console-mobile", testMatch: /console\/.*\.spec\.ts/, use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: `http://admin.localhost:${PORT}` } },
        ]),
```

- [ ] **Step 3: Write the specs**

```ts
// tests/e2e/console/host.spec.ts
import { expect, test } from "../fixtures";

// One app, two hosts: the console lives only on its host, under its own policy.
test("the console host serves sign in with a nonce policy and no indexing", async ({ page }) => {
  const response = await page.goto("/login");
  expect(response?.status()).toBe(200);
  const policy = response?.headers()["content-security-policy"] ?? "";
  const scripts = policy.split("; ").find((d) => d.startsWith("script-src ")) ?? "";
  expect(scripts).toMatch(/'nonce-[^']+'/);
  expect(scripts).toContain("'strict-dynamic'");
  expect(scripts).not.toContain("'unsafe-inline'");
  expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
});

test("every console response carries a fresh nonce", async ({ request }) => {
  const nonce = async () => /'nonce-([^']+)'/.exec((await request.get("/login")).headers()["content-security-policy"] ?? "")?.[1];
  expect(await nonce()).not.toBe(await nonce());
});

test("the console's home and unknown addresses go to sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/pnr");
  await expect(page).toHaveURL(/\/login$/);
});

test("robots are shut out of the console", async ({ request }) => {
  expect(await (await request.get("/robots.txt")).text()).toBe("User-agent: *\nDisallow: /\n");
});

test("the traveller host has no console, and the console has one address per page", async ({ request }) => {
  expect((await request.get("http://localhost:4210/console/login")).status()).toBe(404);
  expect((await request.get("/console/login")).status()).toBe(404);
});
```

```ts
// tests/e2e/console/sign-in.spec.ts
import { expect, test } from "../fixtures";
import { gotoReady } from "../helpers";

// Addresses are unique per test and attempt: the limits last 10 minutes on the shared dev server.
const address = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

test("sends and answers the same for every address", async ({ page }) => {
  await gotoReady(page, "/login");
  await expect(page.getByRole("heading", { level: 1, name: "Console sign in" })).toBeVisible();
  await page.getByLabel("Console email").fill(address("asha"));
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeFocused();
  await expect(page.getByText("If this address belongs to a console member, a sign-in link is on its way.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Send again in \d+ s/ })).toBeDisabled();
  await page.getByRole("button", { name: "Use a different email" }).click();
  await expect(page.getByLabel("Console email")).toBeFocused();
});

test("refuses a malformed address in place", async ({ page }) => {
  await gotoReady(page, "/login");
  await page.getByLabel("Console email").fill("asha@example");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Enter an email address like name@example.com.")).toBeVisible();
});

test("says too many after five requests for one address", async ({ page }) => {
  const email = address("limit");
  for (let i = 0; i < 5; i++) {
    const response = await page.request.post("/api/sign-in", { data: { email }, headers: { "sec-fetch-site": "same-origin" } });
    expect(response.status()).toBe(200);
  }
  await gotoReady(page, "/login");
  await page.getByLabel("Console email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Too many sign-in requests. Try again in 10 minutes.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeDisabled();
});
```

```ts
// tests/e2e/console/scans.spec.ts
import { expect, test } from "../fixtures";
import { expectAxeClean, gotoReady } from "../helpers";
import { layoutBreaks } from "../layout";

declare global {
  interface Window {
    __cspViolations: string[];
  }
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`${theme} face`, () => {
    test.use({ colorScheme: theme });

    test("console sign in has no material axe findings", async ({ page }) => {
      await page.addInitScript((t) => window.localStorage.setItem("tt.theme", t), theme);
      await gotoReady(page, "/login");
      await expectAxeClean(page);
    });

    test("console sign in breaks no rule of its policy, the theme button included", async ({ page }) => {
      await page.addInitScript((t) => {
        window.localStorage.setItem("tt.theme", t);
        window.__cspViolations = [];
        document.addEventListener("securitypolicyviolation", (event) => window.__cspViolations.push(`${event.effectiveDirective} ${event.blockedURI}`));
      }, theme);
      await gotoReady(page, "/login");
      await page.getByRole("button", { name: /^Theme/ }).click();
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
    });
  });
}

test("console sign in fits every phone width", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "console-mobile", "phone widths");
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await gotoReady(page, "/login");
    expect(await layoutBreaks(page), `${width}px`).toEqual([]);
  }
});
```

- [ ] **Step 4: Run them**

```bash
npx playwright test --project=console-desktop --project=console-mobile
```

Expected: PASS. If Chromium isn't installed locally, run only `--list` to check they compile. CI runs them.

Also run the traveller suite, `npx playwright test --project=desktop --project=mobile`. Expected: unchanged.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e
git commit -m "test(e2e): the console host, its sign-in states and its scans"
```

---

### Task 11: Docs, then the PR

**Files:** `docs/architecture.md`, `docs/onboarding.md`

- [ ] **Step 1: Update `docs/architecture.md`**
  - Replace the `proxy` layer line with: `proxy (src/proxy.ts) — one app, two hosts: the console host (admin.trakline.in; admin.localhost locally) is rewritten into src/app/console with a per-request nonce CSP; elsewhere /console answers 404 and Supabase sessions are refreshed on page requests (skips /api and /monitoring)`.
  - Add a line under the layers: `console (src/console/*, src/app/console/*) — the team console: its own root layout, copy and components; traveller code never imports it (tests/unit/console/boundary.contract.test.ts)`.
  - Mention that traveller pages live in `src/app/(site)`.

- [ ] **Step 2: Add to `docs/onboarding.md`.** Add a "Console, locally" paragraph:
  - Open `http://admin.localhost:4210` on the same dev server.
  - The console refuses to run against the hosted Supabase project, and says so. Point `NEXT_PUBLIC_SUPABASE_URL` at a local Supabase, or blank it, to see its pages.

- [ ] **Step 3: Run the full local checks**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run build
```

Expected: all pass.

- [ ] **Step 4: Commit, push and open the PR**

```bash
git add docs
git commit -m "docs: the console host in the architecture and onboarding notes"
git push -u origin feat/console-hosts
gh pr create --base main --title "feat(console): admin host routing, nonce CSP, and Console Sign In's email states" --body-file "$TMPDIR/phase-2a-pr.md"
```

Write the PR body to `$TMPDIR/phase-2a-pr.md` first:
- What changed.
- The traveller-side guarantee: the same URLs, and the same headers on trakline.in.
- The host rules.
- The test plan.
- It ends with "🤖 Generated with [Claude Code](https://claude.com/claude-code)".

Wait for `verify` and `e2e`, then ask the owner before merging.

---

## The later plans in Phase 2 (outline; each is written when its turn comes)

- **2b. Database.**
  - Migrations for the private `console` schema: `members`, `invites`, `setup_links`, `keys`, `sessions`, `challenges`, `settings` and `audit_log`.
  - `public.console_*` member functions and service-role auth functions.
  - The append-only trigger, `purge_audit()` and `create_first_owner_link()`.
  - SQL tests with `supabase test db`.
  - CI: the e2e job starts `npx supabase@2.117.0 start` (unused services excluded) and runs the database tests.
- **2c. Sign-in, setup and keys.**
  - `@simplewebauthn/server` and `@simplewebauthn/browser` 14.
  - `/auth/confirm` and the console session cookie (`sb-console-auth-token`), refreshed in the proxy's console branch.
  - `console.sessions` lifetime (24 h unused, 7 days).
  - `requireConsoleMember()`.
  - Challenges bound to purpose and digest.
  - Setup with every entry: invite, first Owner, keys reset, one key only.
  - The sign-in route sends to members through Resend (`console@trakline.in`), with the outbox under `E2E=1`.
  - The console e2e runs against the local Supabase with Chromium's virtual authenticator, in sequence after the traveller suite.
  - Runbook: `docs/runbooks/console-keys.md`.
- **2d. The signed-in frame and modules.**
  - The rail and drawer, the member box and menu, the notice strip, the page header.
  - Confirm it's you (TC-01) as a dialog and a bottom sheet.
  - My keys, Team (with its dialogs and Security emails), and Audit log with filters, the record drawer and CSV export.
- **2e. Runtime settings and what travellers see.**
  - `src/services/runtime-settings.ts`, and Switches & settings.
  - Paused checks (`reason: "paused"`), and the site notice strip.
  - The public `POST /auth/sign-in` route, which gives one answer and respects closed sign-ups.
  - Passkeys on and off; limits.
  - The "busy" copy; dates read "Sep".
  - The `before_user_created` hook if config push can manage it.
- **2f. Overview and counters.**
  - Per-outcome counters and monthly usage.
  - Service now, Urgent actions (Pause), Checks today, Quota this month and Recent actions.
  - The remaining Security emails.
- **2g. Launch.**
  - `admin.trakline.in` on Vercel and in DNS (the owner), `RESEND_API_KEY` (the owner), and the redirect URLs.
  - The migrations in production (with the owner's OK), the first-Owner link run in the SQL editor, and two keys.
  - A production check against the spec's acceptance list.
