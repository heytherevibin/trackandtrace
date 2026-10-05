import { act, render, screen } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOutgrown } from "@/components/ui/use-outgrown";

// jsdom lays nothing out: the page is described by hand (LAID), the boxes answer from it, and the observer is driven
// by hand. The box holds one child, the table: laid out as drawn it is as wide as it needs or as its box, whichever is
// wider (a table of `width: 100%`); stacked it is its box's width, whatever the table needed.
const BORDER = 1;
interface Laid {
  /** The window's width. Nothing reads it: the rule is the box's, whatever the window would show. */
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

/** Every state the box has been drawn in since it was last emptied: one entry a commit. */
let drawn: string[] = [];

function Box() {
  const [box, outgrown] = useOutgrown<HTMLDivElement>();
  useLayoutEffect(() => {
    drawn.push(outgrown ? "stacked" : "table");
  });
  return (
    <div ref={box} data-testid="box" style={{ borderLeft: `${BORDER}px solid`, borderRight: `${BORDER}px solid` }}>
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
  drawn = [];
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
});
afterEach(() => {
  vi.restoreAllMocks();
  window.ResizeObserver = RealResizeObserver;
  document.documentElement.style.fontSize = "";
});

// The landing's record, as measured at 100% text: the table needs 309.1px, and its frame is the window less 84px (41px
// and a hairline each side) on a phone.
const phone = (window: number, need = 309.1): Laid => ({ window, left: 41, width: window - 84, need });

describe("useOutgrown", () => {
  it("is true whenever the content is wider than its box, at the drawn text size as at any other", () => {
    render(<Box />);
    expect(lay(phone(280))).toHaveTextContent("stacked");
    expect(lay(phone(360))).toHaveTextContent("stacked");
    expect(lay(phone(390))).toHaveTextContent("stacked"); // 306px of frame, 309.1px of table
    expect(lay(phone(393))).toHaveTextContent("stacked"); // 309px of frame: a tenth of a pixel short
  });

  it("is true though the window would show all of the content: it is the box that has to hold it, not the window", () => {
    render(<Box />);
    // 351.1px is where the table ends in a 352px window: inside the window, 40px past its frame
    expect(lay(phone(352))).toHaveTextContent("stacked");
    expect(lay({ window: 1440, left: 770, width: 300, need: 309.1 })).toHaveTextContent("stacked");
  });

  it("is false wherever the box holds the content", () => {
    render(<Box />);
    expect(lay(phone(394))).toHaveTextContent("table"); // 310px of frame
    expect(lay(phone(430))).toHaveTextContent("table");
    expect(lay({ window: 1440, left: 770, width: 455, need: 309.1 })).toHaveTextContent("table");
  });

  it("with the text made larger, is true where the larger content is wider than its box, and false again when the box holds it", () => {
    render(<Box />);
    expect(lay({ window: 1440, left: 770, width: 455, need: 618.2 }, 32)).toHaveTextContent("stacked");
    expect(lay({ window: 1440, left: 400, width: 640, need: 618.2 }, 32)).toHaveTextContent("table");
    expect(lay({ window: 480, left: 41, width: 380, need: 386.4 }, 20)).toHaveTextContent("stacked");
    expect(lay({ window: 480, left: 41, width: 398, need: 386.4 }, 20)).toHaveTextContent("table");
  });

  it("takes its measure from the content, not from a number: a wider table stacks in a wider box", () => {
    render(<Box />);
    expect(lay(phone(420, 345))).toHaveTextContent("stacked"); // 336px of frame
    expect(lay(phone(430, 345))).toHaveTextContent("table"); // 346px
  });

  it("stacked, remembers what the content needed and goes back to it as drawn once the box would hold it", () => {
    render(<Box />);
    expect(lay(phone(320))).toHaveTextContent("stacked");
    expect(lay(phone(393))).toHaveTextContent("stacked"); // still a tenth of a pixel short
    expect(lay(phone(394))).toHaveTextContent("table");
    expect(lay(phone(393))).toHaveTextContent("stacked");
  });

  it("stacked, reckons what the content needs with the text size: larger text needs more, in the same box", () => {
    render(<Box />);
    expect(lay(phone(340))).toHaveTextContent("stacked"); // measured at 16px: 309.1px
    // the text back at 16px in a 420px window would fit; at 20px the same table needs 386.4px of a 336px frame
    expect(lay({ ...phone(420), need: 386.4 }, 20)).toHaveTextContent("stacked");
    expect(lay(phone(420), 16)).toHaveTextContent("table");
  });

  it("decides before the first paint, with no report from its observer: a record that cannot fit is never drawn as a table", () => {
    laid = phone(390);
    render(<Box />);
    expect(screen.getByTestId("box")).toHaveTextContent("stacked");
  });

  // The slack is one layout unit, 0.02px, and it is a "wider than", not an "as wide as". The box stands with its inner
  // left edge at 0 here, so every number below reaches the hook exactly as written and the sums are the hook's own.
  const exact = (need: number): Laid => ({ window: 390, left: -BORDER, width: 300, need });

  it("leaves content less than a layout unit wider than its box as drawn: a table the width of its frame is not stacked for a rounding", () => {
    render(<Box />);
    expect(lay(exact(300.01))).toHaveTextContent("table");
    expect(lay(exact(300.03))).toHaveTextContent("stacked");
  });

  it("leaves content wider than its box by exactly the slack as drawn: outgrown is wider than, not as wide as", () => {
    render(<Box />);
    expect(lay(exact(300 + 0.02))).toHaveTextContent("table");
  });

  // The observer judges a stacked box as stacked: from the measure it kept. Judged as if it were drawn as a table, it
  // would read the stacked rows' width as what the table needs, call the box wide enough, draw the table, and stack it
  // again before the paint: the same answer in the end, by way of two commits and a table's worth of layout on every
  // change of size.
  it("stacked and still too narrow after a change of size, draws nothing again: it never goes by way of the table", () => {
    render(<Box />);
    expect(lay(phone(320))).toHaveTextContent("stacked");
    drawn = [];
    expect(lay(phone(340))).toHaveTextContent("stacked");
    expect(lay(phone(300))).toHaveTextContent("stacked");
    expect(drawn, "no commit at all: the answer did not change").toEqual([]);
  });

  it("going back to the table is one change, not three", () => {
    render(<Box />);
    expect(lay(phone(320))).toHaveTextContent("stacked");
    drawn = [];
    expect(lay(phone(430))).toHaveTextContent("table");
    expect(drawn).toEqual(["table"]);
  });

  it("stops watching its box when it goes: nothing is left observing", () => {
    const { unmount } = render(<Box />);
    expect(lay(phone(320))).toHaveTextContent("stacked");
    expect(observed.length, "watching while it is drawn").toBe(1);
    unmount();
    expect(observed.length, "and not after").toBe(0);
  });

  it("says nothing where nothing is laid out: the server's markup is the table", () => {
    render(<Box />);
    expect(screen.getByTestId("box")).toHaveTextContent("table");
  });
});
