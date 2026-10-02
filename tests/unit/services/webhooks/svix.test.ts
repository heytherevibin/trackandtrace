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

describe("verifySvix", () => {
  it("accepts a signature over id, timestamp and the raw body", () => {
    const ts = stamp(NOW);
    expect(verifySvix(SECRET, { id: ID, timestamp: ts, signature: sign(ID, ts, BODY) }, BODY, NOW)).toBe(true);
  });

  it("accepts when ANY of several signatures matches, because that is how key rotation works", () => {
    // Svix sends every active key's signature, space separated. Taking only the first would make a
    // rotation a silent outage: every webhook refused until the old key is retired.
    const ts = stamp(NOW);
    const other = `whsec_${Buffer.alloc(32, 9).toString("base64")}`;
    const both = `${sign(ID, ts, BODY, other)} ${sign(ID, ts, BODY)}`;
    expect(verifySvix(SECRET, { id: ID, timestamp: ts, signature: both }, BODY, NOW)).toBe(true);
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
    for (const at of [old, ahead]) {
      const ts = stamp(at);
      expect(verifySvix(SECRET, { id: ID, timestamp: ts, signature: sign(ID, ts, BODY) }, BODY, NOW)).toBe(false);
    }
  });

  it("refuses rubbish without throwing", () => {
    expect(verifySvix(SECRET, { id: ID, timestamp: "not-a-number", signature: "v1,zzz" }, BODY, NOW)).toBe(false);
    expect(verifySvix(SECRET, { id: ID, timestamp: stamp(NOW), signature: "" }, BODY, NOW)).toBe(false);
  });
});
