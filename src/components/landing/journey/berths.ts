import { animate, createTimer, stagger, svg, utils, type JSAnimation, type Timer } from "animejs";
import { ease } from "./ease";
import { T } from "./motion-tokens";
import { watchEntrances } from "./observers";
import type { JourneyContext, Teardown } from "./start-journey";

// 03 · the berth plan while the journey runs (spec §3.A): whenever it comes into view it draws itself, line by
// line, then the sample passenger's berth lights with one bright pulse. Out of sight it waits undrawn and unlit.
// Motion off: drawn and lit, as the server made it.

export function startBerths({ motion }: JourneyContext): Teardown {
  const drawing = document.querySelector<SVGSVGElement>(".berth-plan svg");
  if (!drawing || !motion) return () => {};
  const strokes = [...drawing.querySelectorAll<SVGGeometryElement>(".plan-line, .plan-berth")];
  const lit = [...drawing.querySelectorAll<SVGElement>(".is-lit")];
  const berth = drawing.querySelector<SVGRectElement>(".plan-berth.is-lit");
  let running: (JSAnimation | Timer)[] = [];
  const stop = () => {
    for (const a of running) a.revert();
    running = [];
  };
  const light = (on: boolean) => lit.forEach((el) => el.classList.toggle("is-lit", on));
  return watchEntrances([
    {
      trigger: drawing,
      at: 0.9,
      arm: () => {
        stop();
        light(false);
        running.push(utils.set(svg.createDrawable(strokes), { draw: "0 0" }));
      },
      play: () => {
        running.push(animate(svg.createDrawable(strokes), { draw: ["0 0", "0 1"], duration: T.draw, delay: stagger(10), ease: ease.inOut() }));
        running.push(createTimer({ duration: T.draw + 300, onComplete: () => light(true) }));
        if (berth) running.push(animate(berth, { strokeWidth: [{ to: 3, duration: 200, delay: T.draw + 320 }, { to: 1.5, duration: 500 }], ease: ease.out() }));
      },
      settle: () => {
        stop();
        light(true);
      },
    },
  ]);
}
