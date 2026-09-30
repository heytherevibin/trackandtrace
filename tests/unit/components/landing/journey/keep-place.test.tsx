import { afterEach, describe, expect, it, vi } from "vitest";
import { APART_MS, keepPlace, laidOut, viewHeight, watchView } from "@/components/landing/journey/keep-place";

// keepPlace (J5-3): a pinned piece changes its height, then the reader lands where placeAfter says. The piece's
// box after the change is read against whatever scroll the browser holds by then.

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function page(): { readonly piece: HTMLElement; readonly doc: { top: number; height: number }; readonly scroll: { y: number; vh: number } } {
  document.body.innerHTML = `<header></header><div id="piece"></div>`;
  document.querySelector("header")!.getBoundingClientRect = () => ({ bottom: 64 }) as DOMRect;
  const piece = document.getElementById("piece")!;
  const doc = { top: 5000, height: 3400 };
  const scroll = { y: 0, vh: 900 };
  vi.spyOn(window, "scrollY", "get").mockImplementation(() => scroll.y);
  vi.spyOn(window, "innerHeight", "get").mockImplementation(() => scroll.vh);
  piece.getBoundingClientRect = () => ({ top: doc.top - scroll.y, bottom: doc.top - scroll.y + doc.height, height: doc.height }) as DOMRect;
  return { piece, doc, scroll };
}

