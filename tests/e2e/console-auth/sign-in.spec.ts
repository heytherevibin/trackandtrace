import { expect, readOutbox, resetConsole, setUpFirstOwner, test } from "./fixtures";

const BASE = "http://admin.localhost:4211";

test.beforeEach(() => resetConsole());

/**
 * Follows the one sign-in link sent to `email`, or fails saying what was there instead.
 *
 * `readOutbox`'s own `to` filter removes the matching letter as it returns it (by design, so two
 * specs signing in at once can't swallow each other's mail) -- so the poll below has to keep
 * whatever letters its own read finds, in `found`, rather than reading a second time afterward: a
 * second read past the one that first satisfies the poll finds nothing, because the first read
 * already took it.
 */
async function openTheLink(page: Parameters<typeof readOutbox>[0], email: string): Promise<void> {
  let found: Awaited<ReturnType<typeof readOutbox>> = [];
  await expect
    .poll(
      async () => {
        found = await readOutbox(page, email);
        return found.length;
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);
  const [letter] = found;
  expect(letter?.subject).toBe("Your Trakline console sign-in link");
  const link = /https?:\/\/\S+\/auth\/confirm\S+/.exec(letter?.text ?? "")?.[0];
  expect(link, `no confirm link in: ${letter?.text}`).toBeTruthy();
  await page.goto(String(link));
}

test("a member signs out and back in with the link and a tap", async ({ page, baseURL }) => {
  const email = await setUpFirstOwner(page, baseURL ?? BASE);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Console sign in" })).toBeVisible();

  await readOutbox(page, email); // drain anything setup left behind for this address
  await page.getByLabel("Console email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

  await openTheLink(page, email);
  await page.getByRole("button", { name: "Tap your key" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("the link alone opens nothing: without a tap the console stays shut", async ({ page, baseURL }) => {
  const email = await setUpFirstOwner(page, baseURL ?? BASE);
  await page.getByRole("button", { name: "Sign out" }).click();
  await readOutbox(page, email);
  await page.getByLabel("Console email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await openTheLink(page, email);

  // The link session exists but is not key-verified, so the console's home sends it back.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Console sign in" })).toBeVisible();
});

test("a stranger's address gets the same answer and no letter", async ({ page }) => {
  const stranger = `stranger-${Date.now()}@example.com`;
  await page.goto("/login");
  await page.getByLabel("Console email").fill(stranger);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("If this address belongs to a console member, a sign-in link is on its way.")).toBeVisible();
  // The send runs in after(), so give it longer than it could possibly need before saying nothing came.
  await page.waitForTimeout(2000);
  expect(await readOutbox(page, stranger)).toEqual([]);
});
