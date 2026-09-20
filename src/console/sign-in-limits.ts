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
