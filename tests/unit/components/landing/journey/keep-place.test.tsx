import { afterEach, describe, expect, it, vi } from "vitest";
import { keepPlace } from "@/components/landing/journey/keep-place";

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
