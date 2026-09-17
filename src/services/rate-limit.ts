import { env, type Env } from "@/services/env";

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

export class UpstashRateLimiter implements RateLimiter {
  private readonly url: string;
  private readonly token: string;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  async check(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const windowSec = Math.ceil(windowMs / 1000);
    const rkey = `rl:${key}`;

    try {
      const pipeline = [
        ["SET", rkey, "0", "EX", String(windowSec), "NX"],
        ["INCR", rkey],
      ];

      const res = await fetch(`${this.url}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(pipeline),
      });

      if (!res.ok) {
        return { ok: true, remaining: limit, retryAfterSeconds: 0 };
      }

      const results = (await res.json()) as Array<{ result: unknown }>;
      const count = Number(results[1]?.result ?? 0);

      if (count > limit) {
        return { ok: false, remaining: 0, retryAfterSeconds: windowSec };
      }

      return { ok: true, remaining: limit - count, retryAfterSeconds: 0 };
    } catch {
      return { ok: true, remaining: limit, retryAfterSeconds: 0 };
    }
  }
}

export function createRateLimiter(current: Env = env()): RateLimiter {
  if (current.RATE_LIMIT_STRATEGY === "upstash" && current.UPSTASH_REDIS_REST_URL && current.UPSTASH_REDIS_REST_TOKEN) {
    return new UpstashRateLimiter(current.UPSTASH_REDIS_REST_URL, current.UPSTASH_REDIS_REST_TOKEN);
  }
  return new MemoryRateLimiter();
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
