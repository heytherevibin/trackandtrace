import { z } from "zod";

// ---------------------------------------------------------------------------
// Typed environment. Parsed once through `env()`; application code never reads
// process.env directly. `parseEnv` is pure so tests can exercise every rule.
// ---------------------------------------------------------------------------

const keyLike = z.string().min(20);
const flag = z.enum(["0", "1"]);

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /** live (default) asks the verified provider seam; fixture serves labelled sample data and is refused in production. */
    PNR_SOURCE: z.enum(["live", "fixture"]).default("live"),
    LIVE_SOURCE_ENABLED: flag.default("0").transform((v) => v === "1"),
    RATE_LIMIT_STRATEGY: z.enum(["memory", "upstash"]).default("memory"),
    UPSTASH_REDIS_REST_URL: z.url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: keyLike.optional(),
    SUPABASE_SERVICE_ROLE_KEY: keyLike.optional(),
    NEXT_PUBLIC_APP_URL: z.url().optional(),
    /** Set by the Playwright web server; unlocks test-only affordances. */
    E2E: flag.default("0").transform((v) => v === "1"),
    /** Pins the fixture clock so end-to-end runs are deterministic. */
    E2E_NOW: z.iso.datetime().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.NODE_ENV === "production" && v.PNR_SOURCE === "fixture") {
      ctx.addIssue({ code: "custom", path: ["PNR_SOURCE"], message: "PNR_SOURCE=fixture is refused in production." });
    }
    if (v.RATE_LIMIT_STRATEGY === "upstash" && !(v.UPSTASH_REDIS_REST_URL && v.UPSTASH_REDIS_REST_TOKEN)) {
      ctx.addIssue({ code: "custom", path: ["RATE_LIMIT_STRATEGY"], message: "The upstash strategy needs both URL and token." });
    }
    if (Boolean(v.NEXT_PUBLIC_SUPABASE_URL) !== Boolean(v.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
      ctx.addIssue({ code: "custom", path: ["NEXT_PUBLIC_SUPABASE_ANON_KEY"], message: "Set both Supabase URL and anon key, or neither." });
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
  return Boolean(current.NEXT_PUBLIC_SUPABASE_URL && current.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** The fixture may serve only outside production, and only when explicitly requested. */
export function fixtureAllowed(current: Env = env()): boolean {
  return current.PNR_SOURCE === "fixture" && current.NODE_ENV !== "production";
}

/** Feature flags read through one place. */
export const flags = {
  get liveSource(): boolean {
    return env().LIVE_SOURCE_ENABLED;
  },
};
