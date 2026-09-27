import { afterEach, describe, expect, it } from "vitest";
import { LAYOUT_EVENT, STATION_EVENT, type StationDetail } from "@/components/landing/journey/journey-events";
import { startStationProgress, stationPlace, stationTops } from "@/components/landing/journey/station-progress";
import { STATIONS } from "@/components/landing/journey/stations";

// The departure board's status column follows whichever station the scroll has reached (spec §3.A). That used
// to be announced by the route rail (#77); the rail is gone, but the board must still hear it, from its own
// source: this module reads window.scrollY alone and dispatches the same STATION_EVENT.

describe("stationTops", () => {
  it("starts at 0, sets each station a third of a window early, and always rises", () => {
    expect(stationTops([0, 900, 1800, 1700], 300)).toEqual([0, 600, 1500, 1501]);
  });
});

describe("stationPlace", () => {
  it("finds the station and how far towards the next", () => {
    const tops = [0, 600, 1500];
    expect(stationPlace(tops, 0)).toEqual({ i: 0, f: 0 });
    expect(stationPlace(tops, 300)).toEqual({ i: 0, f: 0.5 });
    expect(stationPlace(tops, 600)).toEqual({ i: 1, f: 0 });
    expect(stationPlace(tops, 9_000)).toEqual({ i: 2, f: 0 });
  });
});

describe("startStationProgress", () => {
  afterEach(() => {
    document.body.replaceChildren();
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  });

  function mount() {
    document.body.innerHTML = STATIONS.map((s) => `<section id="${s.id}" style="position:relative"></section>`).join("");
    for (const [k, s] of STATIONS.entries()) {
      const el = document.getElementById(s.id)!;
      Object.defineProperty(el, "getBoundingClientRect", { configurable: true, value: () => ({ top: k * 1000, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} }) });
    }
  }

  it("announces DEP as soon as it starts, from the page's own sections", () => {
    mount();
    const heard: number[] = [];
    const onStation = (e: Event) => heard.push((e as CustomEvent<StationDetail>).detail.index);
    window.addEventListener(STATION_EVENT, onStation);
    const stop = startStationProgress();
    expect(heard).toEqual([0]);
    window.removeEventListener(STATION_EVENT, onStation);
    stop();
  });

  it("announces the station reached, but only when it changes", async () => {
    mount();
    const heard: number[] = [];
    const onStation = (e: Event) => heard.push((e as CustomEvent<StationDetail>).detail.index);
    window.addEventListener(STATION_EVENT, onStation);
    const stop = startStationProgress();
    heard.length = 0;

    Object.defineProperty(window, "scrollY", { configurable: true, value: 3_000 });
    window.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(heard).toEqual([3]);

    heard.length = 0;
    window.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(heard).toEqual([]);

    window.removeEventListener(STATION_EVENT, onStation);
    stop();
  });

  it("re-measures and re-announces on layout, even at the same station", () => {
    mount();
    const heard: number[] = [];
    const onStation = (e: Event) => heard.push((e as CustomEvent<StationDetail>).detail.index);
    window.addEventListener(STATION_EVENT, onStation);
    const stop = startStationProgress();
    heard.length = 0;

    window.dispatchEvent(new Event(LAYOUT_EVENT));
    expect(heard).toEqual([0]);

    window.removeEventListener(STATION_EVENT, onStation);
    stop();
  });

  it("stops listening on teardown", async () => {
    mount();
    const heard: number[] = [];
    const onStation = (e: Event) => heard.push((e as CustomEvent<StationDetail>).detail.index);
    window.addEventListener(STATION_EVENT, onStation);
    const stop = startStationProgress();
    stop();
    heard.length = 0;

    Object.defineProperty(window, "scrollY", { configurable: true, value: 3_000 });
    window.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    window.dispatchEvent(new Event(LAYOUT_EVENT));
    expect(heard).toEqual([]);

    window.removeEventListener(STATION_EVENT, onStation);
  });
});
