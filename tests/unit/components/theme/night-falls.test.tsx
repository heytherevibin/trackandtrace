import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_EVENT } from "@/components/landing/journey/journey-events";
import { SWEEP_MS, nightFalls, sweepFrom, themeApplied } from "@/components/theme/night-falls";

// Night falls (spec §3.F; J6-10). jsdom has no View Transitions and no Element#animate: the tests give it stand-ins.

const html = document.documentElement;

afterEach(() => {
  delete html.dataset.motion;
  delete html.dataset.theme;
  delete html.dataset.themeSweep;
  Reflect.deleteProperty(document, "startViewTransition");
  Reflect.deleteProperty(html, "animate");
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function button(): HTMLButtonElement {
  const b = document.createElement("button");
  b.getBoundingClientRect = () => ({ left: 100, top: 10, width: 36, height: 36 }) as DOMRect;
  return b;
}

function listen(): { readonly heard: () => number; readonly stop: () => void } {
  let count = 0;
  const hear = () => {
    count += 1;
  };
  window.addEventListener(THEME_EVENT, hear);
  return { heard: () => count, stop: () => window.removeEventListener(THEME_EVENT, hear) };
}

describe("the sweep's circle", () => {
  it("starts at the button's centre and reaches the window's farthest corner", () => {
    expect(sweepFrom({ left: 1380, top: 14, width: 36, height: 36 }, { width: 1440, height: 900 })).toEqual({ x: 1398, y: 32, reach: Math.ceil(Math.hypot(1398, 868)) });
  });
});

describe("themeApplied", () => {
  it("resolves at once when <html> already reads the theme", async () => {
    html.dataset.theme = "dark";
    await expect(themeApplied("dark")).resolves.toBeUndefined();
  });

  it("resolves when next-themes writes it", async () => {
    html.dataset.theme = "light";
    const done = themeApplied("dark");
    html.dataset.theme = "dark";
    await expect(done).resolves.toBeUndefined();
  });

  it("stops waiting after 100 ms", async () => {
    vi.useFakeTimers();
    html.dataset.theme = "light";
    const done = vi.fn();
    void themeApplied("dark").then(done);
    await vi.advanceTimersByTimeAsync(99);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalledTimes(1);
  });
});

describe("nightFalls", () => {
  it("switches at once where the browser has no View Transitions, then redraws the train", async () => {
    html.dataset.motion = "on";
    html.dataset.theme = "light";
    const theme = listen();
    const apply = vi.fn(() => {
      html.dataset.theme = "dark";
    });
    nightFalls(button(), apply, "dark");
    expect(apply).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(theme.heard()).toBe(1));
    expect(html.dataset.themeSweep).toBeUndefined();
    theme.stop();
  });

  it("switches at once with Motion off, even where View Transitions exist", async () => {
    html.dataset.motion = "off";
    html.dataset.theme = "light";
    const start = vi.fn();
    Object.defineProperty(document, "startViewTransition", { configurable: true, value: start });
    const theme = listen();
    // the theme is written, as next-themes would: a themeApplied left waiting would redraw inside the next test
    const apply = vi.fn(() => {
      html.dataset.theme = "dark";
    });
    nightFalls(button(), apply, "dark");
    expect(apply).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(theme.heard()).toBe(1));
    theme.stop();
  });

  it("sweeps out from the button: the change inside a view transition, the train redrawn in it, the new page revealed by a widening circle", async () => {
    html.dataset.motion = "on";
    html.dataset.theme = "light";
    const updates: Array<() => Promise<void>> = [];
    const done: { finish: () => void } = { finish: () => undefined };
    const finished = new Promise<void>((resolve) => {
      done.finish = resolve;
    });
    const start = vi.fn((update: () => Promise<void>) => {
      updates.push(update);
      return { ready: Promise.resolve(), finished, updateCallbackDone: Promise.resolve(), skipTransition: () => undefined };
    });
    Object.defineProperty(document, "startViewTransition", { configurable: true, value: start });
    const animate = vi.fn();
    Object.defineProperty(html, "animate", { configurable: true, value: animate });
    const theme = listen();
    const apply = vi.fn(() => {
      html.dataset.theme = "dark";
    });
    nightFalls(button(), apply, "dark");
    expect(start).toHaveBeenCalledTimes(1);
    expect(html.dataset.themeSweep).toBe("");
    expect(apply).not.toHaveBeenCalled(); // only inside the transition's update
    await updates[0]!();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(theme.heard()).toBe(1); // redrawn inside the capture, in the new theme
    const { x, y, reach } = sweepFrom({ left: 100, top: 10, width: 36, height: 36 }, { width: window.innerWidth, height: window.innerHeight });
    await vi.waitFor(() =>
      expect(animate).toHaveBeenCalledWith({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${reach}px at ${x}px ${y}px)`] }, expect.objectContaining({ duration: SWEEP_MS, pseudoElement: "::view-transition-new(root)" })),
    );
    done.finish();
    await vi.waitFor(() => expect(html.dataset.themeSweep).toBeUndefined());
    theme.stop();
  });
});
