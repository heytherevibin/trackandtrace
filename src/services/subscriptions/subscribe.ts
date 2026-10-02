import { createHash } from "node:crypto";
import { z } from "zod";
import { messages } from "@/messages";
import type { Letter, SendResult } from "@/services/email/send";
import { AppError } from "@/services/errors";
import { addressKey, type RateLimiter } from "@/services/rate-limit";
import { SUBSCRIBE_RATE_LIMIT } from "./limits";
import { confirmUrl } from "./links";

const m = messages.subscribe;
const EMAIL = z.email().max(254);

export type SubscribeList = "news" | "availability";
export type SubscribeSource = "footer" | "landing" | "pre-booking" | "account";

export interface SubscribeAsk {
  readonly email: string;
  readonly list: SubscribeList;
  readonly source: SubscribeSource;
  readonly campaign?: { readonly source?: string; readonly medium?: string; readonly name?: string; readonly page?: string };
}

export interface SubscribeDeps {
  readonly limiter: RateLimiter;
  readonly allowance: () => Promise<"ok" | "spent" | "unknown">;
  readonly signUp: (ask: SubscribeAsk, tokenHash: Buffer) => Promise<"send" | "quiet">;
  readonly send: (letter: Letter) => Promise<SendResult>;
  readonly origin: string;
  readonly from: string;
  readonly token: () => string;
}

/** Only the hash reaches the database, so a leak of it cannot confirm anyone. */
export const tokenHash = (token: string): Buffer => createHash("sha256").update(token).digest();

/**
 * One sign-up, in the spec's order: validate, limit, allowance, database, email.
 *
 * The first three write nothing when they refuse — which is why they run first. Taking from the
 * allowance before the database write means a request that cannot be sent an email never leaves a
 * pending row behind.
 *
 * Success is always the same silence. The route answers "Check your inbox to confirm." whether this
 * sent an email or the database said quiet, so the reply never reveals whether an address is
 * already known — a reply that differed would turn this into a way to test addresses.
 */
export async function subscribe(ask: SubscribeAsk, ip: string, deps: SubscribeDeps): Promise<void> {
  const email = ask.email.trim().toLowerCase();
  if (!EMAIL.safeParse(email).success) throw new AppError("INVALID_INPUT", m.errors.invalid);
  // No safe origin is no email: a confirm link is useless without one, and building it from the
  // request is how an attacker's host ends up in an inbox. Checked before anything is written.
  if (deps.origin === "") throw new AppError("SOURCE_UNAVAILABLE", m.errors.failed);

  const rate = await deps.limiter.check(`subscribe:${addressKey(ip)}`, SUBSCRIBE_RATE_LIMIT.limit, SUBSCRIBE_RATE_LIMIT.windowMs);
  if (!rate.ok) throw new AppError("RATE_LIMITED", m.errors.limited, { status: 429, retryAfter: rate.retryAfterSeconds });

  const allowance = await deps.allowance();
  if (allowance === "spent") throw new AppError("RATE_LIMITED", m.errors.dailyLimit, { status: 429 });
  if (allowance === "unknown") throw new AppError("SOURCE_UNAVAILABLE", m.errors.failed);

  const token = deps.token();
  const due = await deps.signUp({ ...ask, email }, tokenHash(token));
  if (due === "quiet") return;

  const sent = await deps.send({
    from: deps.from,
    to: email,
    subject: m.email.subject,
    text: m.email.body(m.promise[ask.list], confirmUrl(deps.origin, token)),
  });
  // A send that failed leaves a pending row, which the seven-day purge removes. Saying so is better
  // than the alternative: "check your inbox" for an email that was never sent.
  if (sent.outcome === "failed") throw new AppError("SOURCE_UNAVAILABLE", m.errors.failed);
}
