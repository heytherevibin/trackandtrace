import { secondAngle } from "./geometry/clock";
import type { JourneyContext, Teardown } from "./start-journey";

// 04 · the station clock's second hand (spec §3.A): it sweeps every frame while the clock is on screen, and
// rests off it. React draws the hand without an angle; only this module turns it. Motion off: no second hand.

export function startClock({ motion }: JourneyContext): Teardown {
  const hand = document.querySelector<SVGLineElement>(".station-clock .clock-hand.is-second");
  if (!hand || !motion) return () => {};
  let frame = 0;
  let visible = false;
  const loop = () => {
    hand.setAttribute("transform", `rotate(${secondAngle(new Date())})`);
    frame = visible ? requestAnimationFrame(loop) : 0;
  };
  const io = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false;
    if (visible && !frame) frame = requestAnimationFrame(loop);
  });
  io.observe(hand.ownerSVGElement ?? hand);
  loop();
  return () => {
    io.disconnect();
    cancelAnimationFrame(frame);
    hand.removeAttribute("transform");
  };
}
