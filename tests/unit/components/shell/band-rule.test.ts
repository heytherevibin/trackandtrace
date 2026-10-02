import { describe, expect, it } from "vitest";
import { bandVariant } from "@/components/shell/band-rule";

describe("where the Updates by email band is drawn", () => {
  it("is full on the landing", () => {
    expect(bandVariant("/")).toBe("full");
  });

  it.each(["/pnr", "/pnr/2345678909", "/watchlist", "/account", "/accuracy", "/privacy", "/tos"])("is slim on %s", (path) => {
    expect(bandVariant(path)).toBe("slim");
  });

  it.each(["/subscribe/confirm", "/unsubscribe", "/login", "/pre-booking", "/offline"])("is absent on %s", (path) => {
    expect(bandVariant(path)).toBeNull();
  });

  it("reads a trailing slash as the same page", () => {
    expect(bandVariant("/login/")).toBeNull();
    expect(bandVariant("/watchlist/")).toBe("slim");
  });

  it("hides exactly the named pages: an address under one, or one that only starts with the same letters, is not one of them", () => {
    // None of these is a real route; each draws the site's not-found page, which is an ordinary page.
    expect(bandVariant("/subscribe")).toBe("slim");
    expect(bandVariant("/subscribe/x")).toBe("slim");
    expect(bandVariant("/subscribe/confirm/x")).toBe("slim");
    expect(bandVariant("/unsubscribe/anything")).toBe("slim");
    expect(bandVariant("/login/x")).toBe("slim");
    expect(bandVariant("/offline-notes")).toBe("slim");
  });

  it("reads the two list pages with a trailing slash as themselves", () => {
    expect(bandVariant("/subscribe/confirm/")).toBeNull();
    expect(bandVariant("/unsubscribe/")).toBeNull();
  });
});
