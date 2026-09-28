import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JUMP_EVENT, LAYOUT_EVENT } from "@/components/landing/journey/journey-events";
import { startRun } from "@/components/landing/journey/run";
import { MODULES } from "@/components/landing/journey/start-journey";
import { testContext } from "./journey-context";

// run.ts on a laid-out stand-in (jsdom lays nothing out): three stations 300px wide, 500px apart, on a 1440×836 pin.
// Anime's scroll sync is the e2e's to prove (run.spec.ts); here it is a stand-in, faithful in one thing: an observer
// adopts its target only on anime's first tick after it is made (target null until then), and refreshing it before
// that reads the null target's box and throws, as anime's own updateBounds does.
const anime = vi.hoisted(() => ({ observers: [] as Array<{ target: Element | null; refreshes: number; reverted: boolean }> }));
vi.mock("animejs", () => ({
  onScroll: () => {
    const observer = {
      target: null as Element | null,
      refreshes: 0,
      reverted: false,
      refresh() {
        if (!this.target) throw new TypeError("Cannot read properties of null (reading 'getBoundingClientRect')");
        this.refreshes += 1;
        return this;
      },
      revert() {
        this.reverted = true;
      },
    };
    anime.observers.push(observer);
    return observer;
  },
  animate: () => ({ revert: () => undefined }),
}));

const MARKUP = `<header></header><div id="run" class="run"><div class="run-pin"><div class="run-window" aria-hidden="true"><svg class="run-far"></svg><svg class="run-line"></svg><svg class="run-near"></svg></div><span class="run-train" aria-hidden="true"><span></span></span><div class="run-track"><section id="features"><div class="run-intro" data-station=""></div><article data-station=""></article></section><section id="use"><div data-station=""></div></section></div></div></div>`;

function lay(runTop: number, pinHeight = 836): HTMLElement {
  const run = document.getElementById("run")!;
  run.getBoundingClientRect = () => ({ top: runTop, bottom: runTop + 900, left: 0, right: 1440, width: 1440, height: 900 }) as DOMRect;
  const pin = run.querySelector<HTMLElement>(".run-pin")!;
  Object.defineProperty(pin, "clientHeight", { configurable: true, value: pinHeight });
  Object.defineProperty(pin, "clientWidth", { configurable: true, value: 1440 });
  run.querySelector<HTMLElement>(".run-track")!.getBoundingClientRect = () => ({ left: 0 }) as DOMRect;
  run.querySelectorAll<HTMLElement>("[data-station]").forEach((s, i) => {
    Object.defineProperty(s, "offsetHeight", { configurable: true, value: 300 });
    s.getBoundingClientRect = () => ({ left: i * 500, right: i * 500 + 300, top: 0, bottom: 300 }) as DOMRect;
  });
  return run;
}

