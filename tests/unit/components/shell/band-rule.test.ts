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

  it("hides on a page under a hidden one, but not on a page that only starts with the same letters", () => {
    expect(bandVariant("/unsubscribe/anything")).toBeNull();
    expect(bandVariant("/subscribe")).toBeNull();
    expect(bandVariant("/offline-notes")).toBe("slim");
  });
});
