import { expect, expectSignedInAs, readOutbox, resetConsole, setUpFirstOwner, signOut, test } from "./fixtures";

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
  const owner = await setUpFirstOwner(page, baseURL ?? BASE);
  await expectSignedInAs(page, owner.name, owner.role);

  await signOut(page);
  await expect(page.getByRole("heading", { level: 1, name: "Console sign in" })).toBeVisible();

  await readOutbox(page, owner.email); // drain anything setup left behind for this address
  await page.getByLabel("Console email").fill(owner.email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

  await openTheLink(page, owner.email);
  await page.getByRole("button", { name: "Tap your key" }).click();
  await expectSignedInAs(page, owner.name, owner.role);
});

test("the link alone opens nothing: without a tap the console stays shut", async ({ page, baseURL }) => {
  const owner = await setUpFirstOwner(page, baseURL ?? BASE);
  await signOut(page);
  await readOutbox(page, owner.email);
  await page.getByLabel("Console email").fill(owner.email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await openTheLink(page, owner.email);

  // The link session exists but is not key-verified, so the console's home sends it back.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Console sign in" })).toBeVisible();

  // And an address the console does not have sends it back the same way, rather than showing the
  // not-found state inside a frame this visitor has not earned. This is the half of
  // src/app/console/[...missing]/page.tsx that only a real database can prove: it now redirects on
  // UNAUTHENTICATED alone and lets every other fault through to the error boundary, so a console
  // whose grants are wrong stops looking like an ordinary sign-out. The fixture-mode suite
  // (tests/e2e/console/host.spec.ts) has no database and so cannot reach this path at all.
  await page.goto("/pnr");
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
