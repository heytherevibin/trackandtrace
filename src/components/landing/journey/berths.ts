import { animate, createTimer, stagger, type JSAnimation, type Timer } from "animejs";
import { drawStrokes } from "./drawing";
import { ease } from "./ease";
import { T } from "./motion-tokens";
import { watchEntrances } from "./observers";
import type { JourneyContext, Teardown } from "./start-journey";

// 03 · the berth plan while the journey runs (spec §3.A): whenever it comes into view it draws itself, line by
// line, then the sample passenger's berth lights with one bright pulse. Out of sight it waits undrawn and unlit.
// Motion off: drawn and lit, as the server made it.
//
// The strokes are a Drawing (drawing.ts): drawn and hidden by one kept handle, cancelled and cleared on stop, never
// reverted. The timer and the berth's strokeWidth pulse are ordinary (non-draw) tweens, so they go through
// `running` and are reverted normally.

export function startBerths({ motion }: JourneyContext): Teardown {
  const drawing = document.querySelector<SVGSVGElement>(".berth-plan svg");
  if (!drawing || !motion) return () => {};
  const strokes = [...drawing.querySelectorAll<SVGGeometryElement>(".plan-line, .plan-berth")];
  const lit = [...drawing.querySelectorAll<SVGElement>(".is-lit")];
  const berth = drawing.querySelector<SVGRectElement>(".plan-berth.is-lit");
  const plan = drawStrokes(strokes);
  let running: (JSAnimation | Timer)[] = [];
  const stop = () => {
    for (const a of running) a.revert();
    running = [];
    plan.clear();
  };
  const light = (on: boolean) => lit.forEach((el) => el.classList.toggle("is-lit", on));
  return watchEntrances([
    {
      trigger: drawing,
      at: 0.9,
      arm: () => {
        stop();
        light(false);
        plan.hold("0 0");
      },
      play: () => {
        plan.play({ draw: ["0 0", "0 1"], duration: T.draw, delay: stagger(10), ease: ease.inOut() });
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
