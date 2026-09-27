import { STATIONS } from "./stations";

// Back to "/" (spec §3.A's rule, kept): the browser restores the raw scrollY it saved for "/", but it saved it
// while 02 (#how) stood pinned, up to 330vh taller, and hands it to a page the server drew with 02 plain. A
// reader who left below 02 comes back that much further down. Deferred pinning rightly will not grow 02 under
// them, so the journey remembers their section instead: which one they stood on, and how far below the
// masthead's foot, kept against the history entry it belongs to (the Navigation API's key, stable across a
// replaceState). Only a return to that same entry (Back, Forward) restores it; a new visit, a link or a hash
// landing is always a new entry, so it never matches, and a reload never stores anything. Every read clears
// the key, so a stale place can only ever be refused once.

export const PLACE_KEY = "tt.place";

export interface Place {
  /** The history entry the reader stood on. */
  readonly entry: string;
  /** Their section: one of the journey's stations. */
  readonly id: string;
  /** The section's top, in px below the masthead's foot (negative: above it). */
  readonly offset: number;
}

const IDS: readonly string[] = STATIONS.map((s) => s.id);

/** A stored place, read back only whole: a known station and a finite offset. Anything else is nothing. */
export function parsePlace(raw: string | null): Place | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { entry, id, offset } = value as Record<string, unknown>;
  if (typeof entry !== "string" || entry === "" || typeof id !== "string" || !IDS.includes(id)) return null;
  if (typeof offset !== "number" || !Number.isFinite(offset)) return null;
  return { entry, id, offset };
}

/** The reader's anchor: the section whose top stands nearest the masthead's foot. The nearest edge, not the
 * section the reader is inside, since that section may be 02 itself — the one whose height the return changes —
 * and anchoring on its far-off top would carry that whole change into the restored place. */
export function pickPlace(tops: readonly { readonly id: string; readonly top: number }[], foot: number): { readonly id: string; readonly offset: number } | null {
  const on = tops.reduce<(typeof tops)[number] | null>((best, t) => (!best || Math.abs(t.top - foot) < Math.abs(best.top - foot) ? t : best), null);
  return on ? { id: on.id, offset: on.top - foot } : null;
}

/** The history entry being shown, by its Navigation API key; null where the browser has none. */
function entryKey(): string | null {
  const nav: unknown = Reflect.get(window, "navigation");
  if (typeof nav !== "object" || nav === null) return null;
  const entry: unknown = Reflect.get(nav, "currentEntry");
  if (typeof entry !== "object" || entry === null) return null;
  const key: unknown = Reflect.get(entry, "key");
  return typeof key === "string" && key ? key : null;
}

/** The Navigation API's target, where the browser has one. */
function navigationTarget(): EventTarget | null {
  const nav: unknown = Reflect.get(window, "navigation");
  return nav instanceof EventTarget ? nav : null;
}

/** The reader's own hand: any of these before the restore means they have moved on, and nothing is restored under them. */
const HAND = ["wheel", "touchstart", "keydown"] as const;

function mastheadFoot(): number {
  return document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
}

/** Where the reader stands now, on this page's own sections; null once they have left the document. */
function placeNow(): Place | null {
  const entry = entryKey();
  if (!entry) return null;
  const tops = IDS.flatMap((id) => {
    const el = document.getElementById(id);
    return el?.isConnected ? [{ id, top: el.getBoundingClientRect().top }] : [];
  });
  const on = pickPlace(tops, mastheadFoot());
  return on ? { entry, ...on } : null;
}

function take(): Place | null {
  try {
    const place = parsePlace(window.sessionStorage.getItem(PLACE_KEY));
    window.sessionStorage.removeItem(PLACE_KEY);
    return place;
  } catch {
    return null;
  }
}

function put(place: Place): void {
  try {
    window.sessionStorage.setItem(PLACE_KEY, JSON.stringify(place));
  } catch {
    // storage refused (private mode, quota): Back simply lands where the browser puts it
  }
}

export interface PlaceMemory {
  /** Once the journey's first build has settled: stands the stored section at its old offset, if this start is a
   * return to the entry it was stored for. Does anything at most once. */
  readonly restore: () => void;
  /** Stops watching and stores the reader's last place for a later return. */
  readonly stop: () => void;
}

/** Started once per startJourney: reads (and clears) the stored place, then watches where the reader stands. The
 * page's sections are already gone by the time the journey's teardown runs on a client navigation, so the place
 * is sampled as the reader scrolls, and as a navigation starts. */
export function startPlaceMemory(): PlaceMemory {
  const stored = take();
  const here = entryKey();
  let pending = stored && here === stored.entry ? stored : null;
  let last: Place | null = null;
  let frame = 0;
  let leaving = false;

  const read = () => {
    last = placeNow() ?? last;
  };
  const sample = () => {
    frame = 0;
    if (!leaving) read();
  };
  const onScroll = () => {
    if (!frame) frame = requestAnimationFrame(sample);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  // Sampled as a navigation starts (a link, Back or Forward): the sections still stand, and the entry being left is
  // still the current one (J5-17). Never a reload, and never a replace: a replace overwrites its own entry, so Back can
  // never return to it, and the router's same-URL replace after a Forward lands with the destination already current
  // while these sections still stand; sampling it would re-key the place to an entry that is not this page's.
  // That one sample is the last: until the new page renders, the destination's entry is current while these sections
  // still stand, so a scroll sampled then would be stamped with the wrong entry. A same-document hash change keeps
  // this page, so sampling goes on, on the entry it made. A navigation that fails (navigateerror, which fires
  // whenever its transition's finished promise rejects) leaves the reader here, so sampling resumes.
  const navigation = navigationTarget();
  const onNavigate = (event: Event) => {
    const type: unknown = Reflect.get(event, "navigationType");
    if (type !== "push" && type !== "traverse") return;
    read();
    if (Reflect.get(event, "hashChange") !== true) leaving = true;
  };
  const onNavigateError = () => {
    leaving = false;
  };
  navigation?.addEventListener("navigate", onNavigate);
  navigation?.addEventListener("navigateerror", onNavigateError);
  const stopHand = () => {
    for (const type of HAND) window.removeEventListener(type, onHand, true);
  };
  const onHand = () => {
    pending = null;
    stopHand();
  };
  for (const type of HAND) window.addEventListener(type, onHand, { capture: true, passive: true });
  sample();

  return {
    restore: () => {
      stopHand();
      const place = pending;
      pending = null;
      const el = place ? document.getElementById(place.id) : null;
      if (!place || !el) return;
      const by = el.getBoundingClientRect().top - mastheadFoot() - place.offset;
      window.scrollTo({ top: window.scrollY + by, behavior: "instant" });
      sample();
    },
    stop: () => {
      pending = null;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      window.removeEventListener("scroll", onScroll);
      navigation?.removeEventListener("navigate", onNavigate);
      navigation?.removeEventListener("navigateerror", onNavigateError);
      stopHand();
      if (last) put(last);
    },
  };
}
