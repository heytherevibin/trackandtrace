import { expect, test } from "../fixtures";

// The end-to-end run's fixture pages (/e2e/…) exist only on Playwright's own `next dev` (E2E=1). A production build
// never carries E2E (env.ts refuses it there), so each is a 404 that draws nothing of its fixture.
test("/e2e/signed-in is a 404 in a production build, and draws no fixture traveller", async ({ request }) => {
  const response = await request.get("/e2e/signed-in");
  expect(response.status()).toBe(404);
  expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
  expect(await response.text()).not.toContain("Venkataramanan");
});
