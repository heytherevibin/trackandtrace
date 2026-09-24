import { z } from "zod";
import type { PnrSource } from "@/types/domain";

/** The one value `PNR_FALLBACK` used to take that no longer names anything. See the field. */
const RETIRED_FALLBACK = "rapidapi";

/**
 * Providers that are not an official railway source. Server knowledge: travellers only ever see
 * Trakline. One member today, RailKit. The breaker, the usage counter and the provider guard are
 * written over this set rather than over that one name, so a second provider costs them nothing.
 */
export type ThirdPartySource = Extract<PnrSource, "railkit">;

export function isThirdPartySource(source: PnrSource): source is ThirdPartySource {
  return source === "railkit";
}

// ---------------------------------------------------------------------------
// Typed environment. Parsed once through `env()`; application code never reads
// process.env directly. `parseEnv` is pure so tests can exercise every rule.
// ---------------------------------------------------------------------------

const keyLike = z.string().min(20);
const flag = z.enum(["0", "1"]);

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /**
     * live (default) asks the verified provider seam; railkit reads the third-party RailKit API
     * (railkit.in), not affiliated with IRCTC, and every result is labelled so; fixture serves
     * labelled sample data and is refused in production.
     */
    PNR_SOURCE: z.enum(["live", "fixture", "railkit"]).default("live"),
    /**
     * A second third-party source, asked only while PNR_SOURCE is unavailable — never on "no
     * record". It exists for a second provider, and there is no second provider yet: RailKit is
     * the only one, and no source may be its own fallback, so today `none` is the only setting
     * that parses. The seam is kept on purpose — one provider is a single point of failure for
     * every check and for the prediction work behind them — and it opens by itself the day a
     * second provider joins this enum. Until then a deployment that sets anything else is told
     * so at boot rather than having it quietly ignored.
     *
     * **With one exception: `rapidapi` is read here as `none`, and this is not tidiness.** It was a
     * valid setting until the source was removed, and a deployment carrying it had no reason to change:
     * `railkit` as the source and `rapidapi` as the fallback parsed perfectly well for the six days
     * between one provider replacing the other and this line being written.
     *
     * `env()` THROWS on an invalid environment in production. So without this, the deploy that
     * removed RapidAPI would have taken every traveller PNR check down — over a value that says
     * "fall back to a source that no longer exists", whose only correct reading is `none`. That is
     * exactly what removing the source meant, so it is read that way and said out loud at boot
     * rather than being turned into an outage.
     *
     * Delete this line once the variable is gone from every environment.
     */
    PNR_FALLBACK: z.preprocess((value) => (value === RETIRED_FALLBACK ? "none" : value), z.enum(["none", "railkit"]).default("none")),
    LIVE_SOURCE_ENABLED: flag.default("0").transform((v) => v === "1"),
    /** Server only. A RailKit dashboard key (railkit_…); never expose with a NEXT_PUBLIC_ prefix. */
    RAILKIT_API_KEY: z
      .string()
      .regex(/^railkit_[A-Za-z0-9]{24,}$/, "RAILKIT_API_KEY must be a RailKit key (railkit_…) with no spaces.")
      .optional(),
    /** RailKit's REST origin: https, no path, no trailing slash. */
    RAILKIT_BASE_URL: z
      .string()
      .regex(/^https:\/\/[a-z0-9.-]+(?::\d{2,5})?$/, "RAILKIT_BASE_URL must be an https origin such as https://api.railkit.in.")
      .default("https://api.railkit.in"),
    RAILKIT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(8000),
    /** auto: the shared store when it is configured, this instance's memory otherwise. */
    RATE_LIMIT_STRATEGY: z.enum(["auto", "memory", "upstash"]).default("auto"),
    /** Live requests allowed per day in India, across every address. RailKit's plan is 10,000 a month: 300 × 31 = 9,300. */
    LIVE_REQUESTS_PER_DAY: z.coerce.number().int().min(1).max(1_000_000).default(300),
    UPSTASH_REDIS_REST_URL: z.url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
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
    /** Set by Vercel on every deployment: the full commit sha. The console rail's footer shows its first seven characters. */
    VERCEL_GIT_COMMIT_SHA: z.string().min(7).optional(),
    NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
    /** Supabase publishable key (sb_publishable_…): safe in the browser, RLS applies. */
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: keyLike.optional(),
    /** Supabase secret key (sb_secret_…). Server only, used solely to delete an account. */
    SUPABASE_SECRET_KEY: keyLike.optional(),
    /** Shows "Continue with Google" once the provider is enabled in the Supabase project. */
    AUTH_GOOGLE_ENABLED: flag.default("0").transform((v) => v === "1"),
    /** Offers passkeys once they are enabled in the Supabase project. */
    AUTH_PASSKEY_ENABLED: flag.default("0").transform((v) => v === "1"),
    NEXT_PUBLIC_APP_URL: z.url().optional(),
    /** Set by the Playwright web server; unlocks test-only affordances. */
    E2E: flag.default("0").transform((v) => v === "1"),
    /** Pins the fixture clock so end-to-end runs are deterministic. */
    E2E_NOW: z.iso.datetime().optional(),
    /** Server only. Resend sending key for console email; entered by the owner through a hidden prompt. */
    RESEND_API_KEY: z.string().min(20).optional(),
    /** Who console email comes from. One default, so no deployment has to set it. */
    CONSOLE_EMAIL_FROM: z.string().min(5).max(120).default("Trakline Console <console@trakline.in>"),
  })
  .superRefine((v, ctx) => {
    if ((v.PNR_SOURCE === "railkit" || v.PNR_FALLBACK === "railkit") && !v.RAILKIT_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["RAILKIT_API_KEY"], message: "RAILKIT_API_KEY is required when RailKit is the source or the fallback." });
    }
    if (v.PNR_FALLBACK !== "none" && v.PNR_FALLBACK === v.PNR_SOURCE) {
      ctx.addIssue({ code: "custom", path: ["PNR_FALLBACK"], message: "PNR_FALLBACK must name a different source than PNR_SOURCE." });
    }
    // Only a third-party source is asked through the fallback seam, so a fallback behind `live` or
    // `fixture` would never be reached: refused here rather than silently ignored. With one provider
    // in the enum these two rules together leave `none` as the only setting that parses; both stay
    // true, and stop being exhaustive, the day a second provider joins it.
    if (v.PNR_FALLBACK !== "none" && !isThirdPartySource(v.PNR_SOURCE)) {
      ctx.addIssue({ code: "custom", path: ["PNR_FALLBACK"], message: "PNR_FALLBACK is only asked behind a third-party PNR_SOURCE; nothing would ask it here." });
    }
    if (v.NODE_ENV === "production" && v.PNR_SOURCE === "fixture") {
      ctx.addIssue({ code: "custom", path: ["PNR_SOURCE"], message: "PNR_SOURCE=fixture is refused in production." });
    }
    if ((v.NODE_ENV === "production" || v.VERCEL_ENV === "production") && v.E2E) {
      ctx.addIssue({ code: "custom", path: ["E2E"], message: "E2E=1 is refused in production." });
    }
    const storeGaps = [
      ...(upstashCredentials(v) ? [] : ["missing the Upstash URL and token (KV_REST_API_* or UPSTASH_REDIS_REST_*)"]),
      ...(v.DATA_KEY ? [] : ["missing DATA_KEY"]),
    ];
    if (v.RATE_LIMIT_STRATEGY === "upstash" && storeGaps.length > 0) {
      ctx.addIssue({ code: "custom", path: ["RATE_LIMIT_STRATEGY"], message: `The upstash strategy needs the shared store: ${storeGaps.join("; ")}.` });
    }
    const deployed = v.VERCEL_ENV === "production" || v.VERCEL_ENV === "preview";
    const deployGaps = [...storeGaps, ...(v.RATE_LIMIT_STRATEGY === "memory" ? ["RATE_LIMIT_STRATEGY=memory is not allowed (remove it)"] : [])];
    if (deployed && deployGaps.length > 0) {
      ctx.addIssue({ code: "custom", path: ["DATA_KEY"], message: `Deployments need the shared store: ${deployGaps.join("; ")}.` });
    }
    if (Boolean(v.NEXT_PUBLIC_SUPABASE_URL) !== Boolean(v.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)) {
      ctx.addIssue({ code: "custom", path: ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"], message: "Set both Supabase URL and publishable key, or neither." });
    }
  });

