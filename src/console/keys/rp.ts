import { consoleHostFor, consoleOrigin } from "@/console/hosts";
import { env } from "@/services/env";
import { AppError } from "@/services/errors";

export interface RelyingParty {
  readonly id: string;
  readonly origin: string;
  readonly name: string;
}

/**
 * Spec §D: the RP ID is the console host, and the origin is checked exactly. So a key registered
 * for the console cannot be used from trakline.in, and a trakline.in passkey never counts. A host
 * that is not this environment's console host gets no relying party at all.
 */
export function relyingParty(hostHeader: string | null): RelyingParty {
  const current = env().VERCEL_ENV;
  // consoleOrigin is the one place the console's own origin is decided: it checks the WHOLE
  // authority, and in production returns the constant rather than anything from the header.
  // An empty answer means this is not the console's host, which is the same refusal §D's scope
  // rule asks for -- a console key must not be reachable from trakline.in.
  const origin = consoleOrigin(hostHeader, current);
  if (!origin) throw new AppError("INVALID_INPUT", "Security keys are scoped to the console's own address.", { status: 403 });
  return { id: consoleHostFor(current), origin, name: "Trakline Console" };
}
