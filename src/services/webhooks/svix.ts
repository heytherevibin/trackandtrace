import { createHmac, timingSafeEqual } from "node:crypto";

export interface SvixHead {
  readonly id: string;
  readonly timestamp: string;
  readonly signature: string;
}

const PREFIX = "whsec_";
const TOLERANCE_MS = 5 * 60_000;

/**
 * Svix's scheme, as Resend sends it: HMAC-SHA256 over `${id}.${timestamp}.${raw body}`.
 *
 * Two details decide whether this is right or merely plausible. The signature header carries
 * EVERY active key's signature, space separated and each tagged `v1,` — during a key rotation both
 * old and new arrive, and accepting only the first makes the rotation a silent outage. And the
 * comparison is `timingSafeEqual`, which needs equal lengths, so a wrong-length candidate is
 * rejected before it reaches the comparison rather than throwing inside it.
 */
export function verifySvix(secret: string, head: SvixHead, body: string, now: Date): boolean {
  try {
    if (!secret.startsWith(PREFIX)) return false;
    const seconds = Number(head.timestamp);
    if (!Number.isFinite(seconds)) return false;
    if (Math.abs(now.getTime() - seconds * 1000) > TOLERANCE_MS) return false;

    const key = Buffer.from(secret.slice(PREFIX.length), "base64");
    const expected = Buffer.from(createHmac("sha256", key).update(`${head.id}.${head.timestamp}.${body}`).digest("base64"));

    return head.signature
      .split(" ")
      .filter((part) => part.startsWith("v1,"))
      .some((part) => {
        const given = Buffer.from(part.slice(3));
        return given.length === expected.length && timingSafeEqual(given, expected);
      });
  } catch {
    return false;
  }
}
