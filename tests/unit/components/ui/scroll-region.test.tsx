import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ScrollRegion } from "@/components/ui/scroll-region";

// jsdom lays nothing out, so the two widths the region compares are set by hand and its observer is driven by hand.
let observed: (() => void)[] = [];

function widths(el: Element, scroll: number, client: number): void {
  Object.defineProperty(el, "scrollWidth", { configurable: true, value: scroll });
  Object.defineProperty(el, "clientWidth", { configurable: true, value: client });
}
const resize = () => act(() => observed.forEach((notify) => notify()));

let RealResizeObserver: typeof ResizeObserver;
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
});

describe("ScrollRegion", () => {
  it("is a plain box while its content fits: no role, no name, no stop in the Tab order", () => {
    const { container } = render(
      <ScrollRegion label="Passengers">
        <table />
      </ScrollRegion>,
    );
    const box = container.firstElementChild as HTMLElement;
    widths(box, 300, 300);
    resize();
    expect(box).toHaveClass("overflow-x-auto");
    expect(box).not.toHaveAttribute("role");
    expect(box).not.toHaveAttribute("tabindex");
    expect(box).not.toHaveAttribute("aria-label");
  });

  it("becomes a named region in the Tab order once its content is wider than it, and a plain box again when it fits", () => {
    const { container } = render(
      <ScrollRegion label="Passengers">
        <table />
      </ScrollRegion>,
    );
    const box = container.firstElementChild as HTMLElement;
    widths(box, 620, 300);
    resize();
    expect(box).toHaveAttribute("role", "region");
    expect(box).toHaveAttribute("tabindex", "0");
    expect(box).toHaveAttribute("aria-label", "Passengers");
    widths(box, 300, 300);
    resize();
    expect(box).not.toHaveAttribute("role");
    expect(box).not.toHaveAttribute("tabindex");
  });

  it("takes its name from a heading when given one's id", () => {
    const { container } = render(
      <ScrollRegion labelledBy="passengers-title">
        <table />
      </ScrollRegion>,
    );
    const box = container.firstElementChild as HTMLElement;
    widths(box, 620, 300);
    resize();
    expect(box).toHaveAttribute("aria-labelledby", "passengers-title");
    expect(box).not.toHaveAttribute("aria-label");
  });

  it("watches its content as well as itself: a table that grows inside an unchanged box is seen", () => {
    render(
      <ScrollRegion label="Passengers">
        <table />
      </ScrollRegion>,
    );
    expect(observed).toHaveLength(2);
  });
});
