// What Sign out everywhere, Disable and Enable are bound to. Nothing here reaches the database or
// reads a header, so the browser imports it too: the dialog that mints a tap and the route that
// spends it build the same strings from this one file.
//
// EACH STRING HAS EXACTLY ONE FORM. A tap is a digest of four fields taken in the browser, and
// `console.use_tap` re-takes it in the database from the arguments it is called with.

/** The acts as the three `console_*_account` functions name them, and as their audit rows do. */
export const ACCOUNT_ACTS = {
  signOut: "Signed an account out everywhere",
  disable: "Disabled an account",
  enable: "Enabled an account",
} as const;

export type AccountAct = keyof typeof ACCOUNT_ACTS;
export const ACCOUNT_ACT_KINDS = ["signOut", "disable", "enable"] as const satisfies readonly AccountAct[];

/** An act's `value`: the deployment, so a tap minted under one approves nothing under another. */
export function accountActValue(environment: string): string {
  return JSON.stringify({ environment });
}
