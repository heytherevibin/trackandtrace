import { AppError } from "./errors";
import type { RateLimiter } from "./rate-limit";
import { createRateLimiter } from "./shared-store";

// Lighter per-user limit for account writes so a stuck client cannot hammer the database.
export const WRITE_RATE_LIMIT = { limit: 60, windowMs: 60_000 } as const;

let limiter: RateLimiter | null = null;

export async function assertWriteAllowed(userId: string, current: RateLimiter = (limiter ??= createRateLimiter())): Promise<void> {
  const rate = await current.check(`write:${userId}`, WRITE_RATE_LIMIT.limit, WRITE_RATE_LIMIT.windowMs);
  if (!rate.ok) {
    throw new AppError("RATE_LIMITED", "Too many changes in a minute. Wait a moment and retry.", { retryAfter: rate.retryAfterSeconds });
  }
}
