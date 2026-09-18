# Phase 0 · Part B: Shared store implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Vercel instance shares one rate limit per client and one 60-second PNR cache, kept in Upstash Redis (Mumbai). Upstash never sees a PNR, a record, a client address or a user id in the clear.

**Architecture:**

- One module, `src/services/upstash.ts`, imports the Upstash libraries. Everything else depends on three small interfaces (`RedisLike`, `WindowLimiter`, `WindowLimiterFactory`), so tests run on an in-memory fake.
- `shared-store.ts` turns `DATA_KEY` and the Upstash credentials into:
  - an `EncryptedRedisCache` (HMAC-named, AES-256-GCM-sealed)
  - a `SharedRateLimiter` (a sliding window per client HMAC), which falls back to the per-instance memory limiter on timeout or error
- `pnr-query` adds single-flight, so concurrent checks of one PNR on an instance make one provider call.

**Tech stack:** Next 16 route handlers (Node runtime), `@upstash/redis` 1.38.4, `@upstash/ratelimit` 2.1.0, `node:crypto` (HKDF, HMAC, AES-256-GCM), zod 4, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-09-18-phase-0-foundations-design.md`, part B, section 4 (failure behaviour) and section 5 (tests).

## Global Constraints

- The PNR cache is hashed and encrypted.
  - Key: `tt:{env}:pnr:v1:{base64url(HMAC-SHA256(pnr))}`.
  - Value: `v1.{iv}.{ciphertext}.{tag}`, AES-256-GCM, with the Redis key as associated data.
  - TTL 60 s, and only successful records are stored.
  - A decrypt failure, version mismatch or Redis error is a **miss**, never an error, and never shown data.
- `DATA_KEY` is 32 random bytes in base64 (`openssl rand -base64 32`). HKDF-SHA256 derives three subkeys: cache-key HMAC, cache-value encryption, and client hashing. Rotating it empties the cache and resets limit windows.
- Rate limits use a sliding window of 20 checks per 60 s per client (unchanged), with account writes at 60 per 60 s per user.
  - The identifier is an HMAC, never the raw value. An ephemeral cache is on, and analytics are off.
  - Timeout is 1000 ms. On `reason: "timeout"` or any Redis error, the **per-instance memory limiter** applies. Traffic is never unlimited.
- Every key starts `tt:{VERCEL_ENV ?? NODE_ENV}:`, so previews share the database without touching production numbers.
- Redis requests give up after their budget (cache 500 ms, limiter 1000 ms) with no retries. A slow store must not slow a check.
- **Deployed environments** (`VERCEL_ENV` is `production` or `preview`) refuse to boot without the shared store: the Upstash URL and token, plus `DATA_KEY`. A CI or local build has no `VERCEL_ENV`, so it keeps the memory store, and the CI build stays secret-free.
- A store failure is logged at most once a minute per instance and per kind, as the error's name only (never its message, which could carry keys). Sentry arrives in part D.
- TDD (the failing test first). Conventional commits with **no `Co-Authored-By` trailer**. No `any`. Files stay under 500 lines. Path aliases, not deep relative imports.

**Deliberate adjustments to the spec (to tell the user):**

- **Env var names.** The Vercel Upstash integration injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`. They're accepted alongside `UPSTASH_REDIS_REST_*` (the same fallback `Redis.fromEnv()` uses), so no token is ever copied by hand.
- **`RATE_LIMIT_STRATEGY`** gets a new default, `auto`: the shared store when configured, memory otherwise. Deployments then need no extra variable, and turning the store on can't break the running build. `memory` is refused on a deployment, and `upstash` still demands the full configuration.

---

### Task 1: Environment: `DATA_KEY`, `VERCEL_ENV`, the KV names, and the deployment rule

**Files:**
- Modify: `src/services/env.ts`
- Modify: `tests/unit/services/env.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces:
  - `upstashCredentials(env): UpstashCredentials | null`
  - `sharedStoreConfig(env = env()): SharedStoreConfig | null`
  - `interface UpstashCredentials { url: string; token: string }`
  - `interface SharedStoreConfig { credentials: UpstashCredentials; dataKey: string; prefix: string }`, where `prefix` is `tt:<VERCEL_ENV ?? NODE_ENV>`

- [ ] **Step 1: Write the failing tests.** In `tests/unit/services/env.test.ts`:
  - change the import to also take `sharedStoreConfig`
  - change the first test's expectation from `"memory"` to `"auto"`, and rename it "defaults PNR_SOURCE to live and rate limiting to auto"
  - append:

```ts
const DATA_KEY = Buffer.alloc(32, 7).toString("base64");
const KV = { KV_REST_API_URL: "https://fake.upstash.io", KV_REST_API_TOKEN: "fake-token" } as const;

