import { animate, onScroll } from "animejs";
import { SMOOTH } from "./motion-tokens";
import { keepUp, track } from "./observers";
import type { JourneyContext, Teardown } from "./start-journey";

// 05 · the roadmap's track while the journey runs (spec §3.A): the scroll lays the line, sleepers a little
// ahead of the train, the train rides the curve, and each stop and its row light as it passes. Both ways.
// Motion off, or where the map is not drawn (phones): the finished line, as the server drew it.

export function startRoute({ motion }: JourneyContext): Teardown {
  const section = document.getElementById("roadmap");
  const map = section?.querySelector<HTMLElement>(".route-map");
  const path = map?.querySelector<SVGPathElement>(".route-path");
  if (!section || !map || !path || !motion || getComputedStyle(map).display === "none") return () => {};
  const total = path.getTotalLength();
  const sleepers = [...map.querySelectorAll<SVGLineElement>(".route-sleeper")].map((el) => ({ el, t: Number(el.dataset.t) }));
  const stops = [...map.querySelectorAll<SVGGElement>("g[data-t]")].map((el) => ({ el, t: Number(el.dataset.t) }));
  const rows = [...section.querySelectorAll<HTMLElement>("li")];
  const train = map.querySelector<SVGGElement>(".route-train");
  const rest = train?.getAttribute("transform") ?? null;

  const paint = (p: number) => {
    const len = total * p;
    path.style.strokeDasharray = `${len.toFixed(1)} ${total.toFixed(1)}`;
    for (const s of sleepers) s.el.classList.toggle("is-laid", s.t <= p + 0.035);
    const at = path.getPointAtLength(Math.max(0.01, len));
    const ahead = path.getPointAtLength(Math.min(total, len + 2));
    const deg = (Math.atan2(ahead.y - at.y, ahead.x - at.x) * 180) / Math.PI;
    train?.setAttribute("transform", `translate(${at.x.toFixed(1)} ${at.y.toFixed(1)}) rotate(${deg.toFixed(1)})`);
    stops.forEach((s, i) => {
      const passed = p >= s.t - 0.004;
      s.el.classList.toggle("is-passed", passed);
      rows[i]?.classList.toggle("is-passed", passed);
    });
  };

  const state = { p: 0 };
  paint(0);
  const observer = track(onScroll({ target: section, enter: "bottom-=25% top", leave: "bottom-=10% bottom", sync: SMOOTH }));
  const drive = animate(state, { p: [0, 1], ease: "linear", duration: 1000, onUpdate: () => paint(state.p), autoplay: observer });
  const awake = keepUp(observer, () => state.p); // the line catches the scroll up though a frame outlasts anime's wake

  return () => {
    awake();
    drive.revert();
    observer.revert();
    path.style.removeProperty("stroke-dasharray");
    for (const s of sleepers) s.el.classList.add("is-laid");
    for (const s of stops) s.el.classList.add("is-passed");
    for (const r of rows) r.classList.remove("is-passed");
    if (train && rest !== null) train.setAttribute("transform", rest);
  };
}
