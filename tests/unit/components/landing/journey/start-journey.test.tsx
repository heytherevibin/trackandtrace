import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOTION_EVENT } from "@/components/motion/use-motion";

// The journey cut down to the terminus (2026-10-18): one module, the drawing. startJourney marks the page, starts it,
// rebuilds it on the Motion switch, and stops everything it started when a build throws or the journey ends.

const drawing = vi.hoisted(() => ({ builds: 0, throwOn: 0, stopped: 0, disposed: vi.fn() }));
vi.mock("@/components/landing/journey/drawing", () => ({
  startDrawing: (ctx: { readonly atEnd: (stop: () => void) => void }) => {
    drawing.builds += 1;
    if (drawing.builds === drawing.throwOn) throw new Error("boom");
    // Stands in for the live drawing, which keeps its engine for the journey's lifetime this way (scene/live.ts).
    ctx.atEnd(drawing.disposed);
    return () => {
      drawing.stopped += 1;
    };
  },
}));

const { MODULES, lifetime, startJourney } = await import("@/components/landing/journey/start-journey");

async function frames(n = 3): Promise<void> {
  for (let i = 0; i < n; i += 1) await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
}

beforeEach(() => {
  drawing.builds = 0;
  drawing.throwOn = 0;
  drawing.stopped = 0;
  drawing.disposed.mockClear();
  document.documentElement.removeAttribute("data-journey");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => vi.restoreAllMocks());

describe("startJourney", () => {
  it("starts the drawing alone", () => {
    expect(MODULES).toHaveLength(1);
  });

  it("marks the page while it runs, and puts it back when it ends", async () => {
    const end = startJourney();
    expect(document.documentElement).toHaveAttribute("data-journey", "on");
    await frames();
    expect(drawing.builds).toBe(1);
    end();
    expect(document.documentElement).not.toHaveAttribute("data-journey");
    expect(drawing.stopped).toBe(1);
    expect(drawing.disposed).toHaveBeenCalledTimes(1);
  });

  it("rebuilds the drawing when the Motion switch changes, keeping its engine", async () => {
    const end = startJourney();
    await frames();
    window.dispatchEvent(new Event(MOTION_EVENT));
    expect(drawing.builds).toBe(2);
    expect(drawing.stopped).toBe(1);
    expect(drawing.disposed).not.toHaveBeenCalled();
    end();
  });

  it("marks the journey failed and stops everything when a build throws", async () => {
    drawing.throwOn = 1;
    startJourney();
    await frames();
    expect(document.documentElement).not.toHaveAttribute("data-journey", "on");
    window.dispatchEvent(new Event(MOTION_EVENT));
    expect(drawing.builds).toBe(1);
  });
});

describe("lifetime", () => {
  it("runs each stop once, in reverse, and a late one at once", () => {
    const life = lifetime();
    const order: string[] = [];
    life.atEnd(() => order.push("a"));
    life.atEnd(() => order.push("b"));
    life.end();
    life.end();
    life.atEnd(() => order.push("c"));
    expect(order).toEqual(["b", "a", "c"]);
  });
});
