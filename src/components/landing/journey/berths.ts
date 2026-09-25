import { animate, createTimer, stagger, svg, utils, type JSAnimation, type Timer } from "animejs";
import { ease } from "./ease";
import { T } from "./motion-tokens";
import { watchEntrances } from "./observers";
import type { JourneyContext, Teardown } from "./start-journey";

// 03 · the berth plan while the journey runs (spec §3.A): whenever it comes into view it draws itself, line by
// line, then the sample passenger's berth lights with one bright pulse. Out of sight it waits undrawn and unlit.
// Motion off: drawn and lit, as the server made it.
//
// A stroke's drawn state is never reverted: svg.createDrawable's proxy captures whatever "draw" value is current
// on the element as its animation's own "original" (drawable.js), so reverting play()'s completed draw after
// arm() already hid it would restore the hidden "0 0" state, not the server's markup — leaving the plan invisible
// after any rebuild once it has played (Motion toggled, a resize). And utils.remove(strokes) cannot cancel a
// running draw either: svg.createDrawable returns a fresh Proxy on every call, and Anime.js matches a tween to
// remove by strict target reference (animation/composition.js), so removing by the raw elements never matches the
// Proxy the tween actually holds — the tween would keep writing stroke-dasharray/stroke-dashoffset for up to
// T.draw after a rebuild or re-arm lands mid-draw, self-healing to drawn but able to overwrite a freshly armed
// (hidden) state in the meantime. So arm() and play() keep their own draw animation's handle, and stop() cancels
// it directly — Timer#cancel, never #revert, for the same "wrong original" reason above — before clearing exactly
// what createDrawable writes to a stroke (drawable.js): the `pathLength` attribute it sets once, and the
// `stroke-dasharray`/`stroke-dashoffset` attributes it sets on every draw. Neither is ever written as an inline
// style, so nothing else needs clearing. The timer and the berth's strokeWidth pulse are ordinary (non-draw)
// tweens, never poisoned by arm(), so they still go through `running` and are still reverted normally.

export function startBerths({ motion }: JourneyContext): Teardown {
  const drawing = document.querySelector<SVGSVGElement>(".berth-plan svg");
  if (!drawing || !motion) return () => {};
  const strokes = [...drawing.querySelectorAll<SVGGeometryElement>(".plan-line, .plan-berth")];
  const lit = [...drawing.querySelectorAll<SVGElement>(".is-lit")];
  const berth = drawing.querySelector<SVGRectElement>(".plan-berth.is-lit");
  let running: (JSAnimation | Timer)[] = [];
  let draw: JSAnimation | null = null;
  const clearDraw = () => {
    draw?.cancel();
    draw = null;
    for (const el of strokes) {
      el.removeAttribute("pathLength");
      el.removeAttribute("stroke-dasharray");
      el.removeAttribute("stroke-dashoffset");
    }
  };
  const stop = () => {
    for (const a of running) a.revert();
    running = [];
    clearDraw();
  };
  const light = (on: boolean) => lit.forEach((el) => el.classList.toggle("is-lit", on));
  return watchEntrances([
    {
      trigger: drawing,
      at: 0.9,
      arm: () => {
        stop();
        light(false);
        draw = utils.set(svg.createDrawable(strokes), { draw: "0 0" });
      },
      play: () => {
        draw = animate(svg.createDrawable(strokes), { draw: ["0 0", "0 1"], duration: T.draw, delay: stagger(10), ease: ease.inOut() });
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