beforeEach(() => {
  anime.observers.length = 0;
  document.body.innerHTML = MARKUP;
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("the window-seat run (J6-7, J6-8)", () => {
  it("leaves 06 and 07 as the server drew them with Motion off", () => {
    const run = lay(200);
    const stop = startRun(testContext({ motion: false }));
    expect(run.classList.contains("is-running")).toBe(false);
    stop();
  });

  it("pins when the reader is above it and every station fits: its height, the window's lines, where each section stands", () => {
    const run = lay(200);
    const stop = startRun(testContext());
    expect(run.classList.contains("is-running")).toBe(true);
    // centres 150, 650, 1150: the travel is 1000, and the pin plus the travel is the run's height
    expect(run.style.getPropertyValue("--run-h")).toBe("1836px");
    expect(run.querySelector(".run-line .run-stop")).not.toBeNull();
    expect(run.querySelectorAll(".run-line .run-km").length).toBeGreaterThan(0);
    // the page y each section's top would have: the run's start plus its first station's anchor (no masthead here)
    expect(document.getElementById("features")?.dataset.runAt).toBe("200");
    expect(document.getElementById("use")?.dataset.runAt).toBe("1200");
    expect(document.getElementById("use")?.getAttribute("tabindex")).toBe("-1");
    expect(document.querySelector("[data-station].is-here")).toBe(document.querySelector(".run-intro"));
    stop();
  });

  it("waits while the reader is below it, and pins once they are back above it (J3's rule)", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const run = lay(-500);
    const stop = startRun(testContext());
    expect(run.classList.contains("is-running")).toBe(false);
    lay(100);
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersToNextFrame();
    expect(run.classList.contains("is-running")).toBe(true);
    stop();
  });

  it("never pins a window too short for its stations", () => {
    const run = lay(200, 400); // 400 - 96 - 20 leaves 284px for 300px stations
    const stop = startRun(testContext());
    expect(run.classList.contains("is-running")).toBe(false);
    expect(run.style.getPropertyValue("--run-band")).toBe("");
    stop();
  });

  it("brings 07's first station to the window from a link to it, says so in the address, and focuses 07 in place", () => {
    lay(200);
    const push = vi.spyOn(window.history, "pushState");
    const stop = startRun(testContext());
    const link = document.createElement("a");
    link.href = "#use";
    document.body.append(link);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(push).toHaveBeenCalledWith(null, "", "#use");
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 1200 });
    expect(document.activeElement?.id).toBe("use");
    stop();
  });

  // The run pins in a frame (a reader below it coming back above it, as on /#faq), and a layout change already queued
  // for that frame re-measures it before anime's first tick has adopted the new observer's target: refreshing it then
  // threw, uncaught (final review ruling). Anime refreshes a target it adopts itself, reading the layout as it stands.
  it("re-measures on a layout change before anime has adopted its observer's target, without refreshing it", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const run = lay(200);
    const stop = startRun(testContext());
    expect(run.classList.contains("is-running")).toBe(true);
    window.dispatchEvent(new Event(LAYOUT_EVENT));
    expect(() => vi.advanceTimersToNextFrame()).not.toThrow();
    expect(anime.observers.at(-1)?.refreshes).toBe(0);
    stop();
  });

  it("refreshes its observer on a layout change once anime has adopted its target", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const run = lay(200);
    const stop = startRun(testContext());
    const observer = anime.observers.at(-1)!;
    observer.target = run; // anime's first tick
    window.dispatchEvent(new Event(LAYOUT_EVENT));
    vi.advanceTimersToNextFrame();
    expect(observer.refreshes).toBe(1);
    stop();
  });

  it("is started last, so a rebuild tears it down first: its unpin is measured on the page the reader sees, before the still's and the drawing's teardowns change the layout above it for a moment", () => {
    expect(MODULES.at(-1)).toBe(startRun);
  });

  // A Tab stop's glide to the window can be cut short: a piece above moves the page by a place-keeping jump (jumpTo; the
  // drawing falling to the still under load), and an instant scroll cancels the smooth one, leaving focus off-screen
  // (WCAG 2.4.11). Its station is brought back after each such cut, at most three times, and never against the reader
  // (Task 6 review, rounds 2–4).
  describe("a Tab stop's glide to its station", () => {
    const watchlist = () => {
      const link = document.createElement("a");
      link.href = "/watchlist";
      document.querySelector("#features article")!.append(link);
      return link; // its station (the second: centre 650) stands at the window at 200 + 500
    };
    /** Focus as the keyboard gives it (:focus-visible), said outright: jsdom's own modality guess carries between tests. */
    const keyboard = (el: HTMLElement) => {
      const own = Element.prototype.matches.bind(el);
      vi.spyOn(el, "matches").mockImplementation((selector: string) => selector === ":focus-visible" || own(selector));
      return el;
    };
    /** Tab onto it: a Tab keydown, then the focus it moves. */
    const tab = (el: HTMLElement) => {
      keyboard(el);
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
      el.focus();
    };
    const frames = (n: number) => {
      for (let k = 0; k < n; k += 1) vi.advanceTimersToNextFrame();
    };
    const jump = () => {
      window.dispatchEvent(new Event(JUMP_EVENT));
      window.dispatchEvent(new Event(LAYOUT_EVENT));
    };

    /** The times its station was brought back to the window since the Tab's own glide. */
    const retakes = () => vi.mocked(window.scrollTo).mock.calls.filter((call) => JSON.stringify(call) === '[{"top":700}]').length;

    it("glides for keyboard focus, and takes it up after each jump that cuts it short, at most three times", () => {
      vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
      lay(200);
      const stop = startRun(testContext());
      tab(watchlist());
      expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 700 });
      vi.mocked(window.scrollTo).mockClear();
      for (const times of [1, 2, 3, 3]) {
        jump(); // the still's jump comes a few frames after the first: taken up too
        frames(3);
        expect(retakes()).toBe(times);
      }
      stop();
    });

    it("lets go once the page has held still for ten frames after a retake", () => {
      vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
      lay(200);
      const stop = startRun(testContext());
      tab(watchlist());
      vi.mocked(window.scrollTo).mockClear();
      jump();
      frames(3);
      expect(retakes()).toBe(1);
      frames(10);
      jump();
      frames(3);
      expect(retakes()).toBe(1);
      stop();
    });

    it("glides for a Tab a busy page dispatches late: a key event is stamped with its input time, long before the focus", () => {
      vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
      lay(200);
      const stop = startRun(testContext());
      const link = keyboard(watchlist());
      const late = new KeyboardEvent("keydown", { key: "Tab" });
      Object.defineProperty(late, "timeStamp", { value: performance.now() - 2000 }); // input taken 2 s before it ran
      window.dispatchEvent(late);
      link.focus();
      expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 700 });
      stop();
    });

    it("does not glide for focus that is not the keyboard's: a mouse, or the window regaining focus", () => {
      vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
      lay(200);
      const stop = startRun(testContext());
      keyboard(watchlist()).focus(); // :focus-visible, but no Tab moved it: focus returning to the window
      jump();
      frames(3);
      expect(window.scrollTo).not.toHaveBeenCalledWith({ top: 700 });
      stop();
    });

    it("does not pull back a reader who dragged away, however long after, whatever the layout does", () => {
      vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
      lay(200);
      const stop = startRun(testContext());
      tab(watchlist());
      vi.mocked(window.scrollTo).mockClear();
      frames(60);
      window.dispatchEvent(new Event(LAYOUT_EVENT));
      window.dispatchEvent(new Event("resize"));
      frames(3);
      jump(); // even a jump, once the page has held still
      frames(3);
      expect(window.scrollTo).not.toHaveBeenCalledWith({ top: 700 });
      stop();
    });

    it("arms nothing for a station already at the window: no glide starts", () => {
      vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
      lay(200);
      const stop = startRun(testContext());
      expect(document.getElementById("run")?.classList.contains("is-running")).toBe(true);
      lay(-500); // the reader has scrolled on: its station stands at the window
      vi.spyOn(window, "scrollY", "get").mockReturnValue(700);
      tab(watchlist());
      expect(window.scrollTo).not.toHaveBeenCalledWith({ top: 700 });
      jump();
      frames(3);
      expect(window.scrollTo).not.toHaveBeenCalledWith({ top: 700 });
      stop();
    });

    // Safari reveals the link a Tab moved focus to with a glide of its own, begun after focusin's listeners have run, which
    // replaces this one: Option-Tab brought the second station to rest 160px short of the window (the nightly's WebKit).
    it("aims again in the task after the focus, once the browser's own reveal of the link has begun, while focus stays", () => {
      vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout"] });
      lay(200);
      const stop = startRun(testContext());
      const link = watchlist();
      tab(link);
      expect(window.scrollTo).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(0);
      expect(window.scrollTo).toHaveBeenCalledTimes(2);
      expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 700 });
      link.blur();
      vi.mocked(window.scrollTo).mockClear();
      tab(link); // and not once focus has left the station in between
      link.blur();
      vi.advanceTimersByTime(0);
      expect(window.scrollTo).toHaveBeenCalledTimes(1);
      stop();
    });

    it("never aims again once the reader has taken the scroll: a wheel, or a press of the pointer, before the next task", () => {
      vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout"] });
      lay(200);
      const stop = startRun(testContext());
      const link = watchlist();
      for (const own of [new WheelEvent("wheel", { deltaY: 120 }), new PointerEvent("pointerdown")]) {
        tab(link);
        expect(window.scrollTo).toHaveBeenCalledTimes(1);
        window.dispatchEvent(own);
        vi.advanceTimersByTime(0);
        expect(window.scrollTo, own.type).toHaveBeenCalledTimes(1);
        link.blur();
        vi.mocked(window.scrollTo).mockClear();
      }
      stop();
    });

    // A drag of the scrollbar sends no wheel, touch or key, so it never lets go of the watch; and on a busy page the
    // frames run before the next task, so the drag can land before the re-aim. Re-aimed only while the page still
    // stands between where the Tab found it and the station: a reader who left that span moved on (final review, I2).
    it("never aims again once the page has left the span between the focus and the station: a drag away before the next task", () => {
      vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout"] });
      const scroll = { y: 100 };
      vi.spyOn(window, "scrollY", "get").mockImplementation(() => scroll.y);
      lay(200 - scroll.y);
      const stop = startRun(testContext());
      const link = watchlist();
      tab(link); // its station at 700: the Tab found the page at 100
      expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 700 });
      vi.mocked(window.scrollTo).mockClear();
      scroll.y = 40; // dragged back up, out of the span
      lay(200 - scroll.y);
      vi.advanceTimersByTime(0);
      expect(window.scrollTo).not.toHaveBeenCalled();
      link.blur();
      scroll.y = 100; // and a reveal that stopped short, inside it, is still aimed again
      lay(200 - scroll.y);
      tab(link);
      vi.mocked(window.scrollTo).mockClear();
      scroll.y = 540;
      lay(200 - scroll.y);
      vi.advanceTimersByTime(0);
      expect(window.scrollTo).toHaveBeenCalledWith({ top: 700 });
      stop();
    });

    // Shift+Tab from 08 for a reader below the run (a /#faq link, a Back restore): focus lands on a card while the run
    // stands unpinned, and the browser glides up to it. The glide brings the run's top into the window, so it pins, at
    // its start: the card now far to the right, clipped by the pin, and nothing would bring its station to the window
    // (final review, I1; WCAG 2.4.11). Aimed once the pin takes hold, while the watch still holds the Tab's glide.
    it("brings the station to the window once the run pins under a Tab's glide that began before it was pinned", () => {
      vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
      const run = lay(-500); // the reader below the run: it waits, unpinned
      const stop = startRun(testContext());
      expect(run.classList.contains("is-running")).toBe(false);
      tab(watchlist());
      expect(window.scrollTo).not.toHaveBeenCalled(); // the browser's own glide, not the run's
      lay(100); // the glide brings the run's top into the window
      window.dispatchEvent(new Event("scroll"));
      vi.advanceTimersToNextFrame();
      expect(run.classList.contains("is-running")).toBe(true);
      expect(window.scrollTo).toHaveBeenCalledWith({ top: 600 }); // 100 + its station's anchor, 500
      stop();
    });

    it("leaves the reader where they are when the run pins after they took the scroll from the Tab's glide", () => {
      vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
      const run = lay(-500);
      const stop = startRun(testContext());
      tab(watchlist());
      window.dispatchEvent(new WheelEvent("wheel", { deltaY: -120 }));
      lay(100);
      window.dispatchEvent(new Event("scroll"));
      vi.advanceTimersToNextFrame();
      expect(run.classList.contains("is-running")).toBe(true);
      expect(window.scrollTo).not.toHaveBeenCalled();
      stop();
    });

    it("aims nothing when the run pins for focus the keyboard did not move there", () => {
      vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
      const run = lay(-500);
      const stop = startRun(testContext());
      keyboard(watchlist()).focus(); // :focus-visible, but no Tab moved it
      lay(100);
      window.dispatchEvent(new Event("scroll"));
      vi.advanceTimersToNextFrame();
      expect(run.classList.contains("is-running")).toBe(true);
      expect(window.scrollTo).not.toHaveBeenCalled();
      stop();
    });

    it("lets go on the reader's own scroll: a press of the pointer", () => {
      vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
      lay(200);
      const stop = startRun(testContext());
      tab(watchlist());
      vi.mocked(window.scrollTo).mockClear();
      window.dispatchEvent(new PointerEvent("pointerdown"));
      jump();
      frames(3);
      expect(window.scrollTo).not.toHaveBeenCalledWith({ top: 700 });
      stop();
    });
  });

  it("puts everything back on teardown", () => {
    const run = lay(200);
    const stop = startRun(testContext());
    stop();
    expect(run.classList.contains("is-running")).toBe(false);
    expect(run.getAttribute("style") ?? "").toBe("");
    expect(run.querySelector(".run-line")?.childNodes.length).toBe(0);
    expect(run.querySelector(".run-line")?.hasAttribute("viewBox")).toBe(false);
    expect(document.querySelectorAll("[data-run-at], [tabindex], .is-here, .is-passed, .run-snap")).toHaveLength(0);
  });
});
