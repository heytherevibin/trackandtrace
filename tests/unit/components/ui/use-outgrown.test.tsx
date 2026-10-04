import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOutgrown } from "@/components/ui/use-outgrown";

// jsdom lays nothing out: the page is described by hand (LAID), the boxes answer from it, and the observer is driven
// by hand. The box holds one child, the table: laid out as drawn it is as wide as it needs or as its box, whichever is
// wider (a table of `width: 100%`); stacked it is its box's width, whatever the table needed.
const BORDER = 1;
interface Laid {
  /** The window's width. */
  readonly window: number;
  /** The box's left edge in the window, and the width inside its hairlines. */
  readonly left: number;
  readonly width: number;
  /** What the table needs, at the text size it is measured at. */
  readonly need: number;
}
let laid: Laid | null = null;
let observed: (() => void)[] = [];
let RealResizeObserver: typeof ResizeObserver;
const resize = () => act(() => observed.forEach((notify) => notify()));

/** The page as laid out from here on; the observer reports it, as it does when a box changes size. */
function lay(next: Laid, rootPx = 16): HTMLElement {
  laid = next;
  document.documentElement.style.fontSize = `${rootPx}px`;
  resize();
  return screen.getByTestId("box");
}

function Box() {
  const [box, outgrown] = useOutgrown<HTMLDivElement>();
  return (
    <div ref={box} data-testid="box">
      <div data-testid="content" data-stacked={outgrown || undefined}>
        {outgrown ? "stacked" : "table"}
      </div>
    </div>
  );
}

const rect = (left: number, width: number): DOMRect => ({ left, right: left + width, width, top: 0, bottom: 0, height: 0, x: left, y: 0, toJSON: () => ({}) });

beforeEach(() => {
  laid = null;
  observed = [];
  RealResizeObserver = window.ResizeObserver;
  window.ResizeObserver = class {
    constructor(private readonly notify: () => void) {}
    observe(): void {
      observed.push(this.notify);
    }
    unobserve(): void {}
    disconnect(): void {
      observed = observed.filter((n) => n !== this.notify);
    }
  } as unknown as typeof ResizeObserver;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (!laid) return rect(0, 0);
    if (this.dataset.testid === "box") return rect(laid.left, laid.width + 2 * BORDER);
    if (this.dataset.testid === "content") return rect(laid.left + BORDER, this.dataset.stacked ? laid.width : Math.max(laid.need, laid.width));
    return rect(0, 0);
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    if (!laid) return 0;
    return this === document.documentElement ? laid.window : this.dataset.testid === "box" ? laid.width : 0;
  });
  vi.spyOn(HTMLElement.prototype, "clientLeft", "get").mockImplementation(function (this: HTMLElement) {
    return laid && this.dataset.testid === "box" ? BORDER : 0;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  window.ResizeObserver = RealResizeObserver;
  document.documentElement.style.fontSize = "";
});

// The landing's record, as measured at 100% text: the table needs 309.1px, its frame is the window less 84px (41px and
// a hairline each side), so the table's right edge is at 351.1px wherever the frame is narrower than the table.
const phone = (window: number, need = 309.1): Laid => ({ window, left: 41, width: window - 84, need });

describe("useOutgrown", () => {
  it("at the drawn text size, is true once the content would run past the window's side, where the page would cut it", () => {
    render(<Box />);
    expect(lay(phone(351))).toHaveTextContent("stacked"); // 351.1px of table in a 351px window
    expect(lay(phone(340))).toHaveTextContent("stacked");
    expect(lay(phone(280))).toHaveTextContent("stacked");
  });

  it("at the drawn text size, is false while the window shows all of the content, though it overhangs its box: as drawn", () => {
    render(<Box />);
    expect(lay(phone(352))).toHaveTextContent("table"); // 268px of frame, 309.1px of table, all of it in the window
    expect(lay(phone(390))).toHaveTextContent("table");
    expect(lay({ window: 1440, left: 770, width: 455, need: 309.1 })).toHaveTextContent("table");
  });

  it("with the text made larger, is true whenever the content is wider than its box, and false again when the box holds it", () => {
    render(<Box />);
    // 618.2px of table at 32px: in a 455px frame on a desk, where the window would show all of it
    expect(lay({ window: 1440, left: 770, width: 455, need: 618.2 }, 32)).toHaveTextContent("stacked");
    expect(lay({ window: 1440, left: 400, width: 640, need: 618.2 }, 32)).toHaveTextContent("table");
    expect(lay({ window: 480, left: 41, width: 380, need: 386.4 }, 20)).toHaveTextContent("stacked");
    expect(lay({ window: 480, left: 41, width: 398, need: 386.4 }, 20)).toHaveTextContent("table");
  });

  it("takes its measure from the content, not from a number: a wider table stacks in a wider window", () => {
    render(<Box />);
    expect(lay(phone(380, 345))).toHaveTextContent("stacked"); // 42 + 345 = 387px in 380
    expect(lay(phone(390, 345))).toHaveTextContent("table");
  });

  it("stacked, remembers what the content needed and goes back to it as drawn once the window would show it all", () => {
    render(<Box />);
    expect(lay(phone(320))).toHaveTextContent("stacked");
    expect(lay(phone(350))).toHaveTextContent("stacked"); // still 1.1px short
    expect(lay(phone(352))).toHaveTextContent("table");
    expect(lay(phone(351))).toHaveTextContent("stacked");
  });

  it("stacked, reckons what the content needs with the text size: larger text needs more, in the same box", () => {
    render(<Box />);
    expect(lay(phone(340))).toHaveTextContent("stacked"); // measured at 16px: 309.1px
    // the text back at 16px in a 420px window would fit; at 20px the same table needs 386.4px of a 336px frame
    expect(lay({ ...phone(420), need: 386.4 }, 20)).toHaveTextContent("stacked");
    expect(lay(phone(420), 16)).toHaveTextContent("table");
  });

  it("decides before the first paint, with no report from its observer: a record that cannot fit is never drawn as a table", () => {
    laid = phone(320);
    render(<Box />);
    expect(screen.getByTestId("box")).toHaveTextContent("stacked");
  });

  it("says nothing where nothing is laid out: the server's markup is the table", () => {
    render(<Box />);
    expect(screen.getByTestId("box")).toHaveTextContent("table");
  });
});