describe("keepPlace", () => {
  it("sends a reader inside the piece to its start, under the masthead", () => {
    const { piece, doc, scroll } = page();
    scroll.y = 7000; // 2000px into it
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    keepPlace(piece, () => {
      doc.height = 860;
    });
    expect(scrollTo).toHaveBeenCalledWith({ top: 5000 - 64, behavior: "instant" });
  });

  it("still lands a reader inside it on its start when the shrink clamps the scroll at the page's foot", () => {
    const { piece, doc, scroll } = page();
    scroll.y = 7000;
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    keepPlace(piece, () => {
      doc.height = 860;
      scroll.y = 6200; // the page is now too short for 7000: the browser clamps the scroll as the change lays out
    });
    expect(scrollTo).toHaveBeenCalledWith({ top: 5000 - 64, behavior: "instant" });
  });

  // A relayout of a piece that keeps its shape (the run still running after a resize) keeps a reader inside it the same
  // fraction through it (the owner, 2026-09-29): 2,064 px of its 2,564 px range, from its start at 4,936.
  it("keeps a reader inside the piece the same fraction through it when its caller says the shape is the same", () => {
    const { piece, doc, scroll } = page();
    scroll.y = 7000;
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    keepPlace(
      piece,
      () => {
        doc.height = 2860;
      },
      { shape: "same" },
    );
    expect(scrollTo).toHaveBeenCalledWith({ top: Math.round(4936 + (2064 / 2564) * 2024), behavior: "instant" });
  });

  // Its timeline ends at the large viewport's foot (anime's 100lvh), not innerHeight, which a phone's toolbar shortens
  // (review, M1): the fraction is measured to it, so it is the timeline's progress.
  it("measures the fraction to the large viewport, a phone's toolbar shown", () => {
    const { piece, doc, scroll } = page();
    scroll.y = 7000;
    scroll.vh = 800; // the toolbar takes 100 px of a large viewport 900 tall
    const offset = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")!;
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.style.height === "100lvh" ? 900 : (offset.get?.call(this) as number);
    });
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    keepPlace(
      piece,
      () => {
        doc.height = 2860;
      },
      { shape: "same" },
    );
    expect(scrollTo).toHaveBeenCalledWith({ top: Math.round(4936 + (2064 / 2564) * 2024), behavior: "instant" });
  });

  it("asks its caller for the shape once the change has run: a relayout that no longer fits changes it", () => {
    const { piece, doc, scroll } = page();
    scroll.y = 7000;
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    let fits = true;
    keepPlace(
      piece,
      () => {
        doc.height = 860;
        fits = false;
      },
      { shape: () => (fits ? "same" : "changed") },
    );
    expect(scrollTo).toHaveBeenCalledWith({ top: 5000 - 64, behavior: "instant" });
  });

  // A resize the page has already laid out (the window, and the pieces above, moved before the piece's caller heard of
  // it): a reader inside is judged, and kept the same fraction through, from the place they last read it in.
  it("keeps a reader inside the same fraction through it from the place its caller kept, not the one a resize left", () => {
    const { piece, doc, scroll } = page();
    const from = { top: 5000, bottom: 8400, y: 7000, vh: 900, view: 900 }; // 2,064 px into its 2,564 px range
    scroll.vh = 700; // the window is shorter now
    doc.top = 4990; // the text above it reflowed
    scroll.y = 6800; // and a piece above moved the reader by its own change
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    keepPlace(
      piece,
      () => {
        doc.height = 3200;
      },
      { shape: "same", from },
    );
    // its start at 4,926 (4,990 less the masthead's 64), its range 8,190 − 700 − 4,926
    expect(scrollTo).toHaveBeenCalledWith({ top: Math.round(4926 + (2064 / 2564) * 2564), behavior: "instant" });
  });

  it("moves a reader past it by the change from where they stand now, whatever place its caller kept", () => {
    const { piece, doc, scroll } = page();
    const from = { top: 5000, bottom: 8400, y: 9000, vh: 900, view: 900 }; // its foot 600 px above the window: past it
    scroll.y = 9100; // a piece above moved them on by its own change
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    keepPlace(
      piece,
      () => {
        doc.height = 3200;
      },
      { shape: "same", from },
    );
    expect(scrollTo).toHaveBeenCalledWith({ top: 9100 - 200, behavior: "instant" });
  });

  it("moves a reader past it by exactly the change, whatever the clamp did meanwhile", () => {
    const { piece, doc, scroll } = page();
    scroll.y = 8200; // its foot 200px down the window
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    keepPlace(piece, () => {
      doc.height = 860;
      scroll.y = 6000;
    });
    expect(scrollTo).toHaveBeenCalledWith({ top: 8200 - 2540, behavior: "instant" });
  });

  // Any instant scroll, even to where the reader already stands, cancels a smooth one in flight: the glide that brings
  // a Tab stop into the window (WCAG 2.4.11) stopped short, focus off-screen, when a drawing above fell to the still.
  it("issues no scroll when the reader already stands within a pixel of their place: scroll anchoring moved them", () => {
    const { piece, doc, scroll } = page();
    scroll.y = 8200;
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    keepPlace(piece, () => {
      doc.height = 860;
      scroll.y = 8200 - 2540 + 0.5; // the browser's anchoring answered the change as it laid out
    });
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

// The page's measures of the window (100vh, 100svh, 100lvh), read from the layout: WebKit lays a resize out in steps, a
// frame or more apart and in any order, innerHeight the new window's throughout (the nightly config's WebKit, 2026-09-30).
describe("the window as the page has laid it out", () => {
  function units(): { vh: number; svh: number; lvh: number } {
    const at = { vh: 900, svh: 900, lvh: 900 };
    const offset = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")!;
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      if (this.style.height === "100vh") return at.vh;
      if (this.style.height === "100svh") return at.svh;
      if (this.style.height === "100lvh") return at.lvh;
      return offset.get?.call(this) as number;
    });
    return at;
  }

  it("is laid out for one window while its measures have all moved since it last was, or none has", () => {
    const at = units();
    expect(laidOut()).toBe(true);
    at.svh = 700; // the small and large viewports laid out for the new window, 100vh not yet
    at.lvh = 700;
    expect(laidOut()).toBe(false);
    at.vh = 700;
    expect(laidOut()).toBe(true);
    at.vh = 500; // or 100vh first
    expect(laidOut()).toBe(false);
    at.lvh = 500; // and 100svh in a step of its own
    expect(laidOut()).toBe(false);
    at.svh = 500;
    expect(laidOut()).toBe(true);
  });

  it("leaves out a unit the page lacks", () => {
    const at = units();
    expect(laidOut()).toBe(true);
    at.svh = 0;
    at.lvh = 0;
    at.vh = 700;
    expect(laidOut()).toBe(true);
  });

  // Checked on the page as it stands, not only against where it last stood: a step that lags a whole resize behind
  // through a drag moves every unit since then, and was taken for a page laid out (the review, L1).
  it("is not laid out while 100vh and 100lvh disagree, though every unit has moved", () => {
    const at = units();
    expect(laidOut()).toBe(true);
    Object.assign(at, { vh: 850, svh: 900, lvh: 900 }); // the drag's first resize: 100vh only
    expect(laidOut()).toBe(false);
    Object.assign(at, { vh: 800, svh: 850, lvh: 850 }); // its second: the small and large one resize behind
    expect(laidOut()).toBe(false);
    Object.assign(at, { svh: 800, lvh: 800 });
    expect(laidOut()).toBe(true);
  });

  // A browser that moves one unit alone would otherwise keep no place at all, and what waited for it would wait for good.
  it("adopts measures that have stood apart for APART_MS, and tells every piece that waited", () => {
    vi.useFakeTimers();
    try {
      const at = units();
      document.body.innerHTML = `<div id="piece"></div>`;
      const heard = vi.fn();
      const stop = watchView(document.getElementById("piece")!, heard);
      expect(laidOut()).toBe(true);
      at.svh = 800; // 100svh alone, for good
      expect(laidOut()).toBe(false);
      vi.advanceTimersByTime(APART_MS - 1);
      expect(heard).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(heard).toHaveBeenCalledTimes(1);
      expect(laidOut()).toBe(true);
      at.svh = 900; // apart again: timed afresh
      expect(laidOut()).toBe(false);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("adopts the gap between 100vh and 100lvh of a browser whose default viewport is not its large one", () => {
    vi.useFakeTimers();
    try {
      const at = units();
      at.vh = 850; // from the first read
      expect(laidOut()).toBe(true);
      Object.assign(at, { vh: 650, svh: 700, lvh: 700 }); // a resize there keeps the gap
      expect(laidOut()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  // The live pin (above 02) answers a resize "resize" found half laid out before 02's guard does, as "resize" itself
  // came before any observer: after it, its move past it from the place held before both undid 02's (the review, H1).
  it("tells the pieces in document order, whatever order they asked in", () => {
    const callbacks: ResizeObserverCallback[] = [];
    const Real = window.ResizeObserver;
    window.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) {
        callbacks.push(callback);
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
    try {
      document.body.innerHTML = `<section id="above"></section><section id="below"></section>`;
      const told: string[] = [];
      const stops = [watchView(document.getElementById("below")!, () => told.push("below")), watchView(document.getElementById("above")!, () => told.push("above"))];
      expect(callbacks).toHaveLength(1); // one observer for every piece
      callbacks[0]!([], {} as ResizeObserver);
      expect(told).toEqual(["above", "below"]);
      for (const stop of stops) stop();
    } finally {
      window.ResizeObserver = Real;
    }
  });

  // Kept by the window's size, a large viewport read between the steps stayed the old window's until the next "resize".
  it("reads the large viewport from the layout each time, though the window's size has not changed", () => {
    const at = units();
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(900);
    at.lvh = 860;
    expect(viewHeight()).toBe(860);
    at.lvh = 900;
    expect(viewHeight()).toBe(900);
  });
});
