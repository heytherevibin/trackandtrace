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

test("the console's home and unknown addresses go to sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/pnr");
  await expect(page).toHaveURL(/\/login$/);
});

test("robots are shut out of the console", async ({ request }) => {
  expect(await (await request.get("/robots.txt")).text()).toBe("User-agent: *\nDisallow: /\n");
});

test("the traveller host has no console, and the console has one address per page", async ({ request }) => {
  expect((await request.get("http://localhost:4210/console/login")).status()).toBe(404);
  expect((await request.get("/console/login")).status()).toBe(404);
});

test("an unmatched address the proxy passes through still goes to sign in", async ({ request }) => {
  const response = await request.get("/brand/nope.svg", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers()["location"]).toMatch(/\/login$/);
});
