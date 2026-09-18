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
