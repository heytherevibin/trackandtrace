import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { deriveDataKeys } from "@/services/data-key";
import { env } from "@/services/env";

const PRODUCTION = "https://trakline.in";

/**
 * Where a link we mail someone points.
 *
 * Production is the constant: a link that reaches somebody's inbox must never be assembled from
 * client input. Elsewhere only localhost with a numeric port — the same rule `consoleOrigin` already
 * follows, and for the same reason it checks the WHOLE authority rather than the part before the
 * first colon. A browser reads what follows an "@" as the real host and discards everything before
 * it as userinfo, so a header shaped that way would otherwise put an attacker's host in our email.
 *
 * Anything else is "", and the caller sends no email rather than sending a link nobody should click.
 */
export function travellerOrigin(hostHeader: string | null, vercelEnv: string | undefined): string {
  if (vercelEnv === "production") return PRODUCTION;
  const match = /^localhost:(\d{2,5})$/.exec((hostHeader ?? "").trim().toLowerCase());
  return match ? `http://localhost:${match[1]}` : "";
}

/**
 * An unsubscribe link's signature: HMAC over the person and the list, nothing stored.
 *
 * There is no row to expire, which is what the law and one-click unsubscribe expect — a link in a
 * two-year-old email still works. The list is inside the signature, so a link for one list cannot
 * be edited into a link for another.
 */
export function signUnsubscribe(key: Buffer, person: string, list: string): string {
  return createHmac("sha256", key).update(`unsubscribe:${person}:${list}`).digest("base64url");
}

export function verifyUnsubscribe(key: Buffer, person: string, list: string, signature: string): boolean {
  const expected = Buffer.from(signUnsubscribe(key, person, list));
  const given = Buffer.from(signature);
  // Length first: timingSafeEqual throws on a mismatch, and a thrown comparison is a failure that
  // looks different from a false one.
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const LOCAL_KEY = randomBytes(32);

/**
 * DATA_KEY's unsubscribe subkey. Without DATA_KEY — local only, since the environment check requires
 * it in production — a per-process key, so links work within one dev server and nowhere else.
 */
export function unsubscribeKey(): Buffer {
  const dataKey = env().DATA_KEY;
  return dataKey ? deriveDataKeys(dataKey).unsubscribe : LOCAL_KEY;
}

export function confirmUrl(origin: string, token: string): string {
  return `${origin}/subscribe/confirm?token=${token}`;
}

export function unsubscribeUrl(origin: string, person: string, list: string, signature: string): string {
  return `${origin}/unsubscribe?p=${person}&l=${list}&s=${signature}`;
}
