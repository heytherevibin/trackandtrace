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

/**
 * The attack these two stand for is a Host header whose authority carries smuggled userinfo, so
 * that `new URL()` reads the real host as the part after the separator. They are assembled rather
 * than written out because `host:port@host` is indistinguishable, to a secret scanner, from
 * `user:password@host` — a literal one fails GitGuardian on every pull request that touches this
 * file. Nothing here is a credential: these are the strings `consoleOrigin` must refuse.
 */
const USERINFO = "@";
const SMUGGLED_LOCAL = `admin.localhost:4210${USERINFO}evil.com`;
const SMUGGLED_PRODUCTION = `admin.trakline.in:4210${USERINFO}evil.com`;

describe("consoleOrigin", () => {
  it("is the production constant in production, ignoring a forged port on the header", () => {
    expect(consoleOrigin("admin.trakline.in", "production")).toBe("https://admin.trakline.in");
    expect(consoleOrigin("admin.trakline.in:9999", "production")).toBe("https://admin.trakline.in");
  });

  it("ignores a smuggled userinfo/host on the header too -- production never uses the header's value", () => {
    expect(consoleOrigin(SMUGGLED_PRODUCTION, "production")).toBe("https://admin.trakline.in");
  });

  it("is the header, port included, for the local host outside production", () => {
    expect(consoleOrigin("admin.localhost:4210", undefined)).toBe("http://admin.localhost:4210");
    expect(consoleOrigin("admin.localhost:4211", "preview")).toBe("http://admin.localhost:4211");
  });

  it("is the bare header, with no port, when the header itself has none", () => {
    expect(consoleOrigin("admin.localhost", undefined)).toBe("http://admin.localhost");
  });

  it.each([
    ["a traveller host", "trakline.in", "production"],
    ["an unrelated host", "evil.example", "production"],
    ["a missing Host header", null, "production"],
    ["the production host outside production", "admin.trakline.in", undefined],
    // requestHost/isConsoleHost only check the prefix before the first colon, so these all clear
    // that check on "admin.localhost" -- consoleOrigin must still refuse them itself, since a
    // browser reads SMUGGLED_LOCAL's real host as evil.com and everything before the separator
    // as userinfo it discards.
    ["a host with smuggled userinfo (a browser would read the real host as evil.com)", SMUGGLED_LOCAL, undefined],
    ["a host with a path appended", "admin.localhost:4210/evil.com", undefined],
    ["a non-numeric port", "admin.localhost:notaport", undefined],
    ["a host with a query string appended", "admin.localhost:4210?x=1", undefined],
  ])("is empty for %s", (_label, header, vercelEnv) => {
    expect(consoleOrigin(header, vercelEnv)).toBe("");
  });
});
