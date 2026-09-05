import { z } from "zod";

// ---------------------------------------------------------------------------
// Typed environment matrix. Everything the runtime can be configured with
// lives here, validated once, and is read through `env()` — never
// process.env directly in application code.
// ---------------------------------------------------------------------------

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Data source
  LIVE_SOURCE_ENABLED: z
    .enum(["0", "1"])
    .default("0")
    .transform((v) => v === "1"),
  // Rate limiting: "memory" (default, per-instance) or "upstash" (shared).
  RATE_LIMIT_STRATEGY: z.enum(["memory", "upstash"]).default("memory"),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  // Postgres (accounts milestone; validated when DATABASE_URL present)
  DATABASE_URL: z.string().min(1).optional(),
  // Auth (wired at integration; validated when present)
  AUTH_SECRET: z.string().min(16).optional(),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  AUTH_EMAIL_SERVER: z.string().optional(),
  AUTH_EMAIL_FROM: z.string().email().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Fail loudly in production; fall back to defaults in dev.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `Invalid environment: ${parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`
      );
    }
    console.warn("[env] invalid or incomplete env — using defaults", parsed.error.issues.map((i) => i.path.join(".")));
    cached = envSchema.parse({});
    return cached;
  }
  cached = parsed.data;
  return cached;
}

/** Feature flags, read through one place so M3 wiring stays trivial. */
export const flags = {
  get liveSource() {
    return env().LIVE_SOURCE_ENABLED;
  },
};