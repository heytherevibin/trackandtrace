import { execFileSync } from "node:child_process";
import { expect, test as base, type Page } from "@playwright/test";
import { consoleMessages } from "@/console/messages";
import { nameFromAddress } from "@/console/setup/redeem";

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
 * own click too. `navigator.credentials.create` is wrapped once per call, before the ceremony that
 * needs it: the wrapped version performs the swap only the first time it sees a call whose own
 * `excludeCredentials` is non-empty (the tap's assertion doesn't call `create` at all, and the first
 * key's own registration has nothing to exclude), then defers to whatever was there before it (the
 * real implementation, or an earlier call's own wrapper).
 *
 * Callable more than once on the same page -- a member adding a third key while signed in needs a
 * second swap, on top of the one `setUpFirstOwner` already spends getting the member to two -- so the
 * exposed bridge function is named uniquely per call (`page.exposeFunction` throws "has been already
 * registered" on a second call with the same name, and nothing resets that registry short of a fresh
 * page). `onSwapped`, if given, is told the freshly attached authenticator once the swap actually
 * fires -- not when this function returns, which only arms the hook -- so a caller that needs to swap
 * again later (see setUpFirstOwner's own `secondKey`) has a handle to what is now the present one.
 */
let swapBindingCounter = 0;

export async function swapAuthenticatorAfterTap(
  page: Page,
  spent: VirtualKey,
  transport: "usb" | "internal",
  onSwapped?: (next: VirtualKey) => void,
): Promise<void> {
  const bindingName = `__ttSwapBeforeExclude${swapBindingCounter++}`;
  let swapped = false;
  await page.exposeFunction(bindingName, async () => {
    if (swapped) return;
    swapped = true;
    await spent.setPresent(false);
    const next = await addVirtualKey(page, transport);
    onSwapped?.(next);
  });
  await page.evaluate((name) => {
    const real = navigator.credentials.create.bind(navigator.credentials);
    navigator.credentials.create = (async (options?: CredentialCreationOptions) => {
      const excludeCredentials = options?.publicKey?.excludeCredentials;
      if (excludeCredentials && excludeCredentials.length > 0) {
        await (window as unknown as Record<string, () => Promise<void>>)[name]();
      }
      return real(options);
    }) as typeof navigator.credentials.create;
  }, bindingName);
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
 * A direct read against the local database, for the handful of things this console has no UI or API
 * for yet -- the audit log (module 14, `built: false`) chief among them. `resetConsole` and
 * `firstOwnerLink` already reach the database this way for setup; this is the same `psql` call,
 * exported for a spec's own assertions rather than kept private to this file.
 */
export function consoleSql(statement: string): string {
  return sql(statement);
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

export interface SignedInOwner {
  readonly email: string;
  readonly name: string;
  readonly role: string;
  /**
   * The first key's own authenticator: still attached, but with presence simulation switched off by
   * the swap that let the second key register. Handed back so a spec that must leave this browser
   * with *no* authenticator at all can detach it too -- switched-off is not the same as gone, and a
   * spec proving an action cannot happen without a ceremony has to be able to say the stronger thing.
   */
  readonly firstKey: VirtualKey;
  /**
   * The second key's own authenticator, still attached and present (setUpFirstOwner never turns it
   * back off). A spec that adds a third key while this owner is signed in needs a handle to whichever
   * authenticator is currently present, to swap it out before the third key's own registration --
   * the same hazard swapAuthenticatorAfterTap's own doc comment describes, one key later.
   */
  readonly secondKey: VirtualKey;
}

/**
 * The name and role label a first Owner's own address resolves to -- the same derivation
 * `src/console/setup/redeem.ts`'s `nameFromAddress` and `consoleMessages.frame.roleLabel.owner`
 * give the app itself, reused rather than duplicated so a spec that builds its own email (not
 * through `setUpFirstOwner`) can still name its member and role in one place, not two.
 */
export function ownerIdentity(email: string): { readonly name: string; readonly role: string } {
  return { name: nameFromAddress(email), role: consoleMessages.frame.roleLabel.owner };
}

/**
 * The signed-in frame, proven by the one thing that stays true as "/" changes hands (My keys next
 * task, Overview in 2f): the member menu trigger, which names the member and their role
 * (consoleMessages.frameSignedIn.member.openMenu, member-menu.tsx:58). Not "a Sign out button
 * exists" -- that stopped being a top-level button when Task 4 put it in the menu, and would break
 * again next task regardless, since it was only ever a proxy for this.
 */
export async function expectSignedInAs(page: Page, name: string, role: string): Promise<void> {
  await expect(page.getByRole("button", { name: `${name}, ${role}. Open the member menu` })).toBeVisible();
}

/**
 * Sign out is inside the member menu (Main.dc.html's own drawing), so open it first. The item's
 * role is `menuitem`, confirmed against @base-ui/react's own source
 * (menu/item/useMenuItemCommonProps.js hardcodes `role: 'menuitem'`) and against the rendered DOM,
 * not assumed.
 */
export async function signOut(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Open the member menu/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
}

/** The whole first-Owner journey through the UI, for a fresh address. */
export async function setUpFirstOwner(page: Page, baseUrl: string): Promise<SignedInOwner> {
  const email = `owner-${Date.now()}-${Math.floor(Math.random() * 1e6)}@trakline.in`;
  const firstKey = await addVirtualKey(page, "usb");
  await page.goto(firstOwnerLink(email, baseUrl));
  await page.getByLabel("Name this key").fill("YubiKey 5C");
  await page.getByRole("button", { name: "Add key" }).click();
  await page.getByRole("heading", { name: "Add a second key" }).waitFor();
  // A second, genuinely different key: swapped in for the first right after its tap is spent.
  let secondKey: VirtualKey | undefined;
  await swapAuthenticatorAfterTap(page, firstKey, "internal", (next) => {
    secondKey = next;
  });
  await page.getByLabel("Name this key").fill("iPhone");
  await page.getByRole("button", { name: "Add key" }).click();
  await page.getByRole("button", { name: "Open the console" }).click();
  if (!secondKey) throw new Error("swapAuthenticatorAfterTap never swapped in the second key");
  return { email, ...ownerIdentity(email), firstKey, secondKey };
}

export const test = base;
export { expect };
