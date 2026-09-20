import { describe, expect, it } from "vitest";
import { consoleHostFor, consoleOrigin, isConsoleHost, requestHost } from "@/console/hosts";

describe("requestHost", () => {
  it.each([
    ["admin.trakline.in", "admin.trakline.in"],
    ["ADMIN.Trakline.in:443", "admin.trakline.in"],
    ["admin.localhost:4210", "admin.localhost"],
    [" trakline.in ", "trakline.in"],
    // Next strips the port by taking everything before the first colon, so an empty port (a
    // colon with nothing after it) still reads as the bare host, not a malformed one.
    ["admin.localhost:", "admin.localhost"],
  ])("reads %j as %j", (header, host) => {
    expect(requestHost(header)).toBe(host);
  });

  it.each([null, "", "[::1]:4210", "admin.trakline.in/evil", "a b"])("refuses %j", (header) => {
    expect(requestHost(header)).toBeNull();
  });
});

describe("the console host", () => {
  it("is admin.trakline.in in production and admin.localhost everywhere else", () => {
    expect(consoleHostFor("production")).toBe("admin.trakline.in");
    expect(consoleHostFor("preview")).toBe("admin.localhost");
    expect(consoleHostFor(undefined)).toBe("admin.localhost");
  });

  it("matches only this deployment's own console host", () => {
    expect(isConsoleHost("admin.trakline.in", "production")).toBe(true);
    expect(isConsoleHost("admin.localhost:4210", undefined)).toBe(true);
    expect(isConsoleHost("admin.localhost:4210", "production")).toBe(false);
    expect(isConsoleHost("admin.trakline.in", "preview")).toBe(false);
    expect(isConsoleHost("trakline.in", "production")).toBe(false);
    expect(isConsoleHost("admin.trakline.in.evil.com", "production")).toBe(false);
  });
});

describe("consoleOrigin", () => {
  it("is the production constant in production, ignoring a forged port on the header", () => {
    expect(consoleOrigin("admin.trakline.in", "production")).toBe("https://admin.trakline.in");
    expect(consoleOrigin("admin.trakline.in:9999", "production")).toBe("https://admin.trakline.in");
  });

  it("is the header, port included, for the local host outside production", () => {
    expect(consoleOrigin("admin.localhost:4210", undefined)).toBe("http://admin.localhost:4210");
    expect(consoleOrigin("admin.localhost:4211", "preview")).toBe("http://admin.localhost:4211");
  });

  it.each([
    ["a traveller host", "trakline.in", "production"],
    ["an unrelated host", "evil.example", "production"],
    ["a missing Host header", null, "production"],
    ["the production host outside production", "admin.trakline.in", undefined],
  ])("is empty for %s", (_label, header, vercelEnv) => {
    expect(consoleOrigin(header, vercelEnv)).toBe("");
  });
});
