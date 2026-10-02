import { describe, expect, it } from "vitest";
import { letterText, listHeaders } from "@/services/announcements/letter";
import { messages } from "@/messages";

const HUMAN = "https://trakline.in/unsubscribe?p=1&l=news&s=abc";

describe("a list email", () => {
  it("ends with the news unsubscribe line, whatever the operator wrote, and never the availability one", () => {
    // The operator cannot forget it, because they never type it.
    const out = letterText("Hello.\n", HUMAN, "news");
    expect(out.startsWith("Hello.\n")).toBe(true);
    expect(out).toContain(messages.subscribe.email.unsubscribeLine.news);
    expect(out).not.toContain(messages.subscribe.email.unsubscribeLine.availability);
    expect(out).toContain(HUMAN);
  });

  it("tells the availability list what it asked for, and never calls it news", () => {
    // That list gets exactly one email, so the reader must be told the true reason they got it.
    const out = letterText("Checks are open.\n", HUMAN, "availability");
    expect(out.startsWith("Checks are open.\n")).toBe(true);
    expect(out).toContain(messages.subscribe.email.unsubscribeLine.availability);
    expect(out).not.toContain(messages.subscribe.email.unsubscribeLine.news);
    expect(out).toContain(HUMAN);
  });

  it("gives each list its own, different line", () => {
    const { news, availability } = messages.subscribe.email.unsubscribeLine;
    expect(news).not.toBe(availability);
    expect(availability).toContain("availability checks open");
    expect(news).toContain("news about Trakline");
  });

  it("carries the one-click headers RFC 8058 defines", () => {
    const h = listHeaders("https://trakline.in/api/unsubscribe/one-click?p=1&l=news&s=abc");
    expect(h["List-Unsubscribe"]).toBe("<https://trakline.in/api/unsubscribe/one-click?p=1&l=news&s=abc>");
    expect(h["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});
