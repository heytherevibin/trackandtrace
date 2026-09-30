import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOTION_EVENT } from "@/components/motion/use-motion";
import { MODULES, lifetime, startJourney } from "@/components/landing/journey/start-journey";

// A module that throws, on the journey's first build (which starts a module at a time) or on a rebuild: the loader's
// teardown is not what ends it, so startJourney must stop everything it started itself — the place guard above all,
// which would otherwise keep scrolling a reader inside #how on a page marked "failed" — and the engine it keeps.

const chapters = vi.hoisted(() => ({ builds: 0, throwOn: 1, disposed: vi.fn() }));
vi.mock("@/components/landing/journey/chapters", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/components/landing/journey/chapters")>();
  return {
    ...real,
    startChapters: (ctx: Parameters<typeof real.startChapters>[0]) => {
      chapters.builds += 1;
      if (chapters.builds === chapters.throwOn) throw new Error("boom");
      // Stands in for the live drawing, which keeps its engine for the journey's lifetime this way (scene/live.ts).
      ctx.atEnd(chapters.disposed);
      return real.startChapters(ctx);
    },
  };
});

type Listener = EventListenerOrEventListenerObject;

describe("startJourney, when a build throws", () => {
  const observing = new Set<object>();
  const listening: { readonly type: string; readonly listener: Listener }[] = [];
  const stub = window.ResizeObserver;

  beforeEach(() => {
    chapters.builds = 0;
    chapters.throwOn = 1;
    chapters.disposed.mockClear();
    window.sessionStorage.setItem("tt.intro", "1"); // no intro: the modules alone
    document.body.innerHTML = `<section id="how"></section>`;
    document.documentElement.removeAttribute("data-journey");
    class Observer {
      observe(): void {
        observing.add(this);
      }
      unobserve(): void {}
      disconnect(): void {
        observing.delete(this);
      }
    }
    window.ResizeObserver = Observer as unknown as typeof ResizeObserver;
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    vi.spyOn(window, "addEventListener").mockImplementation((type: string, listener: Listener | null, options?: boolean | AddEventListenerOptions) => {
      if (!listener) return;
      listening.push({ type, listener });
      add(type, listener, options);
    });
    vi.spyOn(window, "removeEventListener").mockImplementation((type: string, listener: Listener | null, options?: boolean | EventListenerOptions) => {
      const k = listening.findIndex((l) => l.type === type && l.listener === listener);
      if (k >= 0) listening.splice(k, 1);
      if (listener) remove(type, listener, options);
    });
  });
  afterEach(() => {
    window.ResizeObserver = stub;
    observing.clear();
    listening.length = 0;
    document.body.replaceChildren();
    window.sessionStorage.clear();
  });

  it("on the first build: reports the error, marks the journey failed, and leaves nothing listening or observing", async () => {
    const reported = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const stop = startJourney();
    await vi.waitFor(() => expect(document.documentElement.getAttribute("data-journey")).toBe("failed"));
    await vi.waitFor(() => expect(reported).toHaveBeenCalledWith(new Error("boom")));
    expect(observing.size).toBe(0);
    expect(listening.map((l) => l.type)).toEqual([]);
    stop(); // the loader's own teardown, later, is harmless
    expect(document.documentElement.getAttribute("data-journey")).toBe("failed");
    reported.mockRestore();
  });

  it("on a rebuild: ends the journey exactly as a failed first build does, the engine it kept disposed", async () => {
    chapters.throwOn = 2;
    const reported = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const stop = startJourney();
    await vi.waitFor(() => expect(window.__ttJourneyStarted).toBe(true));
    expect(chapters.disposed).not.toHaveBeenCalled();
    window.dispatchEvent(new Event(MOTION_EVENT)); // the Motion switch rebuilds every module at once
    await vi.waitFor(() => expect(reported).toHaveBeenCalledWith(new Error("boom")));
    expect(document.documentElement.getAttribute("data-journey")).toBe("failed");
    expect(chapters.disposed).toHaveBeenCalledTimes(1);
    expect(observing.size).toBe(0);
    expect(listening.map((l) => l.type)).toEqual([]);
    expect(window.__ttJourneyStarted).toBeUndefined();
    stop();
    expect(chapters.disposed).toHaveBeenCalledTimes(1);
    expect(document.documentElement.getAttribute("data-journey")).toBe("failed");
    reported.mockRestore();
  });
});

describe("MODULES", () => {
  it("no longer starts the route strip: the owner removed it, on the phone and the desktop rail alike", () => {
    expect(MODULES.map((m) => m.name)).not.toContain("startStrip");
  });

  it("no longer starts the registration-mark cursor: the owner removed it, so the reader keeps their own pointer", () => {
    expect(MODULES.map((m) => m.name)).not.toContain("startCursor");
  });
});

describe("a journey's lifetime (J5-4)", () => {
  it("runs what was handed to it once, newest first, when it ends; and at once once it has ended", () => {
    const life = lifetime();
    const order: string[] = [];
    life.atEnd(() => order.push("engine"));
    life.atEnd(() => order.push("later"));
    life.end();
    life.end();
    expect(order).toEqual(["later", "engine"]);
    life.atEnd(() => order.push("late"));
    expect(order).toEqual(["later", "engine", "late"]);
  });
});
