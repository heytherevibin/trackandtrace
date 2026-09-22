import { z } from "zod";

/**
 * What the member says they are about to present, so the browser opens the sheet that can actually
 * show it.
 *
 * Why this exists at all: with no preference on the registration options, the browser picks its own
 * default UI, and Safari's picks iCloud Keychain and never surfaces the security-key path -- so an
 * owner holding one Apple Passwords passkey could not add a YubiKey as their second key on the
 * default macOS browser, at the one step spec §D does not let them skip.
 *
 * Three things this is deliberately not:
 *
 * 1. It is **not** `ConsoleKeyType` (@/console/keys/webauthn), the type the row stores. That one is
 *    read off the credential that actually answered (`credentialDeviceType`/`credentialBackedUp`)
 *    and is the truth about the key; this one is a hint the client sends about which sheet to open.
 *    The two are kept in vocabularies that cannot be assigned to one another in either direction --
 *    camelCase here, snake_case there -- so a hint can never be mistaken for a stored type by the
 *    compiler, let alone by a reader.
 * 2. It is **not** trusted. It arrives on the wire from a browser, so every route parses it against
 *    `consoleKeyKind` below before it is passed on, and the only thing it is ever allowed to affect
 *    is `preferredAuthenticatorType` -- which browser UI appears, and nothing else.
 * 3. It is **not** the library's own vocabulary. `@simplewebauthn/server` knows three preferences
 *    ('securityKey', 'localDevice', 'remoteDevice'); the console offers two, and maps to them in
 *    one place (`registrationOptionsFor`). Keeping our two words ours is what keeps the set closed.
 *
 * This module imports nothing but zod on purpose: the picker and the browser half of the ceremony
 * both need these two values, and neither may pull `@simplewebauthn/server` into the bundle.
 */
export const consoleKeyKind = z.enum(["securityKey", "thisDevice"]);

export type ConsoleKeyKind = z.infer<typeof consoleKeyKind>;

/** The two kinds in the order they are offered. Sheet order: a security key first (ConsoleSetup.dc.html:94). */
export const CONSOLE_KEY_KINDS: readonly ConsoleKeyKind[] = consoleKeyKind.options;
