import { describe, expect, it } from "vitest";
import { followGlide } from "@/components/landing/journey/glide-follower";

describe("a glide, followed frame by frame (followGlide)", () => {
  /** A glide of `frames` frames from 1,000 to 9,000, eased in and out: where it stands at each. */
  const eased = (frames: number): readonly number[] => Array.from({ length: frames }, (_, k) => 1000 + 8000 * (0.5 - Math.cos((Math.PI * (k + 1)) / frames) / 2));
  const follow = (ys: readonly number[]): readonly boolean[] => {
    const follower = followGlide(1000, 9000);
    return ys.map((y) => follower.step(y));
  };

  it("follows the browser's own glide to its end, slow (150 frames) or quick (10), easing in and out", () => {
    expect(follow(eased(150)).every(Boolean)).toBe(true);
    expect(follow(eased(10)).every(Boolean)).toBe(true);
  });

  // A loaded machine holds the page still through a resize's frames, then the glide goes on, faster for a frame and
  // slower after: at 6x CPU, two still frames, and frames that bunch. Its speed is not judged.
  it("follows it through frames the scroll did not advance in (four in a row), and through any change of pace", () => {
    const ys = eased(60);
    const stalled = [...ys.slice(0, 20), ys[19]!, ys[19]!, ys[19]!, ys[19]!, ...ys.slice(24)];
    expect(follow(stalled).every(Boolean)).toBe(true);
    expect(follow([1183, 1261, 1261, 1261, 1566, 1611, 1685, 1803, 2533]).every(Boolean)).toBe(true); // the trace it was let go on
  });

  it("knows a page held still short of the end, and a drag back up the page: five frames, and it is the reader's", () => {
    expect(follow([1300, 1300, 1300, 1300, 1300, 1300])).toEqual([true, true, true, true, true, false]);
    expect(follow([1300, 1293, 1286, 1279, 1272, 1265])).toEqual([true, true, true, true, true, false]);
  });

  it("takes a hand that moves on toward the end for the glide while it moves, and knows it once it stops", () => {
    // three frames of the glide, then the bar: 400 px on in a frame, 7 px a frame after, and held
    const ys = [...eased(150).slice(0, 3), 1400, 1407, 1414, 1421, 1421, 1421, 1421, 1421, 1421];
    expect(follow(ys)).toEqual([true, true, true, true, true, true, true, true, true, true, true, false]);
  });

  it("doubts nothing near the end: the glide's own easing out, and its rest there", () => {
    expect(follow([5000, 8950, 8950.2, 8950.3, 8950.3, 8950.3, 8950.3, 8950.3, 9000, 9000]).every(Boolean)).toBe(true);
  });

  it("says while a doubt stands, and that it clears with the next frame of the glide", () => {
    const follower = followGlide(1000, 9000);
    follower.step(1300);
    expect(follower.doubting()).toBe(false);
    follower.step(1300);
    expect(follower.doubting()).toBe(true);
    follower.step(1340);
    expect(follower.doubting()).toBe(false);
  });

  it("says once the page has moved toward the end: a glide did begin", () => {
    const follower = followGlide(1000, 9000);
    follower.step(1000);
    expect(follower.begun()).toBe(false);
    follower.step(1002);
    expect(follower.begun()).toBe(true);
  });

  // A place-keeping jump lands on a doubt. Settled for the reader, it dropped real glides: a resize holds Chromium's
  // glide still for a frame, and the jump of the piece the reader is passing through lands on that doubt (the trace:
  // 5,985, still, then a jump to 5,641). The jump ends the doubt; only five frames say a hand.
  it("ends a doubt a place-keeping jump lands on: a frame the resize held the glide still in", () => {
    const follower = followGlide(1000, 9000);
    follower.step(5985);
    follower.step(5985); // the resize's still frame: a doubt
    follower.jumped();
    expect(follower.doubting()).toBe(false);
    expect([follower.step(5641), follower.step(5641), follower.step(5700), follower.step(5800)]).toEqual([true, true, true, true]);
  });

  it("knows a held hand after a jump only by its own five frames", () => {
    const follower = followGlide(1000, 9000);
    follower.step(1300);
    follower.step(1300);
    follower.jumped();
    expect([1, 2, 3, 4, 5, 6].map(() => follower.step(700))).toEqual([true, true, true, true, true, true]); // moving: false after a jump
    const held = followGlide(1000, 9000);
    held.step(1300);
    expect([1, 2, 3, 4, 5].map(() => held.step(1300))).toEqual([true, true, true, true, false]);
  });

  // WebKit's scroll anchoring moves the page back as the click changes the address, before the glide has begun.
  it("takes a step back before the glide has begun for the browser's own", () => {
    const follower = followGlide(1000, 9000);
    expect(follower.step(960)).toBe(true);
    expect([follower.step(960), follower.step(1400)]).toEqual([true, true]);
  });

  it("takes a place-keeping jump's move for no one's: the glide ended with it, and the page standing still is no drag", () => {
    const follower = followGlide(1000, 9000);
    expect(follower.step(1300)).toBe(true);
    follower.jumped();
    expect([follower.step(700), follower.step(700), follower.step(700), follower.step(700), follower.step(700), follower.step(700)]).toEqual([true, true, true, true, true, true]);
  });
});