describe("the shared store", () => {
  it("is required on a production deployment", () => {
    const parsed = parseEnv({ NODE_ENV: "production", VERCEL_ENV: "production" });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues.join(" ")).toMatch(/DATA_KEY/);
  });

  it("is required on a preview too", () => {
    expect(parseEnv({ NODE_ENV: "production", VERCEL_ENV: "preview", ...KV }).ok).toBe(false);
  });

  it("accepts the names Vercel's Upstash integration injects, and prefixes keys with the deployment", () => {
    const parsed = parseEnv({ NODE_ENV: "production", VERCEL_ENV: "production", ...KV, DATA_KEY });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(sharedStoreConfig(parsed.env)).toEqual({
      credentials: { url: "https://fake.upstash.io", token: "fake-token" },
      dataKey: DATA_KEY,
      prefix: "tt:production",
    });
  });

  it("prefers the UPSTASH_ names when both pairs are present", () => {
    const parsed = parseEnv({ ...dev, ...KV, UPSTASH_REDIS_REST_URL: "https://direct.upstash.io", UPSTASH_REDIS_REST_TOKEN: "direct", DATA_KEY });
    if (!parsed.ok) throw new Error(parsed.issues.join());
    expect(sharedStoreConfig(parsed.env)?.credentials.url).toBe("https://direct.upstash.io");
  });

  it("refuses the memory strategy on a deployment", () => {
    expect(parseEnv({ NODE_ENV: "production", VERCEL_ENV: "production", ...KV, DATA_KEY, RATE_LIMIT_STRATEGY: "memory" }).ok).toBe(false);
  });

  it("stays off, and optional, for a CI or local build", () => {
    const parsed = parseEnv({ NODE_ENV: "production" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(sharedStoreConfig(parsed.env)).toBeNull();
  });

  it("stays off without DATA_KEY, even with credentials", () => {
    const parsed = parseEnv({ ...dev, ...KV });
    if (!parsed.ok) throw new Error(parsed.issues.join());
    expect(sharedStoreConfig(parsed.env)).toBeNull();
  });

  it("insists on 32 bytes of base64 for DATA_KEY", () => {
    expect(parseEnv({ ...dev, DATA_KEY: "too-short" }).ok).toBe(false);
    expect(parseEnv({ ...dev, DATA_KEY: Buffer.alloc(16).toString("base64") }).ok).toBe(false);
  });

  it("makes the explicit upstash strategy demand DATA_KEY", () => {
    expect(parseEnv({ ...dev, ...KV, RATE_LIMIT_STRATEGY: "upstash" }).ok).toBe(false);
    expect(parseEnv({ ...dev, ...KV, RATE_LIMIT_STRATEGY: "upstash", DATA_KEY }).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run and watch them fail.** Run `npx vitest run tests/unit/services/env.test.ts`. Expected: FAIL (`sharedStoreConfig` is not exported, the default is still `memory`, and there are no deployment rules).

- [ ] **Step 3: Implement** in `src/services/env.ts`:
  - Replace the `RATE_LIMIT_STRATEGY` line with `RATE_LIMIT_STRATEGY: z.enum(["auto", "memory", "upstash"]).default("auto"),`.
  - After `UPSTASH_REDIS_REST_TOKEN`, add:

```ts
    /** The names Vercel's Upstash integration injects; read when the UPSTASH_ pair is absent. */
    KV_REST_API_URL: z.url().optional(),
    KV_REST_API_TOKEN: z.string().min(1).optional(),
    /** Server only. 32 random bytes, base64: names and seals the shared cache, and hashes client ids. */
    DATA_KEY: z
      .string()
      .regex(/^[A-Za-z0-9+/]{43}=$/, "DATA_KEY must be 32 random bytes in base64 (openssl rand -base64 32).")
      .optional(),
    /** Set by Vercel on every build and function. Absent in CI and local runs. */
    VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
```

  - In `superRefine`, replace the existing `RATE_LIMIT_STRATEGY === "upstash"` rule with:

```ts
    const store = Boolean(upstashCredentials(v) && v.DATA_KEY);
    if (v.RATE_LIMIT_STRATEGY === "upstash" && !store) {
      ctx.addIssue({ code: "custom", path: ["RATE_LIMIT_STRATEGY"], message: "The upstash strategy needs the Upstash URL and token, and DATA_KEY." });
    }
    if ((v.VERCEL_ENV === "production" || v.VERCEL_ENV === "preview") && (!store || v.RATE_LIMIT_STRATEGY === "memory")) {
      ctx.addIssue({
        code: "custom",
        path: ["DATA_KEY"],
        message: "Deployments need the shared store: KV_REST_API_URL and KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_*), and DATA_KEY.",
      });
    }
```

  - Below `fallbackPnrSource`, replacing the two stray blank lines, add:

```ts
export interface UpstashCredentials {
  readonly url: string;
  readonly token: string;
}

type CredentialFields = Pick<Env, "UPSTASH_REDIS_REST_URL" | "UPSTASH_REDIS_REST_TOKEN" | "KV_REST_API_URL" | "KV_REST_API_TOKEN">;

/** The Upstash REST pair: UPSTASH_REDIS_REST_*, else the KV_REST_API_* names Vercel's integration injects. */
export function upstashCredentials(current: CredentialFields): UpstashCredentials | null {
  if (current.UPSTASH_REDIS_REST_URL && current.UPSTASH_REDIS_REST_TOKEN) {
    return { url: current.UPSTASH_REDIS_REST_URL, token: current.UPSTASH_REDIS_REST_TOKEN };
  }
  if (current.KV_REST_API_URL && current.KV_REST_API_TOKEN) {
    return { url: current.KV_REST_API_URL, token: current.KV_REST_API_TOKEN };
  }
  return null;
}

export interface SharedStoreConfig {
  readonly credentials: UpstashCredentials;
  readonly dataKey: string;
  /** Every shared key starts with this, so previews never touch production numbers. */
  readonly prefix: string;
}

/** Where shared limits and the cache live; null keeps both inside this instance. */
export function sharedStoreConfig(current: Env = env()): SharedStoreConfig | null {
  const credentials = upstashCredentials(current);
  if (current.RATE_LIMIT_STRATEGY === "memory" || !credentials || !current.DATA_KEY) return null;
  return { credentials, dataKey: current.DATA_KEY, prefix: `tt:${current.VERCEL_ENV ?? current.NODE_ENV}` };
}
```

  (`upstashCredentials` is a hoisted function declaration, so the schema's `superRefine` can call it. `CredentialFields` only mentions types.)

- [ ] **Step 4: `.env.example`.** Replace the rate-limiting block with:

```bash
# ---- Shared store: rate limits and the PNR cache ----------------------------
# auto (default): Upstash when the URL, token and DATA_KEY are all set, memory otherwise.
# Deployments (VERCEL_ENV production/preview) refuse to boot without the shared store.
RATE_LIMIT_STRATEGY=auto
# Vercel's Upstash integration injects KV_REST_API_URL / KV_REST_API_TOKEN; either pair works.
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
# Server only. 32 random bytes: openssl rand -base64 32. Rotating it empties the cache.
DATA_KEY=
```

- [ ] **Step 5: Run and watch it pass.** Run `npx vitest run tests/unit/services/env.test.ts tests/unit/services/rate-limit.test.ts`. Expected: env passes. rate-limit's "uses memory unless…" still passes, because a pair without `DATA_KEY` means memory. Task 5 rewrites that test's upstash half.

- [ ] **Step 6: Commit.** `git commit -m "feat(env): DATA_KEY, the Vercel KV names, and a shared store required on deployments"`

### Task 2: Data key derivation and the cache cipher

**Files:**
- Create: `src/services/data-key.ts`, `src/services/cache-cipher.ts`
- Test: `tests/unit/services/data-key.test.ts`, `tests/unit/services/cache-cipher.test.ts`

**Interfaces:**
- Produces:
  - `deriveDataKeys(dataKey: string): DataKeys`, where `DataKeys` is `{ cacheName: Buffer; cacheValue: Buffer; clientId: Buffer }`
  - `keyedHash(key: Buffer, value: string): string` (base64url)
  - `seal(key: Buffer, aad: string, plaintext: string): string`
  - `open(key: Buffer, aad: string, sealed: string): string | null`

- [ ] **Step 1: Failing tests**

`tests/unit/services/data-key.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deriveDataKeys, keyedHash } from "@/services/data-key";

const DATA_KEY = Buffer.alloc(32, 7).toString("base64");

describe("deriveDataKeys", () => {
  it("derives three distinct 32-byte subkeys, the same every time", () => {
    const keys = deriveDataKeys(DATA_KEY);
    const all = [keys.cacheName, keys.cacheValue, keys.clientId];
    for (const key of all) expect(key.length).toBe(32);
    expect(new Set(all.map((k) => k.toString("hex"))).size).toBe(3);
    expect(deriveDataKeys(DATA_KEY).cacheName.equals(keys.cacheName)).toBe(true);
  });

  it("changes every subkey when DATA_KEY rotates", () => {
    const a = deriveDataKeys(DATA_KEY);
    const b = deriveDataKeys(Buffer.alloc(32, 8).toString("base64"));
    expect(a.cacheName.equals(b.cacheName) || a.cacheValue.equals(b.cacheValue) || a.clientId.equals(b.clientId)).toBe(false);
  });

  it("refuses a key that is not 32 bytes", () => {
    expect(() => deriveDataKeys(Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
  });
});

describe("keyedHash", () => {
  it("is stable, url-safe, and hides its input", () => {
    const { clientId } = deriveDataKeys(DATA_KEY);
    const hash = keyedHash(clientId, "pnr:203.0.113.10");
    expect(hash).toBe(keyedHash(clientId, "pnr:203.0.113.10"));
    expect(hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).not.toContain("203.0.113.10");
  });

  it("differs per key", () => {
    const { cacheName, clientId } = deriveDataKeys(DATA_KEY);
    expect(keyedHash(cacheName, "2345678901")).not.toBe(keyedHash(clientId, "2345678901"));
  });
});
```

`tests/unit/services/cache-cipher.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { open, seal } from "@/services/cache-cipher";

const KEY = Buffer.alloc(32, 1);
const OTHER = Buffer.alloc(32, 2);
const AAD = "tt:test:pnr:v1:abc";
const TEXT = JSON.stringify({ ok: true, pnr: "2345678901" });

describe("seal and open", () => {
  it("round-trips, and the sealed form hides the plaintext", () => {
    const sealed = seal(KEY, AAD, TEXT);
    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(sealed).not.toContain("2345678901");
    expect(open(KEY, AAD, sealed)).toBe(TEXT);
  });

  it("uses a fresh nonce every time", () => {
    expect(seal(KEY, AAD, TEXT)).not.toBe(seal(KEY, AAD, TEXT));
  });

  it("refuses the wrong key, a value moved to another key, and any tampering", () => {
    const sealed = seal(KEY, AAD, TEXT);
    const [v, iv, body, tag] = sealed.split(".");
    const flipped = `${body.slice(0, -2)}${body.at(-2) === "A" ? "B" : "A"}${body.at(-1)}`;
    expect(open(OTHER, AAD, sealed)).toBeNull();
    expect(open(KEY, "tt:test:pnr:v1:other", sealed)).toBeNull();
    expect(open(KEY, AAD, [v, iv, flipped, tag].join("."))).toBeNull();
    expect(open(KEY, AAD, [v, iv, body, tag.slice(0, 8)].join("."))).toBeNull();
  });

  it("refuses another version or a malformed value", () => {
    const sealed = seal(KEY, AAD, TEXT);
    expect(open(KEY, AAD, sealed.replace(/^v1\./, "v2."))).toBeNull();
    expect(open(KEY, AAD, "v1.only-two")).toBeNull();
    expect(open(KEY, AAD, `${sealed}.extra`)).toBeNull();
    expect(open(KEY, AAD, "")).toBeNull();
  });
});
```

- [ ] **Step 2: Run and watch them fail.** Run `npx vitest run tests/unit/services/data-key.test.ts tests/unit/services/cache-cipher.test.ts`. Expected: FAIL (the modules are missing).

- [ ] **Step 3: Implement**

`src/services/data-key.ts`:

```ts
import { createHmac, hkdfSync } from "node:crypto";

// DATA_KEY → three independent 32-byte subkeys (HKDF-SHA256). Rotating DATA_KEY
// empties the shared cache and resets limit windows; nothing else depends on it.

export interface DataKeys {
  /** HMAC key that turns a PNR into its cache key. */
  readonly cacheName: Buffer;
  /** AES-256-GCM key for cached values. */
  readonly cacheValue: Buffer;
  /** HMAC key that turns a client address or user id into a limiter identifier. */
  readonly clientId: Buffer;
}

const SALT = "trakline/data-key/v1";

function subkey(ikm: Buffer, info: string): Buffer {
  return Buffer.from(hkdfSync("sha256", ikm, SALT, info, 32));
}

export function deriveDataKeys(dataKey: string): DataKeys {
  const ikm = Buffer.from(dataKey, "base64");
  if (ikm.length !== 32) throw new Error("DATA_KEY must decode to 32 bytes.");
  return { cacheName: subkey(ikm, "cache-name"), cacheValue: subkey(ikm, "cache-value"), clientId: subkey(ikm, "client-id") };
}

/** base64url(HMAC-SHA256(key, value)): stable, one-way, and useless without DATA_KEY. */
export function keyedHash(key: Buffer, value: string): string {
  return createHmac("sha256", key).update(value).digest("base64url");
}
```

`src/services/cache-cipher.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Cached values are sealed with AES-256-GCM. The Redis key is the associated data,
// so a value copied under another key fails to open. Anything that fails to open is a miss.

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function seal(key: Buffer, aad: string, plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), body.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}

export function open(key: Buffer, aad: string, sealed: string): string | null {
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  const [, ivText, bodyText, tagText] = parts;
  const iv = Buffer.from(ivText, "base64url");
  const tag = Buffer.from(tagText, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || bodyText.length === 0) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(bodyText, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run and watch them pass** (the same command). Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(store): data key derivation and sealed cache values"`

### Task 3: The Upstash adapter and the test fake

**Files:**
- Modify: `package.json` and `package-lock.json` (`npm install @upstash/redis@1.38.4 @upstash/ratelimit@2.1.0 --save-exact`)
- Create: `src/services/upstash.ts`, `tests/support/fake-upstash.ts`
- Test: `tests/unit/services/upstash.test.ts`

**Interfaces:**
- Produces (in `@/services/upstash`):
  - `interface RedisLike { get(key: string): Promise<unknown>; set(key: string, value: string, options: { px: number }): Promise<unknown>; del(key: string): Promise<unknown> }`
  - `interface WindowVerdict { success: boolean; remaining: number; reset: number; reason?: string }`
  - `interface WindowLimiter { limit(identifier: string): Promise<WindowVerdict> }`
  - `type WindowLimiterFactory = (limit: number, windowMs: number) => WindowLimiter`
  - `connectRedis(credentials: UpstashCredentials, timeoutMs: number): RedisLike`
  - `upstashWindows(redis: RedisLike, prefix: string, timeoutMs: number): WindowLimiterFactory`
- Produces (in `tests/support/fake-upstash.ts`): `createFakeUpstash(): FakeUpstash`, with `redis`, `windows`, `dump()`, `entries()`, `put(key, value)`, `fail(on)`, `tick(ms)` and `reset()`.

- [ ] **Step 1: Install**: `npm install @upstash/redis@1.38.4 @upstash/ratelimit@2.1.0 --save-exact`.
- [ ] **Step 2: Failing test**, `tests/unit/services/upstash.test.ts` (shape only, no network):

```ts
import { describe, expect, it } from "vitest";
import { connectRedis, upstashWindows } from "@/services/upstash";

const credentials = { url: "https://fake.upstash.io", token: "fake-token" };

describe("the Upstash adapter", () => {
  it("builds a REST client without touching the network", () => {
    const redis = connectRedis(credentials, 500);
    expect(typeof redis.get).toBe("function");
    expect(typeof redis.set).toBe("function");
    expect(typeof redis.del).toBe("function");
  });

  it("builds one sliding-window limiter per limit and window", () => {
    const windows = upstashWindows(connectRedis(credentials, 1000), "tt:test", 1000);
    expect(typeof windows(20, 60_000).limit).toBe("function");
  });
});
```

- [ ] **Step 3: Run and watch it fail**: `npx vitest run tests/unit/services/upstash.test.ts`. Expected: FAIL, module missing.
- [ ] **Step 4: Implement** `src/services/upstash.ts`:

```ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { UpstashCredentials } from "./env";

// The only module that imports Upstash. Everything else depends on these small
// interfaces, so tests run against an in-memory fake (tests/support/fake-upstash.ts).

export interface RedisLike {
  get(key: string): Promise<unknown>;
  set(key: string, value: string, options: { readonly px: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

export interface WindowVerdict {
  readonly success: boolean;
  readonly remaining: number;
  /** Unix ms when the window next frees a slot. */
  readonly reset: number;
  /** "timeout" when the store did not answer in time and the request was let through. */
  readonly reason?: string;
}

export interface WindowLimiter {
  limit(identifier: string): Promise<WindowVerdict>;
}

export type WindowLimiterFactory = (limit: number, windowMs: number) => WindowLimiter;

/** A REST client whose every request gives up after `timeoutMs`, with no retries: a slow store must not slow a check. */
export function connectRedis(credentials: UpstashCredentials, timeoutMs: number): Redis {
  return new Redis({
    url: credentials.url,
    token: credentials.token,
    retry: false,
    automaticDeserialization: false,
    signal: () => AbortSignal.timeout(timeoutMs),
  });
}

/** Sliding windows in Upstash, one per (limit, window) pair. Over-limit identifiers are remembered in memory. */
export function upstashWindows(redis: Redis, prefix: string, timeoutMs: number): WindowLimiterFactory {
  return (limit, windowMs) =>
    new Ratelimit({
      redis,
      prefix: `${prefix}:rl:${limit}-${windowMs}`,
      limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
      ephemeralCache: new Map(),
      timeout: timeoutMs,
      analytics: false,
    });
}
```

  (`connectRedis` returns the concrete `Redis`, because `Ratelimit` needs it. `Redis` satisfies `RedisLike` structurally.)

- [ ] **Step 5: Write the fake**, `tests/support/fake-upstash.ts`:

```ts
import type { RedisLike, WindowLimiterFactory, WindowVerdict } from "@/services/upstash";

// An in-memory stand-in for Upstash: shared by every "instance" a test builds,
// with its own clock, an outage switch, and a dump for "never in the clear" checks.

export interface FakeUpstash {
  readonly redis: RedisLike;
  readonly windows: WindowLimiterFactory;
  /** Every key, value and limiter identifier Redis holds, as one string. */
  dump(): string;
  entries(): ReadonlyArray<readonly [string, string]>;
  put(key: string, value: string): void;
  fail(on: boolean): void;
  tick(ms: number): void;
  reset(): void;
}

export function createFakeUpstash(): FakeUpstash {
  const store = new Map<string, { readonly value: string; readonly exp: number }>();
  const hits = new Map<string, readonly number[]>();
  const state = { now: 1_000_000, failing: false };
  const guard = () => {
    if (state.failing) throw new Error("fake outage");
  };

  const redis: RedisLike = {
    async get(key) {
      guard();
      const entry = store.get(key);
      return entry && entry.exp > state.now ? entry.value : null;
    },
    async set(key, value, { px }) {
      guard();
      store.set(key, { value, exp: state.now + px });
      return "OK";
    },
    async del(key) {
      guard();
      return store.delete(key) ? 1 : 0;
    },
  };

  const windows: WindowLimiterFactory = (limit, windowMs) => ({
    async limit(identifier): Promise<WindowVerdict> {
      guard();
      const name = `${limit}-${windowMs}:${identifier}`;
      const recent = (hits.get(name) ?? []).filter((t) => t > state.now - windowMs);
      if (recent.length >= limit) return { success: false, remaining: 0, reset: recent[0] + windowMs };
      hits.set(name, [...recent, state.now]);
      return { success: true, remaining: limit - recent.length - 1, reset: state.now + windowMs };
    },
  });

  return {
    redis,
    windows,
    dump: () => [...[...store].map(([k, v]) => `${k}=${v.value}`), ...hits.keys()].join("\n"),
    entries: () => [...store].map(([k, v]) => [k, v.value] as const),
    put: (key, value) => {
      store.set(key, { value, exp: state.now + 60_000 });
    },
    fail: (on) => {
      state.failing = on;
    },
    tick: (ms) => {
      state.now += ms;
    },
    reset: () => {
      store.clear();
      hits.clear();
      state.now = 1_000_000;
      state.failing = false;
    },
  };
}
```

- [ ] **Step 6: Run and watch it pass**: `npx vitest run tests/unit/services/upstash.test.ts && npm run typecheck`. Expected: PASS. Types confirm `Redis` satisfies `RedisLike`.
- [ ] **Step 7: Commit.** `git commit -m "feat(store): Upstash adapter behind small interfaces, and an in-memory fake"`

### Task 4: The async cache and `EncryptedRedisCache`

**Files:**
- Modify: `src/services/cache.ts`, `tests/unit/services/cache.test.ts`
- Create: `src/services/redis-cache.ts`
- Test: `tests/unit/services/redis-cache.test.ts`

**Interfaces:**
- Consumes: `seal`/`open` (Task 2), `keyedHash`/`DataKeys` (Task 2), `RedisLike` (Task 3), and the fake (Task 3).
- Produces:
  - `interface Cache { get<T>(key): Promise<T | undefined>; set<T>(key, value, ttlMs): Promise<void>; delete(key): Promise<void> }`
  - `class EncryptedRedisCache implements Cache`, constructed with `{ redis: RedisLike; keys: Pick<DataKeys, "cacheName" | "cacheValue">; namespace: string; onError?: (error: unknown) => void }`

- [ ] **Step 1: Failing tests.**
  - In `tests/unit/services/cache.test.ts`, change `cache.delete("k");` to `await cache.delete("k");`, and add:

```ts
  it("answers asynchronously, so a shared store can stand in", async () => {
    const cache = new MemoryCache(() => 0);
    await cache.set("k", 1, 1_000);
    await expect(cache.get("k")).resolves.toBe(1);
  });
```

  - Create `tests/unit/services/redis-cache.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deriveDataKeys } from "@/services/data-key";
import { EncryptedRedisCache } from "@/services/redis-cache";
import { createFakeUpstash } from "../../support/fake-upstash";

const fake = createFakeUpstash();
const keys = deriveDataKeys(Buffer.alloc(32, 7).toString("base64"));
const RECORD = { ok: true, pnr: "2345678901", train: "12951 Mumbai Rajdhani" };

function cache(onError = vi.fn(), k = keys) {
  return new EncryptedRedisCache({ redis: fake.redis, keys: k, namespace: "tt:test:pnr:v1", onError });
}

beforeEach(() => fake.reset());

describe("EncryptedRedisCache", () => {
  it("round-trips a value through Redis", async () => {
    await cache().set("2345678901", RECORD, 60_000);
    await expect(cache().get("2345678901")).resolves.toEqual(RECORD);
  });

  it("stores neither the PNR nor the record in the clear", async () => {
    await cache().set("2345678901", RECORD, 60_000);
    const held = fake.dump();
    expect(held).toMatch(/^tt:test:pnr:v1:[A-Za-z0-9_-]{43}=v1\./);
    expect(held).not.toContain("2345678901");
    expect(held).not.toContain("Rajdhani");
  });

  it("expires with the ttl", async () => {
    await cache().set("2345678901", RECORD, 60_000);
    fake.tick(60_001);
    await expect(cache().get("2345678901")).resolves.toBeUndefined();
  });

  it("misses when a value was moved under another key", async () => {
    await cache().set("2345678901", RECORD, 60_000);
    await cache().set("2345678902", { other: true }, 60_000);
    const [first, second] = fake.entries();
    fake.put(second[0], first[1]);
    await expect(cache().get("2345678902")).resolves.toBeUndefined();
  });

  it("misses after DATA_KEY rotates", async () => {
    await cache().set("2345678901", RECORD, 60_000);
    const rotated = deriveDataKeys(Buffer.alloc(32, 8).toString("base64"));
    await expect(cache(vi.fn(), rotated).get("2345678901")).resolves.toBeUndefined();
  });

  it("misses, never throws, while Redis is down, and reports it", async () => {
    const onError = vi.fn();
    fake.fail(true);
    await expect(cache(onError).get("2345678901")).resolves.toBeUndefined();
    await expect(cache(onError).set("2345678901", RECORD, 60_000)).resolves.toBeUndefined();
    await expect(cache(onError).delete("2345678901")).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(3);
  });

  it("deletes", async () => {
    await cache().set("2345678901", RECORD, 60_000);
    await cache().delete("2345678901");
    await expect(cache().get("2345678901")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run and watch them fail**: `npx vitest run tests/unit/services/cache.test.ts tests/unit/services/redis-cache.test.ts`. Expected: FAIL (`redis-cache` is missing; `get` isn't a promise).
- [ ] **Step 3: Implement.** In `src/services/cache.ts`, make the interface and `MemoryCache` async, and await inside `getOrCompute`:

```ts
export interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
}
```

  - `MemoryCache` gets `async` on `get`, `set` and `delete`, with the bodies unchanged.
  - In `getOrCompute`: `const hit = await cache.get<T>(key);` and `if (cacheable(value)) await cache.set(key, value, ttlMs);`.
  - Update the header comment: "…only successful PNR outcomes, and only for one minute. Async, so the shared Redis cache can stand in."

  Create `src/services/redis-cache.ts`:

```ts
import type { Cache } from "./cache";
import { open, seal } from "./cache-cipher";
import { keyedHash, type DataKeys } from "./data-key";
import type { RedisLike } from "./upstash";

// The shared read-through cache. Redis sees an HMAC of the key and an AES-GCM
// sealed value, never a PNR or a record in the clear. Every failure (unreachable,
// slow, unreadable, tampered, rotated key) is a miss.

export interface RedisCacheOptions {
  readonly redis: RedisLike;
  readonly keys: Pick<DataKeys, "cacheName" | "cacheValue">;
  /** e.g. "tt:production:pnr:v1" */
  readonly namespace: string;
  readonly onError?: (error: unknown) => void;
}

export class EncryptedRedisCache implements Cache {
  constructor(private readonly options: RedisCacheOptions) {}

  private name(key: string): string {
    return `${this.options.namespace}:${keyedHash(this.options.keys.cacheName, key)}`;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const name = this.name(key);
    try {
      const sealed = await this.options.redis.get(name);
      if (typeof sealed !== "string") return undefined;
      const json = open(this.options.keys.cacheValue, name, sealed);
      return json === null ? undefined : (JSON.parse(json) as T);
    } catch (error) {
      this.options.onError?.(error);
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    const name = this.name(key);
    try {
      await this.options.redis.set(name, seal(this.options.keys.cacheValue, name, JSON.stringify(value)), { px: ttlMs });
    } catch (error) {
      this.options.onError?.(error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.options.redis.del(this.name(key));
    } catch (error) {
      this.options.onError?.(error);
    }
  }
}
```

- [ ] **Step 4: Fix the awaits `pnr-query` now needs.** In `src/services/pnr-query.ts`, change `if (options.fresh) deps.cache.delete(key);` to `if (options.fresh) await deps.cache.delete(key);`. Then run `npx vitest run tests/unit/services && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(store): async cache and an encrypted Redis cache that misses on any failure"`

### Task 5: `SharedRateLimiter`, and the shared store that wires everything

**Files:**
- Modify: `src/services/rate-limit.ts` (remove `UpstashRateLimiter` and `createRateLimiter`; add `SharedRateLimiter`)
- Create: `src/services/shared-store.ts`
- Modify: `src/services/write-limit.ts` (import `createRateLimiter` from `./shared-store`)
- Modify: `tests/unit/services/rate-limit.test.ts`
- Test: `tests/unit/services/shared-store.test.ts`

**Interfaces:**
- Consumes:
  - `sharedStoreConfig` (Task 1)
  - `deriveDataKeys` and `keyedHash` (Task 2)
  - `connectRedis`, `upstashWindows`, `WindowLimiterFactory` (Task 3)
  - `EncryptedRedisCache` (Task 4)
- Produces:
  - `class SharedRateLimiter implements RateLimiter`, constructed with `{ windows: WindowLimiterFactory; identify: (key: string) => string; fallback?: RateLimiter; onFallback?: (reason: "timeout" | "error") => void; now?: () => number }`
  - `createRateLimiter(current = env()): RateLimiter`
  - `createPnrCache(current = env()): Cache`

- [ ] **Step 1: Failing tests.** In `tests/unit/services/rate-limit.test.ts`, replace the test "uses memory unless the upstash strategy is selected with credentials" with the block below, and append the `SharedRateLimiter` suite:

```ts
  it("keeps limits in the instance unless the shared store is configured", async () => {
    const { createRateLimiter } = await import("@/services/shared-store");
    const { MemoryRateLimiter, SharedRateLimiter } = await import("@/services/rate-limit");
    const { parseEnv } = await import("@/services/env");
    const DATA_KEY = Buffer.alloc(32, 7).toString("base64");
    const memory = parseEnv({ NODE_ENV: "test", UPSTASH_REDIS_REST_URL: "https://x.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" });
    const shared = parseEnv({ NODE_ENV: "test", UPSTASH_REDIS_REST_URL: "https://x.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t", DATA_KEY });
    if (!memory.ok || !shared.ok) throw new Error("expected valid env");
    expect(createRateLimiter(memory.env)).toBeInstanceOf(MemoryRateLimiter);
    expect(createRateLimiter(shared.env)).toBeInstanceOf(SharedRateLimiter);
  });
```

```ts
describe("SharedRateLimiter", () => {
  const fake = createFakeUpstash();
  const identify = (key: string) => `h(${key.length})`;
  beforeEach(() => fake.reset());

  function limiter(windows = fake.windows, onFallback = vi.fn()) {
    return new SharedRateLimiter({ windows, identify, onFallback, now: () => 1_000_000 });
  }

  it("counts down, then refuses with the time until a slot frees", async () => {
    const shared = limiter();
    const first = await shared.check("pnr:203.0.113.10", 2, 60_000);
    await shared.check("pnr:203.0.113.10", 2, 60_000);
    const third = await shared.check("pnr:203.0.113.10", 2, 60_000);
    expect(first).toEqual({ ok: true, remaining: 1, retryAfterSeconds: 0 });
    expect(third).toEqual({ ok: false, remaining: 0, retryAfterSeconds: 60 });
  });

  it("shows the store only the hashed identifier", async () => {
    await limiter().check("pnr:203.0.113.10", 20, 60_000);
    expect(fake.dump()).not.toContain("203.0.113.10");
  });

  it("keeps separate windows for separate limits", async () => {
    const shared = limiter();
    await shared.check("pnr:a", 1, 60_000);
    expect((await shared.check("write:a", 60, 60_000)).ok).toBe(true);
  });

  it("falls back to this instance's memory when the store times out", async () => {
    const onFallback = vi.fn();
    const slow: WindowLimiterFactory = () => ({ limit: async () => ({ success: true, remaining: 99, reset: 0, reason: "timeout" }) });
    const shared = limiter(slow, onFallback);
    await shared.check("pnr:x", 1, 60_000);
    expect((await shared.check("pnr:x", 1, 60_000)).ok).toBe(false);
    expect(onFallback).toHaveBeenCalledWith("timeout");
  });

  it("falls back to this instance's memory when the store fails", async () => {
    const onFallback = vi.fn();
    fake.fail(true);
    const shared = limiter(fake.windows, onFallback);
    await shared.check("pnr:y", 1, 60_000);
    expect((await shared.check("pnr:y", 1, 60_000)).ok).toBe(false);
    expect(onFallback).toHaveBeenCalledWith("error");
  });
});
```

  (Imports at the top of the file: `beforeEach, vi` from vitest; `SharedRateLimiter` from `@/services/rate-limit`; `type WindowLimiterFactory` from `@/services/upstash`; `createFakeUpstash` from `../../support/fake-upstash`.)

  Create `tests/unit/services/shared-store.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MemoryCache } from "@/services/cache";
import { parseEnv } from "@/services/env";
import { EncryptedRedisCache } from "@/services/redis-cache";
import { createPnrCache } from "@/services/shared-store";

const DATA_KEY = Buffer.alloc(32, 7).toString("base64");

function envOf(source: Record<string, string>) {
  const parsed = parseEnv(source);
  if (!parsed.ok) throw new Error(parsed.issues.join());
  return parsed.env;
}

describe("createPnrCache", () => {
  it("uses this instance's memory without a shared store", () => {
    expect(createPnrCache(envOf({ NODE_ENV: "test" }))).toBeInstanceOf(MemoryCache);
  });

  it("uses the encrypted Redis cache when the shared store is configured", () => {
    const current = envOf({ NODE_ENV: "test", KV_REST_API_URL: "https://x.upstash.io", KV_REST_API_TOKEN: "t", DATA_KEY });
    expect(createPnrCache(current)).toBeInstanceOf(EncryptedRedisCache);
  });

  it("builds one store per environment, shared by the cache and the limiter", () => {
    const current = envOf({ NODE_ENV: "test", KV_REST_API_URL: "https://x.upstash.io", KV_REST_API_TOKEN: "t", DATA_KEY });
    expect(createPnrCache(current)).toBe(createPnrCache(current));
  });
});
```

- [ ] **Step 2: Run and watch them fail**: `npx vitest run tests/unit/services/rate-limit.test.ts tests/unit/services/shared-store.test.ts`. Expected: FAIL (the modules and exports are missing).
- [ ] **Step 3: Implement.** In `src/services/rate-limit.ts`:
  - drop `import { env, type Env }`, `UpstashRateLimiter` and `createRateLimiter`
  - add `import type { WindowLimiter, WindowLimiterFactory } from "./upstash";`
  - add:

```ts
export interface SharedRateLimiterOptions {
  readonly windows: WindowLimiterFactory;
  /** One-way: the store never sees an address or a user id. */
  readonly identify: (key: string) => string;
  /** Applies whenever the store is slow or failing, so traffic stays limited per instance. */
  readonly fallback?: RateLimiter;
  readonly onFallback?: (reason: "timeout" | "error") => void;
  readonly now?: () => number;
}

/** Sliding windows shared by every instance; this instance's memory limiter when the store can't answer. */
export class SharedRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, WindowLimiter>();
  private readonly fallback: RateLimiter;
  private readonly now: () => number;

  constructor(private readonly options: SharedRateLimiterOptions) {
    this.fallback = options.fallback ?? new MemoryRateLimiter();
    this.now = options.now ?? Date.now;
  }

  private window(limit: number, windowMs: number): WindowLimiter {
    const id = `${limit}:${windowMs}`;
    const known = this.windows.get(id);
    if (known) return known;
    const made = this.options.windows(limit, windowMs);
    this.windows.set(id, made);
    return made;
  }

  async check(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    try {
      const verdict = await this.window(limit, windowMs).limit(this.options.identify(key));
      if (verdict.reason === "timeout") {
        this.options.onFallback?.("timeout");
        return this.fallback.check(key, limit, windowMs);
      }
      if (verdict.success) return { ok: true, remaining: verdict.remaining, retryAfterSeconds: 0 };
      return { ok: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((verdict.reset - this.now()) / 1000)) };
    } catch {
      this.options.onFallback?.("error");
      return this.fallback.check(key, limit, windowMs);
    }
  }
}
```

  Create `src/services/shared-store.ts`:

```ts
import { pnrCache, type Cache } from "./cache";
import { deriveDataKeys, keyedHash } from "./data-key";
import { env, sharedStoreConfig, type Env } from "./env";
import { log } from "./log";
import { MemoryRateLimiter, SharedRateLimiter, type RateLimiter } from "./rate-limit";
import { EncryptedRedisCache } from "./redis-cache";
import { connectRedis, upstashWindows } from "./upstash";

// Builds the shared store once per environment: the encrypted PNR cache and the
// shared limiter over one Upstash database. Without it, both stay in this instance.

const CACHE_TIMEOUT_MS = 500;
const LIMITER_TIMEOUT_MS = 1000;
const REPORT_EVERY_MS = 60_000;

interface SharedStore {
  readonly cache: Cache;
  readonly limiter: RateLimiter;
}

const stores = new WeakMap<Env, SharedStore | null>();
const lastReport = new Map<string, number>();

/** At most once a minute per kind, and only the error's name: messages can carry keys. */
function report(kind: string, error?: unknown): void {
  const now = Date.now();
  if ((lastReport.get(kind) ?? -Infinity) > now - REPORT_EVERY_MS) return;
  lastReport.set(kind, now);
  log.warn(`[store] ${kind}: answered from this instance`, error instanceof Error ? error.name : "");
}

function build(current: Env): SharedStore | null {
  const config = sharedStoreConfig(current);
  if (!config) return null;
  const keys = deriveDataKeys(config.dataKey);
  return {
    cache: new EncryptedRedisCache({
      redis: connectRedis(config.credentials, CACHE_TIMEOUT_MS),
      keys,
      namespace: `${config.prefix}:pnr:v1`,
      onError: (error) => report("cache", error),
    }),
    limiter: new SharedRateLimiter({
      windows: upstashWindows(connectRedis(config.credentials, LIMITER_TIMEOUT_MS), config.prefix, LIMITER_TIMEOUT_MS),
      identify: (key) => keyedHash(keys.clientId, key),
      fallback: new MemoryRateLimiter(),
      onFallback: (reason) => report(`limiter ${reason}`),
    }),
  };
}

function store(current: Env): SharedStore | null {
  if (!stores.has(current)) stores.set(current, build(current));
  return stores.get(current) ?? null;
}

export function createRateLimiter(current: Env = env()): RateLimiter {
  return store(current)?.limiter ?? new MemoryRateLimiter();
}

export function createPnrCache(current: Env = env()): Cache {
  return store(current)?.cache ?? pnrCache;
}
```

  - In `src/services/pnr-query.ts`, change the import `{ PNR_RATE_LIMIT, createRateLimiter, type RateLimiter } from "./rate-limit"` to `{ PNR_RATE_LIMIT, type RateLimiter } from "./rate-limit"` plus `import { createPnrCache, createRateLimiter } from "./shared-store";`.
  - In `src/services/write-limit.ts`, import `createRateLimiter` from `./shared-store` and `type RateLimiter` from `./rate-limit`.

- [ ] **Step 4: Run and watch it pass**: `npx vitest run tests/unit/services && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(store): shared sliding-window limits with a per-instance fallback"`

### Task 6: Single-flight, and `pnr-query` on the shared store

**Files:**
- Create: `src/services/single-flight.ts`
- Test: `tests/unit/services/single-flight.test.ts`
- Modify: `src/services/pnr-query.ts`, `tests/unit/services/pnr-query.test.ts`

**Interfaces:**
- Produces: `singleFlight<T>(): (key: string, run: () => Promise<T>) => Promise<T>`, and `PnrQueryDeps.flight`.

- [ ] **Step 1: Failing tests.** Create `tests/unit/services/single-flight.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { singleFlight } from "@/services/single-flight";

function deferred<T>() {
  const box: { resolve: (v: T) => void; reject: (e: unknown) => void } = { resolve: () => {}, reject: () => {} };
  const promise = new Promise<T>((resolve, reject) => Object.assign(box, { resolve, reject }));
  return { promise, ...box };
}

describe("singleFlight", () => {
  it("shares one call between concurrent callers of the same key", async () => {
    const flight = singleFlight<number>();
    const gate = deferred<number>();
    const run = vi.fn(() => gate.promise);
    const both = Promise.all([flight("a", run), flight("a", run)]);
    gate.resolve(7);
    expect(await both).toEqual([7, 7]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("runs separate keys separately", async () => {
    const flight = singleFlight<string>();
    const run = vi.fn(async () => "x");
    await Promise.all([flight("a", run), flight("b", run)]);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("runs again once the previous call settled, even after a failure", async () => {
    const flight = singleFlight<number>();
    await expect(flight("a", async () => Promise.reject(new Error("down")))).rejects.toThrow("down");
    await expect(flight("a", async () => 2)).resolves.toBe(2);
  });
});
```

  In `tests/unit/services/pnr-query.test.ts`, add `import { singleFlight } from "@/services/single-flight";`, add `flight: singleFlight<PnrOutcome>(),` to `deps()` (with `import type { PnrOutcome } from "@/types/domain";`), and append:

```ts
  it("shares one provider call between concurrent checks of one PNR", async () => {
    const d = deps();
    const check = vi.fn((pnr: string) => fixtureSource.check(pnr));
    const source = { ...fixtureSource, check };
    const [a, b] = await Promise.all([
      queryPnr("2345678901", "1.1.1.1", { deps: { ...d, source } }),
      queryPnr("2345678901", "1.1.1.2", { deps: { ...d, source } }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    expect(check).toHaveBeenCalledTimes(1);
  });
```

  (Add `vi` to the vitest import.)

- [ ] **Step 2: Run and watch them fail**: `npx vitest run tests/unit/services/single-flight.test.ts tests/unit/services/pnr-query.test.ts`. Expected: FAIL (module missing; two provider calls).
- [ ] **Step 3: Implement.** Create `src/services/single-flight.ts`:

```ts
/** Concurrent calls with the same key share one in-flight promise; the entry clears when it settles. */
export function singleFlight<T>(): (key: string, run: () => Promise<T>) => Promise<T> {
  const inflight = new Map<string, Promise<T>>();
  return (key, run) => {
    const pending = inflight.get(key);
    if (pending) return pending;
    const started = run().finally(() => inflight.delete(key));
    inflight.set(key, started);
    return started;
  };
}
```

  In `src/services/pnr-query.ts`:
  - add `flight` to `PnrQueryDeps`: `readonly flight: (pnr: string, run: () => Promise<PnrOutcome>) => Promise<PnrOutcome>;` (import `type PnrOutcome` from `@/types/domain`)
  - replace the `sharedLimiter` memo and `defaultDeps` with:

```ts
let shared: Pick<PnrQueryDeps, "limiter" | "cache" | "flight"> | null = null;

function defaultDeps(): PnrQueryDeps {
  shared ??= { limiter: createRateLimiter(), cache: createPnrCache(), flight: singleFlight<PnrOutcome>() };
  return { source: getPnrSource(), ...shared, now: Date.now };
}
```

  - use the bare PNR as the cache key, and fly the provider call:

```ts
  const key = parsed.data;
  if (options.fresh) await deps.cache.delete(key);
  const { value: outcome, cached } = await getOrCompute(
    deps.cache,
    key,
    CACHE_TTLS.snapshot,
    () => deps.flight(parsed.data, () => deps.source.check(parsed.data)),
    (value) => value.ok,
  );
```

  - drop the now-unused `pnrCache` import.

- [ ] **Step 4: Run and watch it pass**: `npx vitest run && npm run typecheck && npm run lint`. Expected: PASS (every suite).
- [ ] **Step 5: Commit.** `git commit -m "feat(pnr): one provider call per PNR per instance, over the shared store"`

### Task 7: Integration: two instances over one fake Upstash

**Files:**
- Test: `tests/integration/api/pnr-shared-store.test.ts`

- [ ] **Step 1: Write the test.** It's written after the implementation, but it must fail if the wiring is broken. Check that by temporarily making `createPnrCache` return `pnrCache` before committing: the first case should fail.

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Two "instances" (fresh module graphs) share one fake Upstash, as Vercel functions share the real one.

const fake = await vi.hoisted(async () => {
  const { createFakeUpstash } = await import("../../support/fake-upstash");
  return createFakeUpstash();
});

vi.mock("@/services/upstash", () => ({
  connectRedis: () => fake.redis,
  upstashWindows: () => fake.windows,
}));

const DATA_KEY = Buffer.alloc(32, 7).toString("base64");
const PNR = "2345678901";
const IP = "203.0.113.10";

async function instance() {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("PNR_SOURCE", "fixture");
  vi.stubEnv("KV_REST_API_URL", "https://fake.upstash.io");
  vi.stubEnv("KV_REST_API_TOKEN", "fake-token");
  vi.stubEnv("DATA_KEY", DATA_KEY);
  const { resetEnvCache } = await import("@/services/env");
  resetEnvCache();
  return import("@/app/api/pnr/route");
}

async function check(route: Awaited<ReturnType<typeof instance>>, ip = IP) {
  const res = await route.POST(
    new NextRequest("http://localhost/api/pnr", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ pnr: PNR }),
    }),
  );
  return { status: res.status, body: (await res.json()) as { ok: boolean; cached?: boolean; code?: string } };
}

beforeEach(() => fake.reset());
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/pnr over the shared store", () => {
  it("answers a second instance from the shared cache", async () => {
    const a = await instance();
    const b = await instance();
    expect((await check(a)).body).toMatchObject({ ok: true, cached: false });
    expect((await check(b)).body).toMatchObject({ ok: true, cached: true });
  });

  it("never hands Upstash a PNR, a record or an address in the clear", async () => {
    await check(await instance());
    const held = fake.dump();
    expect(held).not.toContain(PNR);
    expect(held).not.toContain(IP);
    expect(held).not.toMatch(/"snapshot"|"pax"/);
  });

  it("shares the limit: the 21st check across two instances is refused", async () => {
    const a = await instance();
    const b = await instance();
    for (let i = 0; i < 10; i += 1) await check(a);
    for (let i = 0; i < 10; i += 1) await check(b);
    const refused = await check(a);
    expect(refused.status).toBe(429);
    expect(refused.body.code).toBe("RATE_LIMITED");
  });

  it("keeps answering, and limiting per instance, while Upstash is down", async () => {
    fake.fail(true);
    const a = await instance();
    const first = await check(a);
    expect(first.body).toMatchObject({ ok: true, cached: false });
    for (let i = 0; i < 19; i += 1) await check(a);
    expect((await check(a)).status).toBe(429);
  });
});
```

- [ ] **Step 2: Run it**: `npx vitest run tests/integration/api/pnr-shared-store.test.ts`. Expected: PASS. Then prove it can fail: change `createPnrCache` to return `pnrCache`, and expect the first case to FAIL (`cached: false`). Revert.
  - If `await vi.hoisted(async …)` isn't supported, put the fake on `globalThis` instead: `globalThis.__fakeUpstash ??= createFakeUpstash()` in a helper imported by both the mock factory and the test.
- [ ] **Step 3: Full check**: `npm run check && npx playwright test`. Expected: all green (e2e stays on memory, with no `VERCEL_ENV`).
- [ ] **Step 4: Commit.** `git commit -m "test(pnr): shared cache, shared limits and outage behaviour across instances"`

### Task 8: Docs, the spec's config table, and rollout

**Files:**
- Modify: `docs/architecture.md`, `docs/onboarding.md`, `docs/superpowers/specs/2026-09-18-phase-0-foundations-design.md` (the configuration table and part B's env paragraph), and this plan

- [ ] **Step 1: `docs/architecture.md`.** Under the services or data section, add: "**Shared store** (`shared-store.ts`): on deployments, rate limits and the 60 s PNR cache live in Upstash Redis (Mumbai), under `tt:{env}:`. Keys are HMACs and values AES-256-GCM sealed with subkeys of `DATA_KEY`. A slow or failing store means a cache miss, and the per-instance limiter. `upstash.ts` is the only module that imports Upstash."
- [ ] **Step 2: `docs/onboarding.md` → Deploy.** Add: "Shared store: Vercel → Storage → Upstash for Redis (Mumbai, Free), connected to Production and Preview, injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`. `DATA_KEY` is one per environment: `openssl rand -base64 32 | tr -d '\n' | vercel env add DATA_KEY <production|preview> --sensitive --yes --scope trakline`. A deployment without either refuses to boot."
- [ ] **Step 3: Spec.** In the configuration table:
  - replace the `RATE_LIMIT_STRATEGY=upstash` and `UPSTASH_REDIS_REST_*` rows with a `KV_REST_API_URL`/`KV_REST_API_TOKEN` row ("injected by the Vercel Upstash integration; UPSTASH_REDIS_REST_* also accepted")
  - note `RATE_LIMIT_STRATEGY` defaults to `auto`
  - in part B's "Env schema" paragraph, say the requirement keys on `VERCEL_ENV` (production or preview), so CI builds stay secret-free
- [ ] **Step 4: Commit.** `git commit -m "docs: the shared store, its setup, and the spec's config table"`
- [ ] **Step 5: Rollout (with the user).**
  1. Confirm with `vercel env ls --scope trakline` that `KV_REST_API_URL`, `KV_REST_API_TOKEN` and `DATA_KEY` exist for Production and Preview. Check names only; never pull values.
  2. Push, open the PR, and watch `verify`, `e2e`, the dependency audit (lockfile changed), and the Vercel preview build. The preview proves the deployment rule passes with the real integration.
  3. Merge with the user's go-ahead, and watch the production deploy.
  4. Live checks:
     - https://trakline.in answers 200, and a made-up PNR returns "No record".
     - The user checks their own PNR twice within a minute. The second `/api/pnr` response (devtools → Network) shows `"cached": true`.
     - Vercel logs show no `[store]` warnings.
     - Upstash's data browser shows only `tt:production:pnr:v1:<hash>` and `tt:production:rl:…` keys.
