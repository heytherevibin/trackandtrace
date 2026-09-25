import { animate, createAnimatable, stagger, svg, utils, type JSAnimation } from "animejs";
import { messages } from "@/messages";
import { formatTime } from "@/utils/datetime";
import { chartFace } from "./chart-countdown";
import { ease } from "./ease";
import { PLATE_EVENT, RESULT_EVENT, RUN_EVENT, type PlateDetail, type ResultDetail, type RunDetail } from "./journey-events";
import { STAGGER, T } from "./motion-tokens";
import type { JourneyContext, Teardown } from "./start-journey";

// The hero dial while the journey runs (spec §3.A, Hero): a segment lights per digit typed; a sweep rides the
// ring while a check runs; a result with the record's chart time turns it into a 24-hour IST face with the
// needle on now. On a fine pointer with Motion on, the needle otherwise follows the pointer. Motion off: every
// state is drawn at once.

export function startHero({ motion, intro }: JourneyContext): Teardown {
  const dial = document.querySelector<SVGSVGElement>(".hero-dial svg");
  const host = document.querySelector<HTMLElement>(".dial-host");
  if (!dial || !host) return () => {};
  const shell = dial.parentElement!;
  const segs = [...dial.querySelectorAll<SVGPathElement>(".dial-seg")];
  const dashed = dial.querySelector<SVGCircleElement>(".is-dashed");
  const sweep = dial.querySelector<SVGPathElement>(".dial-sweep");
  const arc = dial.querySelector<SVGPathElement>(".dial-arc");
  const mark = dial.querySelector<SVGCircleElement>(".dial-chart-mark");
  const needle = dial.querySelector<SVGGElement>(".dial-needle");
  const readout = host.querySelector<HTMLElement>(".dial-readout");
  const running: JSAnimation[] = [];
  let lit = 0;
  let spin: JSAnimation | null = null;
  let face: { readonly chartAt: string; readonly timer: number } | null = null;
  let angle = 0;
  const turn = needle ? createAnimatable(needle, { rotate: { unit: "deg", duration: motion ? 520 : 0 }, ease: ease.expo() }) : null;
  const aim = (deg: number) => {
    const raw = deg - (angle % 360);
    const d = raw > 180 ? raw - 360 : raw < -180 ? raw + 360 : raw;
    angle += d;
    turn?.rotate(angle);
  };

  const setDigits = (n: number) => segs.forEach((s, i) => {
    s.classList.toggle("is-on", i < n);
    s.classList.toggle("is-current", i === n && n < 10);
  });
  const stopSweep = () => {
    spin?.revert();
    spin = null;
    sweep?.style.removeProperty("opacity");
  };
  const paintFace = () => {
    if (!face) return;
    const f = chartFace(face.chartAt, new Date());
    arc?.setAttribute("d", f.arc);
    mark?.setAttribute("cx", String(f.mark[0]));
    mark?.setAttribute("cy", String(f.mark[1]));
    aim(f.nowDeg);
    if (readout) {
      const c = messages.result.chart;
      readout.textContent = messages.journey.dial.readout(formatTime(face.chartAt), f.ahead ? c.in(f.hours, f.minutes) : c.prepared);
    }
  };
  const exitFace = () => {
    if (!face) return;
    window.clearInterval(face.timer);
    face = null;
    shell.classList.remove("is-face");
    host.classList.remove("is-face");
    arc?.setAttribute("d", "");
    if (readout) readout.textContent = "";
  };
  const enterFace = (chartAt: string) => {
    exitFace();
    face = { chartAt, timer: window.setInterval(paintFace, 20_000) };
    shell.classList.add("is-face");
    host.classList.add("is-face");
    paintFace();
    if (motion && arc) running.push(animate(svg.createDrawable(arc), { draw: ["0 0", "0 1"], duration: T.draw, delay: T.fast, ease: ease.inOut() }));
  };

  const onPlate = (event: Event) => {
    const { hero, digits, running: busy } = (event as CustomEvent<PlateDetail>).detail;
    if (!hero) return;
    // The plate re-fires this on every phase change, including running → done with the same digit count: that
    // echo must not undo the face onResult just entered. Only a genuine retype or clear (digits actually
    // changing) leaves the face.
    if (!busy && digits !== lit) {
      exitFace();
      stopSweep();
    }
    setDigits(digits);
    if (motion && digits > lit && segs[digits - 1]) {
      running.push(animate(segs[digits - 1]!, { strokeWidth: [13, 7], duration: T.slow, ease: ease.expo() }));
      if (dashed) running.push(animate(dashed, { rotate: "+=14", duration: T.slow, ease: ease.expo() }));
    }
    lit = digits;
  };
  const onRun = (event: Event) => {
    if (!(event as CustomEvent<RunDetail>).detail.hero || !motion || !sweep) return;
    stopSweep();
    spin = animate(sweep, { rotate: [0, 360], opacity: [0, 1, 1, 0], duration: 1200, loop: true, ease: ease.inOut() });
  };
  const onResult = (event: Event) => {
    const { hero, chartAt } = (event as CustomEvent<ResultDetail>).detail;
    if (!hero) return;
    stopSweep();
    if (chartAt) enterFace(chartAt);
    else if (motion) running.push(animate(segs, { opacity: [1, 0.4, 1], duration: 580, delay: stagger(26), ease: ease.out() }));
  };
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const onPointer = (e: PointerEvent) => {
    if (face) return;
    const r = dial.getBoundingClientRect();
    aim((Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI + 90);
  };

  // Start from what the plate already holds: the journey may have arrived after the reader began typing.
  lit = document.querySelectorAll('[data-testid="hero-instrument"] [data-cell][data-filled]').length;
  setDigits(lit);
  window.addEventListener(PLATE_EVENT, onPlate);
  window.addEventListener(RUN_EVENT, onRun);
  window.addEventListener(RESULT_EVENT, onResult);
  if (motion && fine) window.addEventListener("pointermove", onPointer, { passive: true });
  if (motion && intro) {
    running.push(animate(dial.querySelectorAll(".dial-bezel .dial-tick"), { opacity: [0, 1], duration: 500, delay: stagger(STAGGER.tick, { start: 200 }), ease: ease.out() }));
    running.push(animate(svg.createDrawable(dial.querySelectorAll(":scope > .dial-ring")), { draw: ["0 0", "0 1"], duration: T.draw, delay: 300, ease: ease.inOut() }));
    running.push(animate(segs, { opacity: [0, 1], duration: 400, delay: stagger(STAGGER.seg, { start: 700 }), ease: ease.out() }));
  }
  if (motion && dashed) running.push(animate(dashed, { rotate: "-=360", duration: 90_000, loop: true, ease: "linear" }));

  return () => {
    window.removeEventListener(PLATE_EVENT, onPlate);
    window.removeEventListener(RUN_EVENT, onRun);
    window.removeEventListener(RESULT_EVENT, onResult);
    window.removeEventListener("pointermove", onPointer);
    for (const a of running) a.revert();
    stopSweep();
    exitFace();
    turn?.revert();
    if (needle) utils.remove(needle);
    needle?.style.removeProperty("transform");
    setDigits(0);
  };
}
