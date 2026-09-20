import { consoleHostFor, requestHost } from "@/console/hosts";
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
  const expected = consoleHostFor(env().VERCEL_ENV);
  const host = requestHost(hostHeader);
  if (!host || host !== expected) {
    throw new AppError("INVALID_INPUT", "Security keys are scoped to the console's own address.", { status: 403 });
  }
  // The origin keeps the port; the RP ID never has one.
  const authority = (hostHeader ?? "").trim().toLowerCase();
  const scheme = host === "admin.localhost" ? "http" : "https";
  return { id: host, origin: `${scheme}://${authority}`, name: "Trakline Console" };
}
