import { z } from "zod";
import type { PnrSource } from "@/types/domain";
import { isThirdPartySource } from "@/utils/source";

export { isThirdPartySource };

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
     * live (default) asks the verified provider seam; railkit reads the third-party RailKit API (railkit.in)
     * and rapidapi the third-party RapidAPI "IRCTC" API (IRCTCAPI), neither affiliated with IRCTC, and every
     * result is labelled so; fixture serves labelled sample data and is refused in production.
     */
    PNR_SOURCE: z.enum(["live", "fixture", "rapidapi", "railkit"]).default("live"),
    /** A second third-party source that answers only while PNR_SOURCE is unavailable. */
    PNR_FALLBACK: z.enum(["none", "rapidapi", "railkit"]).default("none"),
    LIVE_SOURCE_ENABLED: flag.default("0").transform((v) => v === "1"),
    /** Server only. Never expose with a NEXT_PUBLIC_ prefix. */
    RAPIDAPI_KEY: z.string().min(16).optional(),
    RAPIDAPI_HOST: z.string().regex(/^[a-z0-9.-]+\.p\.rapidapi\.com$/).default("irctc1.p.rapidapi.com"),
    RAPIDAPI_PNR_PATH: z.string().regex(/^\/[A-Za-z0-9/_-]+$/).default("/api/v3/getPNRStatus"),
    RAPIDAPI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(8000),
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
    RATE_LIMIT_STRATEGY: z.enum(["memory", "upstash"]).default("memory"),
    UPSTASH_REDIS_REST_URL: z.url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
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
  })
  .superRefine((v, ctx) => {
    if ((v.PNR_SOURCE === "rapidapi" || v.PNR_FALLBACK === "rapidapi") && !v.RAPIDAPI_KEY) {
      ctx.addIssue({ code: "custom", path: ["RAPIDAPI_KEY"], message: "RAPIDAPI_KEY is required when RapidAPI is the source or the fallback." });
    }
    if ((v.PNR_SOURCE === "railkit" || v.PNR_FALLBACK === "railkit") && !v.RAILKIT_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["RAILKIT_API_KEY"], message: "RAILKIT_API_KEY is required when RailKit is the source or the fallback." });
    }
    if (v.PNR_FALLBACK !== "none" && v.PNR_FALLBACK === v.PNR_SOURCE) {
      ctx.addIssue({ code: "custom", path: ["PNR_FALLBACK"], message: "PNR_FALLBACK must name a different source than PNR_SOURCE." });
    }
    if (v.NODE_ENV === "production" && v.PNR_SOURCE === "fixture") {
      ctx.addIssue({ code: "custom", path: ["PNR_SOURCE"], message: "PNR_SOURCE=fixture is refused in production." });
    }
    if (v.RATE_LIMIT_STRATEGY === "upstash" && !(v.UPSTASH_REDIS_REST_URL && v.UPSTASH_REDIS_REST_TOKEN)) {
      ctx.addIssue({ code: "custom", path: ["RATE_LIMIT_STRATEGY"], message: "The upstash strategy needs both URL and token." });
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

/** Validated environment. Fails loudly in production; falls back to defaults elsewhere. */
export function env(): Env {
  if (cached) return cached;
  const parsed = parseEnv(process.env);
  if (parsed.ok) {
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
  if (current.PNR_SOURCE === "rapidapi" && current.RAPIDAPI_KEY) return "rapidapi";
  return "live";
}

/** The source that answers while the active one is unavailable, if one is configured. */
export function fallbackPnrSource(current: Env = env()): Extract<PnrSource, "rapidapi" | "railkit"> | null {
  const active = activePnrSource(current);
  if (active === "fixture" || current.PNR_FALLBACK === "none" || current.PNR_FALLBACK === active) return null;
  if (current.PNR_FALLBACK === "railkit" && current.RAILKIT_API_KEY) return "railkit";
  if (current.PNR_FALLBACK === "rapidapi" && current.RAPIDAPI_KEY) return "rapidapi";
  return null;
}



/** Feature flags read through one place. */
export const flags = {
  /** A reservation source is connected: a verified provider, or the configured third-party API. */
  get liveSource(): boolean {
    const current = env();
    return current.LIVE_SOURCE_ENABLED || isThirdPartySource(activePnrSource(current));
  },
};
