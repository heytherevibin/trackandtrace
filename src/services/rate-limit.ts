import type { WindowLimiter, WindowLimiterFactory } from "./upstash";

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string, limit: number, windowMs: number): RateLimitResult | Promise<RateLimitResult>;
}

export class MemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();

  check(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const cutoff = now - windowMs;
    const prev = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (prev.length >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((prev[0] + windowMs - now) / 1000));
      return { ok: false, remaining: 0, retryAfterSeconds };
    }
    prev.push(now);
    this.hits.set(key, prev);
    if (this.hits.size > 10_000) {
      for (const [k, ts] of this.hits) {
        if (ts.every((t) => t <= cutoff)) this.hits.delete(k);
      }
    }
    return { ok: true, remaining: limit - prev.length, retryAfterSeconds: 0 };
  }
}

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

/** Client IP from a request — first XFF hop outside the loopback trust list. */
export function clientIp(ip: string | null, xff: string | null): string {
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return ip ?? "unknown";
}

export const PNR_RATE_LIMIT = { limit: 20, windowMs: 60_000 };
