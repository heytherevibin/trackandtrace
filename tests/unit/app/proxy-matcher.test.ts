import { describe, expect, it } from "vitest";
import { config } from "@/proxy";

// The proxy refreshes Supabase sessions on page requests only: never on the API,
// static assets, or the /monitoring tunnel that carries error reports.

const [pattern] = config.matcher;
const matches = (path: string) => new RegExp(`^${pattern}$`).test(path);

describe("the proxy matcher", () => {
  it.each(["/", "/pnr", "/account", "/watchlist"])("runs on %s", (path) => {
    expect(matches(path)).toBe(true);
  });

  it.each(["/monitoring", "/api/pnr", "/_next/static/chunks/app.js", "/sw.js", "/brand/logo.svg"])("skips %s", (path) => {
    expect(matches(path)).toBe(false);
  });
});
