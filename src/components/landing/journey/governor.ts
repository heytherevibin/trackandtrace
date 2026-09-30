// Adaptive quality (spec §3.C; prototype v3's governor.js). It watches the gaps between frames the drawing actually
// drew, only within one scroll gesture: a gap over 120 ms is a new gesture unless the page scrolled inside it (then it
// is one slow frame of the same gesture: a device drawing under 8 fps must still step down, spec §4), and idle() says a
// frame went by with nothing to draw (the gesture paused, or the drawing left the screen), so the next drawn frame
// starts a new gesture, scrolled or not. The p90 of the last 30–40 gaps over 26 ms steps quality down; over 40 ms at
// the lowest step asks for the still drawing; under 18.5 ms for 180 judgements steps back up, at most twice. Each
// change waits 45 frames before judging again (spec §3.C; v3 waited 60 after a step up). Pure: the live chapter feeds
// it frames and scrolls, and acts on its answers.

export const LONG_MS = 26;
export const SLOW_MS = 40;
export const PACE_MS = 18.5;

export interface Governor {
  level(): number;
  /** A frame was drawn at `now` (the rAF time). */
  drew(now: number): void;
  /** A frame went by with nothing to draw: the gesture paused. */
  idle(): void;
  /** The page scrolled: the gap the next drawn frame closes is the gesture's, however long. */
  scrolled(): void;
}

export interface GovernorOptions {
  readonly levels: number;
  readonly start?: number;
  readonly set: (level: number) => void;
  readonly floor: () => void;
}

export function createGovernor({ levels, start = 0, set, floor }: GovernorOptions): Governor {
  let level = Math.max(0, Math.min(start, levels - 1));
  let last = 0;
  let cool = 0;
  let good = 0;
  let ups = 0;
  let moved = false;
  const win: number[] = [];
  const p90 = (): number => [...win].sort((a, b) => a - b)[Math.floor(win.length * 0.9)] ?? 0;
  return {
    level: () => level,
    drew(now) {
      const gap = last ? now - last : 0;
      const scrolledIn = moved;
      last = now;
      moved = false;
      if (!gap || (gap > 120 && !scrolledIn)) return;
      win.push(gap);
      if (win.length > 40) win.shift();
      if (cool > 0) {
        cool -= 1;
        return;
      }
      if (win.length < 30) return;
      const slow = p90();
      if (slow > LONG_MS) {
        if (level < levels - 1) {
          level += 1;
          set(level);
        } else if (slow > SLOW_MS) floor();
        win.length = 0;
        cool = 45;
        good = 0;
      } else if (slow < PACE_MS && level > 0 && ups < 2) {
        good += 1;
        if (good > 180) {
          level -= 1;
          set(level);
          ups += 1;
          good = 0;
          cool = 45;
          win.length = 0;
        }
      } else good = 0;
    },
    idle() {
      last = 0;
    },
    scrolled() {
      moved = true;
    },
  };
}

/** This session's step (tt.q, a whole number below `levels`), or full quality. "still" is the drawing's reason, not a step. */
export function startLevel(stored: string | null, levels: number): number {
  const n = Number(stored);
  return stored !== null && Number.isInteger(n) && n >= 0 && n < levels ? n : 0;
}
