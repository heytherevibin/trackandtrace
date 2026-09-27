import { secondAngle } from "./geometry/clock";
import type { JourneyContext, Teardown } from "./start-journey";

// 04 · the station clock's second hand (spec §3.A): it sweeps every frame while the clock is on screen, and
// rests off it. React draws the hand without an angle; only this module turns it. Motion off: no second hand.
//
// StationClock reads the time on mount, after which the hand exists — but this module cannot pin that mount
// down relative to the idle-loaded journey chunk starting, so it looks the hand up fresh in the loop and on
// every intersection change rather than once at start, and observes the always-present clock figure rather
// than the hand itself. A late hydration then still gets a sweeping hand, instead of this module having
// already returned a no-op teardown for the whole build.

export function startClock({ motion }: JourneyContext): Teardown {
  const clock = document.querySelector<HTMLElement>(".station-clock");
  if (!clock || !motion) return () => {};
  const hand = () => clock.querySelector<SVGLineElement>(".clock-hand.is-second");
  let frame = 0;
  let visible = false;
  const loop = () => {
    hand()?.setAttribute("transform", `rotate(${secondAngle(new Date())})`);
    frame = visible ? requestAnimationFrame(loop) : 0;
  };
  const io = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false;
    if (visible && !frame) frame = requestAnimationFrame(loop);
  });
  io.observe(clock);
  loop();
  return () => {
    io.disconnect();
    cancelAnimationFrame(frame);
    hand()?.removeAttribute("transform");
  };
}
