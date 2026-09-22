import { addVirtualKey, chooseKeyKind, expect, expectSignedInAs, firstOwnerLink, ownerIdentity, resetConsole, swapAuthenticatorAfterTap, test } from "./fixtures";

const BASE = "http://admin.localhost:4211";

test.beforeEach(() => resetConsole());

test("the first Owner sets up with two keys and lands in the console", async ({ page, baseURL }) => {
  const email = `owner-${Date.now()}@trakline.in`;
  const firstKey = await addVirtualKey(page, "usb");
  await page.goto(firstOwnerLink(email, baseURL ?? BASE));

  await expect(page.getByText("Step 1 of 3")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add your first key" })).toBeVisible();
  await chooseKeyKind(page, "usb");
  await page.getByLabel("Name this key").fill("YubiKey 5C");
  await page.getByRole("button", { name: "Add key" }).click();

  await expect(page.getByRole("heading", { name: "Add a second key" })).toBeVisible();
  // A second, genuinely different key: swapped in for the first right after its tap is spent (see
  // swapAuthenticatorAfterTap -- Chromium's virtual authenticator excludes across every attached
  // authenticator at once, so both can never be present for the registration half of this step).
  await swapAuthenticatorAfterTap(page, firstKey, "internal");
  await chooseKeyKind(page, "internal");
  await page.getByLabel("Name this key").fill("iPhone");
  await page.getByRole("button", { name: "Add key" }).click();

  await expect(page.getByRole("heading", { name: "You're set up" })).toBeVisible();
  await page.getByRole("button", { name: "Open the console" }).click();
  // Not a top-level Sign out button (that moved into the member menu in Task 4) and not an
  // assertion about "/"'s own interim page (about to be replaced next task) -- the frame itself,
  // which stays true either way.
  const { name, role } = ownerIdentity(email);
  await expectSignedInAs(page, name, role);
});

test("the same key twice is refused", async ({ page, baseURL }) => {
  const email = `owner-same-${Date.now()}@trakline.in`;
  await addVirtualKey(page, "usb");
  await page.goto(firstOwnerLink(email, baseURL ?? BASE));
  await chooseKeyKind(page, "usb");
  await page.getByLabel("Name this key").fill("YubiKey 5C");
  await page.getByRole("button", { name: "Add key" }).click();

  await expect(page.getByRole("heading", { name: "Add a second key" })).toBeVisible();
  // No second authenticator this time: the only key present is the one already added.
  await chooseKeyKind(page, "usb");
  await page.getByLabel("Name this key").fill("YubiKey 5C again");
  await page.getByRole("button", { name: "Add key" }).click();
  // Scoped to the plate, not the bare page: Next's route announcer (role="alert", announcing the
  // page title after every navigation) is a second, unrelated match for an unscoped getByRole("alert").
  // Chromium's virtual authenticator refuses this one in the browser itself before any request is
  // made -- confirmed independent of this app -- so this is client.ts's own InvalidStateError mapping
  // on trial, not the server's refusal: only the sheet's line is acceptable now that runCeremony maps
  // the browser's "The authenticator was previously registered" to it rather than passing it through.
  const alert = page.getByRole("region", { name: "Add a second key" }).getByRole("alert");
  await expect(alert).toContainText("That key is already added. Use a different one.");
});

test("a setup link works once", async ({ page, baseURL }) => {
  const email = `owner-once-${Date.now()}@trakline.in`;
  const link = firstOwnerLink(email, baseURL ?? BASE);
  await addVirtualKey(page);
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Add your first key" })).toBeVisible();

  // A new browser CONTEXT, not just a new page: /setup resolves an existing link session before it
  // ever looks at ?token= (a session beats a token, so a live one can't be overwritten by a stale
  // link -- see src/app/console/setup/page.tsx), and a second page in the SAME context would share
  // the first page's cookie and inherit that live session instead of attempting to redeem the spent
  // token at all. A separate context has no cookie, so this is a genuine second redemption attempt.
  const browserInstance = page.context().browser();
  if (!browserInstance) throw new Error("no browser instance available for a fresh context");
  const secondContext = await browserInstance.newContext();
  const second = await secondContext.newPage();
  await second.goto(link);
  await expect(second.getByText("This invite has expired. Ask an Owner to send a new one.")).toBeVisible();
  await secondContext.close();
});
