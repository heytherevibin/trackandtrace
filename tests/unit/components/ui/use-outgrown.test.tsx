import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useOutgrown } from "@/components/ui/use-outgrown";

// jsdom lays nothing out: the box's width and the root's font size are set by hand, the observer driven by hand.
let observed: (() => void)[] = [];
let RealResizeObserver: typeof ResizeObserver;
const resize = () => act(() => observed.forEach((notify) => notify()));

function Box() {
  const [box, outgrown] = useOutgrown<HTMLDivElement>(19.5);
  return (
    <div ref={box} data-testid="box">
      {outgrown ? "stacked" : "table"}
    </div>
  );
}
function sized(width: number, rootPx: number): HTMLElement {
  const box = screen.getByTestId("box");
  Object.defineProperty(box, "clientWidth", { configurable: true, value: width });
  document.documentElement.style.fontSize = `${rootPx}px`;
  resize();
  return box;
}

beforeEach(() => {
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
});
afterEach(() => {
  window.ResizeObserver = RealResizeObserver;
  document.documentElement.style.fontSize = "";
});

describe("useOutgrown", () => {
  it("is never true at the drawn text size, however narrow the box: what is drawn at 100% stays as drawn", () => {
    render(<Box />);
    expect(sized(196, 16)).toHaveTextContent("table");
    expect(sized(40, 16)).toHaveTextContent("table");
  });

  it("is true with the text made larger and the box narrower than its measure of it, and false again when the box holds it", () => {
    render(<Box />);
    expect(sized(400, 32)).toHaveTextContent("stacked"); // 19.5rem is 624px at 32px
    expect(sized(640, 32)).toHaveTextContent("table");
    expect(sized(400, 20)).toHaveTextContent("table"); // 390px at 20px
    expect(sized(380, 20)).toHaveTextContent("stacked");
  });

  it("says nothing before its observer first reports: the server's markup is the table", () => {
    render(<Box />);
    expect(screen.getByTestId("box")).toHaveTextContent("table");
  });
});
