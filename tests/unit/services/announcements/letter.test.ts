import { describe, expect, it } from "vitest";
import { letterText, listHeaders } from "@/services/announcements/letter";
import { messages } from "@/messages";

describe("a list email", () => {
  it("ends with the unsubscribe line, whatever the operator wrote", () => {
    // The operator cannot forget it, because they never type it.
    const out = letterText("Hello.\n", "https://trakline.in/unsubscribe?p=1&l=news&s=abc");
    expect(out.startsWith("Hello.\n")).toBe(true);
    expect(out).toContain(messages.subscribe.email.unsubscribeLine);
    expect(out).toContain("https://trakline.in/unsubscribe?p=1&l=news&s=abc");
  });

  it("carries the one-click headers RFC 8058 defines", () => {
    const h = listHeaders("https://trakline.in/api/unsubscribe/one-click?p=1&l=news&s=abc");
    expect(h["List-Unsubscribe"]).toBe("<https://trakline.in/api/unsubscribe/one-click?p=1&l=news&s=abc>");
    expect(h["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});
