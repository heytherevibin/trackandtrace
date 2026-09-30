import { describe, expect, it } from "vitest";
import { confirmUrl, signUnsubscribe, travellerOrigin, unsubscribeUrl, verifyUnsubscribe } from "@/services/subscriptions/links";

const KEY = Buffer.alloc(32, 9);
const PERSON = "8a1f2c3d-0000-4000-8000-000000000001";

describe("travellerOrigin", () => {
  it("is the apex constant in production, whatever the request says", () => {
    expect(travellerOrigin("evil.example", "production")).toBe("https://trakline.in");
  });

  it("is localhost with its port elsewhere, and nothing else", () => {
    expect(travellerOrigin("localhost:4211", "development")).toBe("http://localhost:4211");
    // The WHOLE authority is checked, not the part before the first colon: a browser reads what
    // follows an "@" as the real host and discards everything before it as userinfo, so a header
    // shaped like this would otherwise put the attacker's host in an email we sent.
    expect(travellerOrigin("localhost:4211@evil.example", undefined)).toBe("");
    expect(travellerOrigin("preview-x.vercel.app", "preview")).toBe("");
  });
});

describe("unsubscribe signatures", () => {
  it("are stable for a person and a list, and differ between lists", () => {
    expect(signUnsubscribe(KEY, PERSON, "news")).toBe(signUnsubscribe(KEY, PERSON, "news"));
    expect(signUnsubscribe(KEY, PERSON, "news")).not.toBe(signUnsubscribe(KEY, PERSON, "availability"));
  });

  it("verify only their own person and list", () => {
    const s = signUnsubscribe(KEY, PERSON, "news");
    expect(verifyUnsubscribe(KEY, PERSON, "news", s)).toBe(true);
    expect(verifyUnsubscribe(KEY, PERSON, "availability", s)).toBe(false);
    expect(verifyUnsubscribe(KEY, PERSON, "news", `${s.slice(0, -1)}A`)).toBe(false);
    expect(verifyUnsubscribe(KEY, PERSON, "news", "")).toBe(false);
  });
});

describe("the links", () => {
  it("carry the token or the signature, and nothing else about the person", () => {
    expect(confirmUrl("https://trakline.in", "tok")).toBe("https://trakline.in/subscribe/confirm?token=tok");
    expect(unsubscribeUrl("https://trakline.in", PERSON, "news", "sig")).toBe(`https://trakline.in/unsubscribe?p=${PERSON}&l=news&s=sig`);
  });
});
