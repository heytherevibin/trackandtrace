import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { config } from "@/proxy";

// Traveller hosts: pages only, never the API, static assets or the /monitoring tunnel (as before).
// The console host: everything but Next's own files, the tunnel and the icons.
// /console on any host: always, so the proxy can answer 404.

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe("the proxy matcher", () => {
  it.each(["https://trakline.in/", "https://trakline.in/pnr", "https://trakline.in/account", "https://trakline.in/watchlist"])("runs on the traveller page %s", (url) => {
    expect(matches(url)).toBe(true);
  });

  it.each(["https://trakline.in/monitoring", "https://trakline.in/api/pnr", "https://trakline.in/_next/static/chunks/app.js", "https://trakline.in/sw.js", "https://trakline.in/brand/mark.svg"])("skips %s", (url) => {
    expect(matches(url)).toBe(false);
  });

  it.each(["https://admin.trakline.in/", "https://admin.trakline.in/login", "https://admin.trakline.in/api/sign-in", "https://admin.trakline.in/robots.txt", "http://admin.localhost:4210/login"])("runs on the console page %s", (url) => {
    expect(matches(url)).toBe(true);
  });

  it.each(["https://admin.trakline.in/_next/static/chunks/app.js", "https://admin.trakline.in/monitoring", "https://admin.trakline.in/favicon.ico", "https://admin.trakline.in/icon.svg"])("lets the console host's %s through untouched", (url) => {
    expect(matches(url)).toBe(false);
  });

  it("always runs on /console, so it can refuse it", () => {
    expect(matches("https://trakline.in/console/login")).toBe(true);
  });
});
