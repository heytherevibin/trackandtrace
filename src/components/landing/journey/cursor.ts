import { createAnimatable, utils } from "animejs";
import { ease } from "./ease";
import type { JourneyContext, Teardown } from "./start-journey";

// The registration-mark cursor (spec §3.A, page-wide): a hairline cross that follows the pointer and opens into
// four corner marks framing any control it rests on. Fine pointers with Motion on only. Over a text field it
// gives way to the native caret. It never takes a click (pointer-events: none) and is hidden from assistive tech.

const INTERACTIVE = 'a[href], button, [role="button"], [role="switch"], summary, label[for], select';
const NATIVE = 'input, textarea, [contenteditable="true"]';

export function startCursor({ motion }: JourneyContext): Teardown {
  if (!motion || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return () => {};
  const html = document.documentElement;
  const el = document.createElement("div");
  el.className = "reg-cursor is-off";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = '<span class="reg-cross"></span><span class="reg-frame"><i class="reg-mark tl"></i><i class="reg-mark tr"></i><i class="reg-mark bl"></i><i class="reg-mark br"></i></span>';
  document.body.append(el);
  html.classList.add("has-reg-cursor");
  const frameEl = el.querySelector<HTMLElement>(".reg-frame")!;
  const follow = createAnimatable(el, { x: { unit: "px", duration: 110 }, y: { unit: "px", duration: 110 }, ease: ease.out() });
  const frame = createAnimatable(frameEl, { width: { unit: "px", duration: 180 }, height: { unit: "px", duration: 180 }, ease: ease.expo() });

  const onMove = (e: PointerEvent) => {
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest(NATIVE)) {
      el.classList.add("is-off");
      return;
    }
    el.classList.remove("is-off");
    const hit = target?.closest(INTERACTIVE) ?? null;
    if (hit) {
      const r = hit.getBoundingClientRect();
      follow.x(r.left + r.width / 2);
      follow.y(r.top + r.height / 2);
      frame.width(r.width + 10);
      frame.height(r.height + 10);
      el.classList.add("is-snapped");
    } else {
      follow.x(e.clientX);
      follow.y(e.clientY);
      frame.width(22);
      frame.height(22);
      el.classList.remove("is-snapped");
    }
  };
  const onDown = () => el.classList.add("is-down");
  const onUp = () => el.classList.remove("is-down");
  const onLeave = () => el.classList.add("is-off");
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onDown, { passive: true });
  window.addEventListener("pointerup", onUp, { passive: true });
  document.documentElement.addEventListener("pointerleave", onLeave);
  return () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointerup", onUp);
    document.documentElement.removeEventListener("pointerleave", onLeave);
    follow.revert();
    frame.revert();
    utils.remove([el, frameEl]);
    el.remove();
    html.classList.remove("has-reg-cursor");
  };
}