export type Env = z.infer<typeof envSchema>;

export type ParsedEnv =
  | { readonly ok: true; readonly env: Env }
  | { readonly ok: false; readonly issues: readonly string[] };

/** Empty strings from copied .env templates count as unset. */
function withoutBlanks(source: Readonly<Record<string, string | undefined>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== ""),
  );
}

export function parseEnv(source: Readonly<Record<string, string | undefined>>): ParsedEnv {
  const parsed = envSchema.safeParse(withoutBlanks(source));
  if (parsed.success) return { ok: true, env: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`),
  };
}

let cached: Env | null = null;
let warned = false;
let warnedRetired = false;

/** Validated environment. Fails loudly in production; falls back to defaults elsewhere. */
export function env(): Env {
  if (cached) return cached;
  const parsed = parseEnv(process.env);
  if (parsed.ok) {
    // Said once, wherever it happens, including production: the variable parsed only because it was
    // read as `none`, and it will keep doing so silently until somebody deletes it.
    if (process.env.PNR_FALLBACK === RETIRED_FALLBACK && !warnedRetired) {
      warnedRetired = true;
      console.warn(`[env] PNR_FALLBACK=${RETIRED_FALLBACK} names a source that was removed; reading it as "none". Delete the variable.`);
    }
    cached = parsed.env;
    return cached;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(`Invalid environment: ${parsed.issues.join("; ")}`);
  }
  if (!warned) {
    warned = true;
    console.warn("[env] invalid or incomplete environment, using defaults:", parsed.issues);
  }
  const fallback = parseEnv({ NODE_ENV: process.env.NODE_ENV });
  cached = fallback.ok ? fallback.env : envSchema.parse({});
  return cached;
}

/** Test seam: forget the cached parse. */
export function resetEnvCache(): void {
  cached = null;
  warned = false;
  warnedRetired = false;
}

export function accountsConfigured(current: Env = env()): boolean {
  return Boolean(current.NEXT_PUBLIC_SUPABASE_URL && current.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

/** Google sign-in is offered only when accounts exist and the provider was switched on deliberately. */
export function googleSignInEnabled(current: Env = env()): boolean {
  return accountsConfigured(current) && current.AUTH_GOOGLE_ENABLED;
}

/** Passkeys are offered only when accounts exist and the project has them switched on. */
export function passkeysEnabled(current: Env = env()): boolean {
  return accountsConfigured(current) && current.AUTH_PASSKEY_ENABLED;
}

/** The fixture may serve only outside production, and only when explicitly requested. */
export function fixtureAllowed(current: Env = env()): boolean {
  return current.PNR_SOURCE === "fixture" && current.NODE_ENV !== "production";
}

/** Which source answers PNR checks in this deployment, as results and provenance name it. */
export function activePnrSource(current: Env = env()): PnrSource {
  if (fixtureAllowed(current)) return "fixture";
  if (current.PNR_SOURCE === "railkit" && current.RAILKIT_API_KEY) return "railkit";
  return "live";
}

/** The daily budget for live requests. The one place it is read, so the console can later own it. */
export function liveRequestsPerDay(current: Env = env()): number {
  return current.LIVE_REQUESTS_PER_DAY;
}

/**
 * The source that answers while the active one is unavailable, if one is configured. Null with one
 * provider — see PNR_FALLBACK above — and the rules that make it so are written here, not assumed,
 * so a second provider needs nothing but its own line.
 */
export function fallbackPnrSource(current: Env = env()): ThirdPartySource | null {
  const active = activePnrSource(current);
  if (active === "fixture" || current.PNR_FALLBACK === "none" || current.PNR_FALLBACK === active) return null;
  if (current.PNR_FALLBACK === "railkit" && current.RAILKIT_API_KEY) return "railkit";
  return null;
}

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

/** Feature flags read through one place. */
export const flags = {
  /** A reservation source is connected: a verified provider, or the configured third-party API. */
  get liveSource(): boolean {
    const current = env();
    return current.LIVE_SOURCE_ENABLED || isThirdPartySource(activePnrSource(current));
  },
};
