import { messages } from "@/messages";
import { LAYOUT_EVENT, STATION_EVENT, type StationDetail } from "./journey-events";
import type { JourneyContext, Teardown } from "./start-journey";
import { STATIONS, kmFigure } from "./stations";
import { leanStep, odometer, stationTops, stripFraction, stripPlace, trainLeft, trainTop } from "./strip-position";

// The route rail while the journey runs (spec §3.A, Masthead): the train runs down the rail as the page scrolls
// and leans into speed; the odometer at the rail's foot counts; the current stop is aria-current. On phones the
// same train runs right along the masthead's hairline. Motion off: both move, neither leans. Everything the
// scroll frame needs is measured on layout, so that frame only writes: the stations' tops on tt:layout, and the
// trains' sizes whenever a track or train is resized (a ResizeObserver, which reads after layout) — the rail's
// track is the window's height less the masthead and the odometer, so it grows and shrinks with the window.
// The rail's train moves by transform alone.

const KMS = STATIONS.map((s) => s.km);

interface RailSize {
  readonly glyph: number;
  readonly track: number;
  readonly stop: number;
}

interface PhoneSize {
  readonly glyph: number;
  readonly track: number;
}

export function startStrip({ motion }: JourneyContext): Teardown {
  const nav = document.getElementById("route-strip");
  if (!nav) return () => {};
  const links = STATIONS.map((s) => nav.querySelector<HTMLAnchorElement>(`.strip-stops a[href="#${s.id}"]`));
  const odo = nav.querySelector<HTMLElement>(".strip-odo");
  const firstStop = nav.querySelector<HTMLElement>(".strip-stops li");
  const railTrains = [...nav.querySelectorAll<HTMLElement>(".strip-train")];
  const railGlyphs = [...nav.querySelectorAll<HTMLElement>(".strip-glyph")];
  const phoneTrains = [...document.querySelectorAll<HTMLElement>(".phone-rail .strip-train")];
  const phoneGlyphs = [...document.querySelectorAll<HTMLElement>(".phone-rail .strip-glyph")];
  const trains = [...railTrains, ...phoneTrains];
  let tops: readonly number[] = [];
  let railSizes: readonly RailSize[] = [];
  let phoneSizes: readonly PhoneSize[] = [];
  let last = -1;
  let paintFrame = 0;
  let leanFrame = 0;
  let lean = 0;
  let lastY = window.scrollY;

  const measureSizes = () => {
    const stop = firstStop?.offsetHeight ?? 0;
    railSizes = railTrains.map((t) => ({ glyph: t.offsetHeight, track: t.parentElement?.clientHeight ?? 0, stop }));
    phoneSizes = phoneTrains.map((t) => ({ glyph: t.offsetWidth, track: (t.offsetParent as HTMLElement | null)?.clientWidth ?? 0 }));
  };
  const measure = () => {
    const anchors = STATIONS.map((s) => {
      const el = document.getElementById(s.id);
      return el ? el.getBoundingClientRect().top + window.scrollY : 0;
    });
    tops = stationTops(anchors, window.innerHeight * 0.35);
    measureSizes();
  };
  const paint = (announce: boolean) => {
    paintFrame = 0;
    const place = stripPlace(tops, window.scrollY);
    const fraction = stripFraction(place, STATIONS.length);
    railTrains.forEach((t, k) => {
      const s = railSizes[k];
      t.style.transform = `translateY(${trainTop(fraction, s?.glyph ?? 0, s?.track ?? 0, s?.stop ?? 0).toFixed(2)}px)`;
    });
    phoneTrains.forEach((t, k) => {
      const s = phoneSizes[k];
      t.style.left = `${trainLeft(fraction, s?.glyph ?? 0, s?.track ?? 0).toFixed(3)}%`;
    });
    if (odo) odo.textContent = messages.journey.strip.km(kmFigure(odometer(place, KMS)));
    if (place.i === last && !announce) return;
    last = place.i;
    links.forEach((a, k) => (k === place.i ? a?.setAttribute("aria-current", "location") : a?.removeAttribute("aria-current")));
    window.dispatchEvent(new CustomEvent<StationDetail>(STATION_EVENT, { detail: { index: place.i } }));
  };
  const tick = () => {
    const y = window.scrollY;
    const v = y - lastY;
    lastY = y;
    lean = leanStep(lean, v);
    // The rail's glyph runs nose down with its wheels to the left (journey.css): its lean is the phone's, turned
    // a quarter, so its far side trails the scroll as the phone's roof does.
    const along = lean === 0 ? "" : `skewX(${lean.toFixed(2)}deg)`;
    const down = lean === 0 ? "" : `skewY(${(-lean).toFixed(2)}deg)`;
    for (const g of phoneGlyphs) g.style.transform = along;
    for (const g of railGlyphs) g.style.transform = down;
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
  const sized = new ResizeObserver(() => {
    measureSizes();
    paint(false);
  });
  for (const t of trains) {
    sized.observe(t);
    if (t.parentElement) sized.observe(t.parentElement);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener(LAYOUT_EVENT, onLayout);
  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener(LAYOUT_EVENT, onLayout);
    sized.disconnect();
    cancelAnimationFrame(paintFrame);
    cancelAnimationFrame(leanFrame);
    for (const t of railTrains) t.style.removeProperty("transform");
    for (const t of phoneTrains) t.style.removeProperty("left");
    for (const g of [...railGlyphs, ...phoneGlyphs]) g.style.removeProperty("transform");
    for (const a of links) a?.removeAttribute("aria-current");
    if (odo) odo.textContent = messages.journey.strip.km(kmFigure(0));
  };
}
