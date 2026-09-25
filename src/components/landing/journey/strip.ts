import { messages } from "@/messages";
import { LAYOUT_EVENT, STATION_EVENT, type StationDetail } from "./journey-events";
import type { JourneyContext, Teardown } from "./start-journey";
import { STATIONS, kmFigure, stopName } from "./stations";
import { leanStep, odometer, stationTops, stripFraction, stripPlace } from "./strip-position";

// The strip while the journey runs (spec §3.A, Masthead): the train runs right as the page scrolls and leans
// into speed; the odometer counts; the current stop is aria-current and named. Motion off: it moves, no lean.

const KMS = STATIONS.map((s) => s.km);

export function startStrip({ motion }: JourneyContext): Teardown {
  const nav = document.getElementById("route-strip");
  if (!nav) return () => {};
  const links = STATIONS.map((s) => nav.querySelector<HTMLAnchorElement>(`.strip-stops a[href="#${s.id}"]`));
  const odo = nav.querySelector<HTMLElement>(".strip-odo");
  const now = nav.querySelector<HTMLElement>(".strip-now");
  const trains = [...document.querySelectorAll<HTMLElement>(".strip-train")];
  const glyphs = [...document.querySelectorAll<HTMLElement>(".strip-glyph")];
  let tops: readonly number[] = [];
  let last = -1;
  let paintFrame = 0;
  let leanFrame = 0;
  let lean = 0;
  let lastY = window.scrollY;

  const measure = () => {
    const anchors = STATIONS.map((s) => {
      const el = document.getElementById(s.id);
      return el ? el.getBoundingClientRect().top + window.scrollY : 0;
    });
    tops = stationTops(anchors, window.innerHeight * 0.35);
  };
  const paint = (announce: boolean) => {
    paintFrame = 0;
    const place = stripPlace(tops, window.scrollY);
    const left = `${(stripFraction(place, STATIONS.length) * 100).toFixed(3)}%`;
    for (const t of trains) t.style.left = left;
    if (odo) odo.textContent = messages.journey.strip.km(kmFigure(odometer(place, KMS)));
    if (place.i === last && !announce) return;
    last = place.i;
    links.forEach((a, k) => (k === place.i ? a?.setAttribute("aria-current", "location") : a?.removeAttribute("aria-current")));
    if (now) now.textContent = stopName(STATIONS[place.i]!);
    window.dispatchEvent(new CustomEvent<StationDetail>(STATION_EVENT, { detail: { index: place.i } }));
  };
  const tick = () => {
    const y = window.scrollY;
    const v = y - lastY;
    lastY = y;
    lean = leanStep(lean, v);
    const skew = lean === 0 ? "" : `skewX(${lean.toFixed(2)}deg)`;
    for (const g of glyphs) g.style.transform = skew;
    leanFrame = lean !== 0 || v !== 0 ? requestAnimationFrame(tick) : 0;
  };
  const onScroll = () => {
    if (!paintFrame) paintFrame = requestAnimationFrame(() => paint(false));
    if (motion && !leanFrame) {
      lastY = window.scrollY;
      leanFrame = requestAnimationFrame(tick);
    }
  };
  const onLayout = () => {
    measure();
    paint(true);
  };

  measure();
  paint(true);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener(LAYOUT_EVENT, onLayout);
  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener(LAYOUT_EVENT, onLayout);
    cancelAnimationFrame(paintFrame);
    cancelAnimationFrame(leanFrame);
    for (const t of trains) t.style.removeProperty("left");
    for (const g of glyphs) g.style.removeProperty("transform");
    for (const a of links) a?.removeAttribute("aria-current");
    if (odo) odo.textContent = messages.journey.strip.km(kmFigure(0));
    if (now) now.textContent = stopName(STATIONS[0]!);
  };
}
