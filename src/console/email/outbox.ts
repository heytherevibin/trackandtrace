import type { ConsoleLetter } from "./send";

// Spec §I: under E2E=1 (never in production -- the environment check refuses it) console email goes
// to an in-memory outbox the end-to-end run reads instead of to Resend. One dev server, one module
// instance, so a plain array is the whole store. It is bounded because a long run would otherwise
// hold every letter it ever sent.
const LIMIT = 50;
let held: ConsoleLetter[] = [];

export const outbox = {
  put(letter: ConsoleLetter): void {
    held = [...held, letter].slice(-LIMIT);
  },
  /**
   * Oldest first. With no `to`, everything captured since the last read, and reading empties it.
   * With `to`, only that address's letters -- so one test cannot drain another's -- leaving every
   * non-matching letter in place, in order, for a later read.
   */
  take(to?: string): readonly ConsoleLetter[] {
    if (to === undefined) {
      const taken = held;
      held = [];
      return taken;
    }
    const matching = held.filter((letter) => letter.to === to);
    held = held.filter((letter) => letter.to !== to);
    return matching;
  },
  clear(): void {
    held = [];
  },
} as const;
