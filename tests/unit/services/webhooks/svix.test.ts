import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySvix } from "@/services/webhooks/svix";

const SECRET = `whsec_${Buffer.alloc(32, 7).toString("base64")}`;
const NOW = new Date("2026-10-02T12:00:00.000Z");
const BODY = '{"type":"email.bounced"}';
const ID = "msg_123";

function sign(id: string, ts: string, body: string, secret = SECRET): string {
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64")}`;
}
const stamp = (at: Date) => String(Math.floor(at.getTime() / 1000));
const digest = (key: Buffer, id: string, ts: string, body: string): string =>
  createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
const head = (signature: string, timestamp = stamp(NOW)) => ({ id: ID, timestamp, signature });
const at = (seconds: number) => stamp(new Date(NOW.getTime() + seconds * 1000));

describe("verifySvix", () => {
  it("accepts a signature over id, timestamp and the raw body", () => {
    const ts = stamp(NOW);
    expect(verifySvix(SECRET, { id: ID, timestamp: ts, signature: sign(ID, ts, BODY) }, BODY, NOW)).toBe(true);
  });

  it("accepts when ANY of several signatures matches, because that is how key rotation works", () => {
    // Svix sends every active key's signature, space separated. Taking only the first would make a
    // rotation a silent outage: every webhook refused until the old key is retired. Both orders are
    // tested so that "check only the first" and "check only the last" are each caught.
    const ts = stamp(NOW);
    const other = `whsec_${Buffer.alloc(32, 9).toString("base64")}`;
    const wrong = sign(ID, ts, BODY, other);
    const right = sign(ID, ts, BODY);
    expect(verifySvix(SECRET, { id: ID, timestamp: ts, signature: `${wrong} ${right}` }, BODY, NOW)).toBe(true);
    expect(verifySvix(SECRET, { id: ID, timestamp: ts, signature: `${right} ${wrong}` }, BODY, NOW)).toBe(true);
  });

  it("still finds the right signature when a wrong-length candidate comes first", () => {
    // timingSafeEqual throws on unequal lengths, and a throw becomes "refused" for the WHOLE header.
    // A short entry ahead of the valid one must be skipped, not turn a rotation into an outage.
    const ts = stamp(NOW);
    expect(verifySvix(SECRET, head(`v1,short ${sign(ID, ts, BODY)}`), BODY, NOW)).toBe(true);
  });

  it("refuses a body that changed by one character", () => {
    const ts = stamp(NOW);
    const sig = sign(ID, ts, BODY);
    expect(verifySvix(SECRET, { id: ID, timestamp: ts, signature: sig }, `${BODY} `, NOW)).toBe(false);
  });

  it("refuses a signature made for a different message id", () => {
    const ts = stamp(NOW);
    expect(verifySvix(SECRET, { id: "msg_other", timestamp: ts, signature: sign(ID, ts, BODY) }, BODY, NOW)).toBe(false);
  });

  it("refuses a timestamp outside five minutes, in either direction", () => {
    const old = new Date(NOW.getTime() - 6 * 60_000);
    const ahead = new Date(NOW.getTime() + 6 * 60_000);
    for (const when of [old, ahead]) {
      const ts = stamp(when);
      expect(verifySvix(SECRET, { id: ID, timestamp: ts, signature: sign(ID, ts, BODY) }, BODY, NOW)).toBe(false);
    }
  });

  it("accepts a timestamp inside five minutes, because Svix signs seconds before it delivers", () => {
    for (const seconds of [-240, 240]) {
      const ts = at(seconds);
      expect(verifySvix(SECRET, head(sign(ID, ts, BODY), ts), BODY, NOW)).toBe(true);
    }
  });

  it("pins the edge of the window: exactly five minutes is accepted, one second more is refused", () => {
    for (const direction of [-1, 1]) {
      const edge = at(direction * 300);
      const past = at(direction * 301);
      expect(verifySvix(SECRET, head(sign(ID, edge, BODY), edge), BODY, NOW)).toBe(true);
      expect(verifySvix(SECRET, head(sign(ID, past, BODY), past), BODY, NOW)).toBe(false);
    }
  });

  it("refuses a non-numeric timestamp even when its signature is CORRECT", () => {
    // NaN fails every comparison, so without an explicit finite check the window test is skipped
    // and replay protection silently vanishes. The signature must be valid, or the test would pass
    // for the wrong reason.
    for (const ts of ["not-a-number", "Infinity", "-Infinity", "", " "]) {
      expect(verifySvix(SECRET, head(sign(ID, ts, BODY), ts), BODY, NOW)).toBe(false);
    }
  });

  it("refuses rubbish without throwing", () => {
    expect(verifySvix(SECRET, { id: ID, timestamp: "not-a-number", signature: "v1,zzz" }, BODY, NOW)).toBe(false);
    expect(verifySvix(SECRET, { id: ID, timestamp: stamp(NOW), signature: "" }, BODY, NOW)).toBe(false);
  });

  it("refuses a secret with no key in it, instead of verifying against an empty key", () => {
    // Buffer.from(x, "base64") never throws: it quietly decodes junk to an empty key, and HMAC
    // accepts an empty key. Anyone could then forge a webhook, so a misconfigured env var must
    // refuse everything rather than nothing.
    const ts = stamp(NOW);
    const forged = `v1,${digest(Buffer.alloc(0), ID, ts, BODY)}`;
    for (const secret of ["whsec_", "whsec_==", "whsec_!!!"]) {
      expect(verifySvix(secret, head(forged), BODY, NOW)).toBe(false);
    }
  });

  it("refuses a secret that is not valid base64, rather than decoding the part that is", () => {
    // Invalid characters are silently dropped, so "<real key>!!" would otherwise verify as the real key.
    const real = Buffer.alloc(32, 7).toString("base64");
    const signature = `v1,${digest(Buffer.alloc(32, 7), ID, stamp(NOW), BODY)}`;
    expect(verifySvix(`whsec_${real}`, head(signature), BODY, NOW)).toBe(true);
    expect(verifySvix(`whsec_${real}!!`, head(signature), BODY, NOW)).toBe(false);
    expect(verifySvix(`whsec_!${real}`, head(signature), BODY, NOW)).toBe(false);
  });

  it("refuses a secret without the whsec_ prefix", () => {
    // Signed with the key the code would derive if it skipped the prefix check, so only the prefix
    // check can refuse it.
    const signature = `v1,${digest(Buffer.from("secret", "base64"), ID, stamp(NOW), BODY)}`;
    expect(verifySvix("plain-secret", head(signature), BODY, NOW)).toBe(false);
  });

  it("ignores signatures that are not tagged v1, even when the digest is right", () => {
    const raw = digest(Buffer.alloc(32, 7), ID, stamp(NOW), BODY);
    expect(verifySvix(SECRET, head(`v2,${raw}`), BODY, NOW)).toBe(false);
    expect(verifySvix(SECRET, head(raw), BODY, NOW)).toBe(false);
    expect(verifySvix(SECRET, head(`v2,${raw} v1,${raw}`), BODY, NOW)).toBe(true);
  });
});
