import { LAYOUT_EVENT, STATION_EVENT, type StationDetail } from "./journey-events";
import type { Teardown } from "./start-journey";
import { STATIONS } from "./stations";

// Which station the scroll has reached (spec §3.A, prototype v3's strip.js): the departure board's status
// column follows it. The route rail announced this until the owner removed it (#77, 2026-09-27); this module
// gives the board its own source instead, with no visible element of its own. Everything the scroll frame
// needs is measured on layout, so that frame only reads window.scrollY and announces (STATION_EVENT) when the
// reached station changes.

export interface StationPlace {
  /** The station the page has reached. */
  readonly i: number;
  /** How far towards the next, 0–1. */
  readonly f: number;
}

/** Each station's top in page px, reached a third of a window early (`bias`); the first is 0, and each is
 * at least 1px past the last, so the table always rises. */
export function stationTops(anchors: readonly number[], bias: number): readonly number[] {
  return anchors.reduce<readonly number[]>((tops, anchor, k) => [...tops, k === 0 ? 0 : Math.max(anchor - bias, tops[k - 1]! + 1)], []);
}

export function stationPlace(tops: readonly number[], y: number): StationPlace {
  const last = tops.length - 1;
  const passed = tops.findLastIndex((top, k) => k <= last && y >= top);
  const i = Math.max(0, passed);
  if (i >= last) return { i: last, f: 0 };
  return { i, f: Math.min(1, Math.max(0, (y - tops[i]!) / (tops[i + 1]! - tops[i]!))) };
}

export function startStationProgress(): Teardown {
  let tops: readonly number[] = [];
  let last = -1;
  let frame = 0;

  const measure = () => {
    const anchors = STATIONS.map((s) => {
      const el = document.getElementById(s.id);
      return el ? el.getBoundingClientRect().top + window.scrollY : 0;
    });
    tops = stationTops(anchors, window.innerHeight * 0.35);
  };
  const announce = (force: boolean) => {
    frame = 0;
    const place = stationPlace(tops, window.scrollY);
    if (place.i === last && !force) return;
    last = place.i;
    window.dispatchEvent(new CustomEvent<StationDetail>(STATION_EVENT, { detail: { index: place.i } }));
  };
  const onScroll = () => {
    if (!frame) frame = requestAnimationFrame(() => announce(false));
  };
  const onLayout = () => {
    measure();
    announce(true);
  };

  measure();
  announce(true);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener(LAYOUT_EVENT, onLayout);
  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener(LAYOUT_EVENT, onLayout);
    cancelAnimationFrame(frame);
  };
}
