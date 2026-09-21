import { expect, test } from "../fixtures";

// One app, two hosts: the console lives only on its host, under its own policy.
test("the console host serves sign in with a nonce policy and no indexing", async ({ page }) => {
  const response = await page.goto("/login");
  expect(response?.status()).toBe(200);
  const policy = response?.headers()["content-security-policy"] ?? "";
  const scripts = policy.split("; ").find((d) => d.startsWith("script-src ")) ?? "";
  expect(scripts).toMatch(/'nonce-[^']+'/);
  expect(scripts).toContain("'strict-dynamic'");
  expect(scripts).not.toContain("'unsafe-inline'");
  expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
});

test("the console advertises no manifest, since its own CSP forbids one", async ({ page }) => {
  await page.goto("/login");
  expect(await page.locator('link[rel="manifest"]').count()).toBe(0);
});

test("every console response carries a fresh nonce", async ({ request }) => {
  const nonce = async () => /'nonce-([^']+)'/.exec((await request.get("/login")).headers()["content-security-policy"] ?? "")?.[1];
  expect(await nonce()).not.toBe(await nonce());
});

/**
 * This suite runs with NEXT_PUBLIC_SUPABASE_URL deliberately blank (playwright.config.ts's own
 * webServer env), so the console served here has no database at all: every page that needs a member
 * raises CONSOLE_UNAVAILABLE and reaches src/app/console/error.tsx. That is the behaviour /keys and
 * the catch-all were both narrowed to -- a console with wrong grants, or a database that is down,
 * must not look to a member like an ordinary sign-out -- and it is why this test no longer asserts
 * a redirect: it did, it stopped being true when /keys was narrowed, and it went unnoticed because
 * nothing in this branch's checks runs the traveller suite's console projects.
 *
 * "A signed-out visitor goes to sign in" is proved where a database exists, in
 * tests/e2e/console-auth/sign-in.spec.ts ("the link alone opens nothing"), which covers `/` and an
 * unknown console address alike. What is provable without one is the host routing itself.
 */
test("the console's home points into the console, and a traveller address is not one of its pages", async ({ request }) => {
  const home = await request.get("/", { maxRedirects: 0 });
  expect(home.status()).toBe(307);
  expect(home.headers()["location"]).toMatch(/\/keys$/);
  // /pnr answers 200 on the traveller host (tests/e2e/pages.spec.ts). On this one it reaches the
  // console's own catch-all, which needs a member -- so whatever it answers, it is never that page.
  expect((await request.get("/pnr", { maxRedirects: 0 })).status()).not.toBe(200);
});

test("robots are shut out of the console", async ({ request }) => {
  expect(await (await request.get("/robots.txt")).text()).toBe("User-agent: *\nDisallow: /\n");
});

test("the traveller host has no console, and the console has one address per page", async ({ request, baseURL }) => {
  // The traveller origin is this project's own console origin without its `admin.` prefix, not a
  // hardcoded port: one dev server serves both hosts, and which port it listens on is the config's
  // to choose. Hardcoded, this reached whatever happened to be on 4210 -- nothing, on a run the
  // brief pointed at another port, and someone else's checkout on a machine where 4210 was taken.
  const traveller = (baseURL ?? "http://admin.localhost:4210").replace("//admin.", "//");
  expect((await request.get(`${traveller}/console/login`)).status()).toBe(404);
  expect((await request.get("/console/login")).status()).toBe(404);
});

test("an unmatched address the proxy passes through still goes to sign in", async ({ request }) => {
  const response = await request.get("/brand/nope.svg", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers()["location"]).toMatch(/\/login$/);
});
