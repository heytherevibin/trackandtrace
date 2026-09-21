import { execFileSync } from "node:child_process";
import { test as base, type Page } from "@playwright/test";

export interface VirtualKey {
  readonly id: string;
  remove(): Promise<void>;
  /** Toggles `automaticPresenceSimulation` without detaching the authenticator (see below). */
  setPresent(enabled: boolean): Promise<void>;
}

/**
 * Chromium's virtual authenticator, over CDP. `automaticPresenceSimulation` makes it answer every
 * prompt, and `isUserVerified` makes it claim the touch our options only prefer.
 */
export async function addVirtualKey(page: Page, transport: "usb" | "internal" = "usb"): Promise<VirtualKey> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport,
      hasResidentKey: false,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return {
    id: authenticatorId,
    remove: () => cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId }).then(() => undefined),
    setPresent: (enabled) => cdp.send("WebAuthn.setAutomaticPresenceSimulation", { authenticatorId, enabled }).then(() => undefined),
  };
}

/**
 * Registering a second-or-later key always taps an existing one first, then excludes it, in one
 * browser call with no pause a test can step into between the two -- so the first key's authenticator
 * has to be swapped out for a fresh one at exactly that boundary. Verified directly against a bare
 * `navigator.credentials.create()`, independent of this app, and confirmed with CDP's own
 * `WebAuthn.getCredentials` (not just trusting the id `create()` returns): Chromium's virtual
 * authenticator checks `excludeCredentials` against every authenticator currently attached, not only
 * whichever one would go on to serve the ceremony, even when the excluded credential is a real one a
 * prior ceremony genuinely registered -- so with both attached at once, the tap succeeds but the
 * registration that follows it fails. A single attached authenticator that already holds the excluded
 * credential still correctly refuses on its own (spec-compliant, and exactly what "the same key twice
 * is refused" below relies on) -- the failure is specific to two being present together, and turning
 * off the excluded one's presence simulation (removal isn't even necessary) is enough to clear it,
 * confirmed in isolation every time this was tried.
 *
 * That fix intervening from a `page.route` on `/api/keys/verify`'s own network round trip
 * reproduced the original failure anyway, consistently -- every isolated success above intervenes at
 * the JS call boundary instead (between an assertion and the following `create()`, in one continuous
 * chain), never at the network layer, and swapping there is what actually works against this app's
 * own click too. `navigator.credentials.create` is wrapped once, before the ceremony that needs it:
 * the wrapped version performs the swap only the first time it sees a call whose own
 * `excludeCredentials` is non-empty (the tap's assertion doesn't call `create` at all, and the first
 * key's own registration has nothing to exclude), then defers to the real implementation.
 */
export async function swapAuthenticatorAfterTap(page: Page, spent: VirtualKey, transport: "usb" | "internal"): Promise<void> {
  let swapped = false;
  await page.exposeFunction("__ttSwapBeforeExclude", async () => {
    if (swapped) return;
    swapped = true;
    await spent.setPresent(false);
    await addVirtualKey(page, transport);
  });
  await page.evaluate(() => {
    const real = navigator.credentials.create.bind(navigator.credentials);
    navigator.credentials.create = (async (options?: CredentialCreationOptions) => {
      const excludeCredentials = options?.publicKey?.excludeCredentials;
      if (excludeCredentials && excludeCredentials.length > 0) {
        await (window as unknown as { __ttSwapBeforeExclude: () => Promise<void> }).__ttSwapBeforeExclude();
      }
      return real(options);
    }) as typeof navigator.credentials.create;
  });
}

/** The letters the console captured since the last read (src/app/console/api/test-outbox). */
export async function readOutbox(page: Page, to?: string): Promise<readonly { to: string; subject: string; text: string }[]> {
  // Always ask for one address when you have one: an unfiltered read drains the whole outbox, so
  // two specs signing in at once would each be able to swallow the other's letter. With `to`, the
  // route hands back only that address's letters and puts the rest back.
  const path = to ? `/api/test-outbox?to=${encodeURIComponent(to)}` : "/api/test-outbox";
  const response = await page.request.get(path);
  const body = (await response.json()) as { letters?: { to: string; subject: string; text: string }[] };
  return body.letters ?? [];
}

const DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function sql(statement: string): string {
  return execFileSync("psql", [DB, "-t", "-A", "-c", statement], { encoding: "utf8" }).trim();
}

/**
 * A console with no Owner. `console.create_first_owner_link` refuses to issue a link once one
 * exists, so every test that sets an Owner up needs the console emptied first. Deleting members
 * cascades to their keys, sessions and challenges; the audit log is untouched, because it holds no
 * foreign keys at all -- which is exactly what 2b built it for.
 */
export function resetConsole(): void {
  sql("delete from console.members; delete from console.setup_links;");
}

/** The one statement spec §8 says only the owner runs, here run by the test instead. */
export function firstOwnerLink(email: string, baseUrl: string): string {
  return sql(`select console.create_first_owner_link('${email}', '${baseUrl}')`);
}

/** The whole first-Owner journey through the UI, for a fresh address. Returns that address. */
export async function setUpFirstOwner(page: Page, baseUrl: string): Promise<string> {
  const email = `owner-${Date.now()}-${Math.floor(Math.random() * 1e6)}@trakline.in`;
  const firstKey = await addVirtualKey(page, "usb");
  await page.goto(firstOwnerLink(email, baseUrl));
  await page.getByLabel("Name this key").fill("YubiKey 5C");
  await page.getByRole("button", { name: "Add key" }).click();
  await page.getByRole("heading", { name: "Add a second key" }).waitFor();
  // A second, genuinely different key: swapped in for the first right after its tap is spent.
  await swapAuthenticatorAfterTap(page, firstKey, "internal");
  await page.getByLabel("Name this key").fill("iPhone");
  await page.getByRole("button", { name: "Add key" }).click();
  await page.getByRole("button", { name: "Open the console" }).click();
  return email;
}

export const test = base;
export { expect } from "@playwright/test";
