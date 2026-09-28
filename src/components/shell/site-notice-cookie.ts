/**
 * Which notice this device closed: its version, nothing else. Functional, holds no personal data.
 * A plain module, not the strip's: the strip is "use client", and a server file importing a value
 * from a client module gets a reference, not the string (tests/unit/client-boundary.contract.test.ts).
 */
export const NOTICE_COOKIE = "tt_notice_closed";
