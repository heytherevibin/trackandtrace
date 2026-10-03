// A link's glide, followed frame by frame (focus-glide.ts's watch; the review, 2026-10-02). It runs the whole way to its
// target, so "between where it began and its target" cannot tell the glide from the reader's own hand: a scrollbar's drag
// sends no wheel, touch, key or press. The browser's own glide goes on toward the end it set, never back, and does not
// stop short of it: a page that stands still far from that end, or goes back, for five frames in a row is the reader's.
//
// Nothing is taken up while such a doubt stands (doubting): a real glide clears it with its next moving frame (a loaded
// machine holds the page still for the two frames of a resize, then the glide goes on), and a held hand reaches five.
//
// Its speed is not judged. A frame slower than the one before was once a doubt (a "crawl"), measured between frames' own
// times; frames that bunch on a slow device made a sound frame look five times too fast and the next ones a crawl, and
// real glides were let go (8 runs in 560 at 6x CPU; and WebKit's, slowing through a resize's long frame: 3 in 3,440).
//
// What it cannot tell, as the bound:
// - a hand that moves the page on toward the target, at any speed, steady or slowing, reads as the glide for as long as
//   it moves; it is known once it stops short of the end. If a cut lands while it still moves, the glide is taken up
//   once, and the hand's next move cancels it;
// - a place-keeping jump ends the glide, the page standing still after it whoever was moving it, and any doubt with
//   it: only five frames of a page stopped short or going back say it is the reader's. So a hand that moved the page on
//   toward the target, then held it fewer than five frames before such a jump, is carried. Settling a doubt the jump
//   landed on for the reader was tried and dropped real glides: a resize holds Chromium's glide still for a frame, and
//   the place-keeping jump of the piece the reader is passing through lands on that one doubt (the re-review,
//   2026-10-03: 24 runs in 24 left short of 07, 08 or the terminal, the resize late in the glide).

/** Frames in a row the page stands still short of its end, or goes back, before it counts as the reader's. Fewer can be
 * the machine's: two at a resize under 6x CPU. Nothing is taken up meanwhile, so the wait costs a held reader nothing. */
const DOUBTS = 5;
/** How near its end a glide may stop without that being doubted: its own easing out, and its rest there, px. */
const NEAR = 64;

export interface GlideFollower {
  /** The page stands at `y` this frame: false once it is the reader's own move, not the glide's. */
  step(y: number): boolean;
  /** A place-keeping jump moved the page: its move is no one's, and the glide ended with it, any doubt with it. */
  jumped(): void;
  /** A frame or more have not been a glide's, and the next will say whose they were: nothing is taken up meanwhile. */
  doubting(): boolean;
  /** The page has moved toward the end at least once: a glide did begin. */
  begun(): boolean;
}

/** Follows a glide the browser is making from `from` to `end`, a frame at a time (rules above). */
export function followGlide(from: number, end: number): GlideFollower {
  const dir = end >= from ? 1 : -1;
  let lastY = from;
  let moving = false;
  let doubts = 0;
  let skip = false;
  let begun = false;
  return {
    step(y) {
      const d = (y - lastY) * dir;
      lastY = y;
      if (skip) {
        skip = false;
        moving = false;
        doubts = 0;
        return true;
      }
      if (Math.abs(end - y) < NEAR || d >= 1) {
        if (d >= 1) begun = moving = true;
        doubts = 0;
        return true;
      }
      // back up the page; or, once it was moving, stopped far from its end
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
