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
  /** Everything captured since the last read, oldest first. Reading empties it. */
  take(): readonly ConsoleLetter[] {
    const taken = held;
    held = [];
    return taken;
  },
  clear(): void {
    held = [];
  },
} as const;
