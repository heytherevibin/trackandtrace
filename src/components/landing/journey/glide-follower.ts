// A link's glide, followed frame by frame (focus-glide.ts's watch; the review, 2026-10-02). It runs the whole way to its
// target, so "between where it began and its target" cannot tell the glide from the reader's own hand: a scrollbar's drag
// sends no wheel, touch, key or press. The browser's own glide goes on toward the end it set every frame, never back,
// never stopping short of it, never dropping to a crawl far from it.

/** Frames in a row that are not a glide's (followGlide) before the page counts as the reader's. One or two can be the
 * machine's (a frame the scroll did not advance in, under load). */
const DOUBTS = 3;
/** How near its end a glide may slow or stop without that being doubted: its own easing out, px. */
const NEAR = 64;
/** A frame's speed below this share of the last sound frame's, far from the end, is a crawl: no glide slows so there. */
const CRAWL = 0.25;

export interface GlideFollower {
  /** The page stands at `y` at `now` (ms): false once it is the reader's own move, not the glide's. */
  step(y: number, now: number): boolean;
  /** A place-keeping jump moved the page: its move is no one's, and the glide ended with it. */
  jumped(): void;
}

/** Follows a glide the browser is making from `from` to `end`, a frame at a time (rules above). */
export function followGlide(from: number, end: number, at: number): GlideFollower {
  const dir = end >= from ? 1 : -1;
  let lastY = from;
  let lastT = at;
  let speed = 0; // the last sound frame's, px per ms
  let moving = false;
  let doubts = 0;
  let skip = false;
  return {
    step(y, now) {
      const d = (y - lastY) * dir;
      const dt = Math.max(1, now - lastT);
      lastY = y;
      lastT = now;
      if (skip) {
        skip = false;
        moving = false;
        doubts = 0;
        return true;
      }
      if (Math.abs(end - y) < NEAR) {
        doubts = 0;
        return true;
      }
      const sound = d >= 1 && !(moving && d / dt < speed * CRAWL);
      if (sound) {
        moving = true;
        speed = d / dt;
        doubts = 0;
        return true;
      }
      // back up the page; or, once it was moving, stopped or crawling far from its end
      if (d <= -1 || moving) doubts += 1;
      return doubts < DOUBTS;
    },
    jumped() {
      skip = true;
    },
  };
}
