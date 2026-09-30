import { z } from "zod";
import { messages } from "@/messages";
import { apiRequest } from "@/services/api-client";

const m = messages.subscribe;

export type SignupState = "idle" | "sending" | "sent" | "invalid" | "limited" | "dailyLimit" | "error";

export interface SignupAsk {
  readonly email: string;
  readonly list: "news" | "availability";
  readonly source: "footer" | "landing" | "pre-booking" | "account";
}

const reply = z.object({ ok: z.literal(true), message: z.string() });

/**
 * One sign-up.
 *
 * The four refusals are told apart by their copy. `apiRequest` does not carry the HTTP status, and
 * 429 covers both the connection limit and the day's allowance — so the message is the only thing
 * that separates them. It is compared against the same constant the route throws, never a string
 * written out twice.
 */
export async function signUp(ask: SignupAsk, fetchImpl?: typeof fetch): Promise<SignupState> {
  const email = ask.email.trim().toLowerCase();
  const result = await apiRequest(
    "/api/subscribe",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...ask, email }) },
    reply,
    fetchImpl ? { fetchImpl } : {},
  );
  if (result.ok) return "sent";
  const said = result.error.message;
  if (said === m.errors.invalid) return "invalid";
  if (said === m.errors.limited) return "limited";
  if (said === m.errors.dailyLimit) return "dailyLimit";
  return "error";
}
