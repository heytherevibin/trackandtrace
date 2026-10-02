// A link's glide, followed frame by frame (focus-glide.ts's watch; the review, 2026-10-02). It runs the whole way to its
// target, so "between where it began and its target" cannot tell the glide from the reader's own hand: a scrollbar's drag
// sends no wheel, touch, key or press. The browser's own glide goes on toward the end it set every frame, never back,
// never stopping short of it, never dropping to a crawl far from it.
//
// What it cannot tell (the re-review, 2026-10-02): a hand that moves the page steadily on toward the target reads as the
// glide for as long as it moves, at any speed; it is known once it stops short of the end, three frames on. So nothing
// is taken up while a doubt stands (doubting): a real glide clears it with its next frame, a held hand reaches three.
// What is left:
// - a hand still moving like a glide in the very frame a cut lands is taken up once, and its next move cancels that glide;
// - a place-keeping jump ends every doubt, since the page stands still after it whoever was moving it: a hand that
//   stopped less than three frames before one, or was moving like a glide until it, is carried. (Settling a doubt the
//   jump landed on for the reader let a real glide go instead: WebKit's, slowing through the resize's own long frame
//   1,800 px from its end, is doubted for that frame, and the run's place-keeping jump lands in it: 3 runs in 3,440.)

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
  /** A place-keeping jump moved the page: its move is no one's, and the glide ended with it, any doubt with it. */
  jumped(): void;
  /** A frame or two have not been a glide's, and the next will say whose they were: nothing is taken up meanwhile. */
  doubting(): boolean;
  /** The page has moved toward the end at least once: a glide did begin. */
  begun(): boolean;
}

/** Follows a glide the browser is making from `from` to `end`, a frame at a time (rules above). Its speed is measured
 * between frames' own times, so the first frame has none. */
export function followGlide(from: number, end: number): GlideFollower {
  const dir = end >= from ? 1 : -1;
  let lastY = from;
  let lastT: number | null = null;
  let speed = 0; // the last sound frame's, px per ms
  let moving = false;
  let doubts = 0;
  let skip = false;
  let begun = false;
  return {
    step(y, now) {
      const d = (y - lastY) * dir;
      const v = lastT === null ? 0 : d / Math.max(1, now - lastT);
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
      const sound = d >= 1 && !(moving && v < speed * CRAWL);
      if (sound) {
        begun = true;
        moving = true;
        speed = v;
        doubts = 0;
        return true;
      }
      // back up the page; or, once it was moving, stopped or crawling far from its end
      if (d <= -1 || moving) doubts += 1;
      return doubts < DOUBTS;
    },
    jumped() {
      skip = true;
      doubts = 0;
    },
    doubting: () => doubts > 0,
    begun: () => begun,
  };
}
