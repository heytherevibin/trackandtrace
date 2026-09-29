import { afterEach, describe, expect, it, vi } from "vitest";
import { keepPlace } from "@/components/landing/journey/keep-place";

// keepPlace (J5-3): a pinned piece changes its height, then the reader lands where placeAfter says. The piece's
// box after the change is read against whatever scroll the browser holds by then.

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function page(): { readonly piece: HTMLElement; readonly doc: { top: number; height: number }; readonly scroll: { y: number } } {
  document.body.innerHTML = `<header></header><div id="piece"></div>`;
  document.querySelector("header")!.getBoundingClientRect = () => ({ bottom: 64 }) as DOMRect;
  const piece = document.getElementById("piece")!;
  const doc = { top: 5000, height: 3400 };
  const scroll = { y: 0 };
  vi.spyOn(window, "scrollY", "get").mockImplementation(() => scroll.y);
  vi.spyOn(window, "innerHeight", "get").mockImplementation(() => 900);
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
