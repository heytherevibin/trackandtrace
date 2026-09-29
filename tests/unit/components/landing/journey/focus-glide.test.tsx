import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startFocusGlide, watchGlide, watchTab } from "@/components/landing/journey/focus-glide";
import { JUMP_EVENT, LAYOUT_EVENT } from "@/components/landing/journey/journey-events";
import { testContext } from "./journey-context";

// The browser glides a Tab stop into the window, and an instant scroll that keeps the reader's place (jumpTo: keepPlace,
// the still's settle, the drawing falling to the still under load) cancels that glide, stranding focus off-screen at rest
// (WCAG 2.4.11). The glide is taken up again after each such cut, at most three times, and only that: armed by a Tab that
// starts a glide, it never pulls a reader who left by their own hand (a scrollbar drag sends no wheel, touch or key), nor
// one whom focus returning to the window finds away, and it lets go once the page holds still (Task 6 review, rounds 2–4).

const reveal = vi.fn();
let box = { top: 1400, bottom: 1432 }; // on the page: below a 900px window at the top
let y = 0;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(900);
  y = 0;
  vi.spyOn(window, "scrollY", "get").mockImplementation(() => y);
  document.body.innerHTML = `<header></header><section id="reliability"><a href="/accuracy">Read the data policy</a></section><div id="run" class="run is-running"><section id="features"><article data-station=""><a href="/watchlist">Open Watchlist</a></article></section></div>`;
  document.querySelector("header")!.getBoundingClientRect = () => ({ bottom: 64 }) as DOMRect;
  box = { top: 1400, bottom: 1432 };
  for (const a of document.querySelectorAll("a")) {
    a.getBoundingClientRect = () => ({ top: box.top - y, bottom: box.bottom - y }) as DOMRect; // in the window, as scrolled
    a.scrollIntoView = reveal;
  }
  reveal.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const policy = () => document.querySelector<HTMLAnchorElement>("#reliability a")!;
const frames = (n: number) => {
  for (let k = 0; k < n; k += 1) vi.advanceTimersToNextFrame();
};
/** The browser's glide: a scroll step, each frame. */
const glide = (by = 40) => {
  y += by;
  window.dispatchEvent(new Event("scroll"));
};
/** Focus as the keyboard gives it (:focus-visible), or as a mouse does: said outright, since jsdom's own modality guess
 * carries from test to test. */
const modality = (el: HTMLElement, keyboard: boolean) => {
  const own = Element.prototype.matches.bind(el);
  vi.spyOn(el, "matches").mockImplementation((selector: string) => (selector === ":focus-visible" ? keyboard : own(selector)));
};
/** A Tab keydown: the focus it moves comes in the same task. */
const pressTab = () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
/** Focus that starts the browser's glide: a Tab's (:focus-visible), unless said otherwise (a mouse's, with no Tab). */
const tabOnto = (el: HTMLElement, keyboard = true) => {
  modality(el, keyboard);
  if (keyboard) pressTab();
  el.focus();
  glide();
  frames(1);
};
/** A place-keeping jump, as the drawing falls to the still: it cuts the glide, and the page's layout changes. */
const jump = () => {
  window.dispatchEvent(new Event(JUMP_EVENT));
  window.dispatchEvent(new Event(LAYOUT_EVENT));
};

describe("arming: a Tab's focus that starts a glide", () => {
  it("takes a glide a jump cut short up again, centred so the masthead never covers it", () => {
    const stop = startFocusGlide(testContext());
    tabOnto(policy());
    jump();
    frames(3);
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(reveal).toHaveBeenCalledWith({ block: "center", inline: "nearest" });
    stop();
  });

  it("takes up each later cut too (the still's jump, a few frames after the first), at most three times", () => {
    const stop = startFocusGlide(testContext());
    tabOnto(policy());
    for (const times of [1, 2, 3, 3]) {
      jump();
      frames(3);
      expect(reveal).toHaveBeenCalledTimes(times);
    }
    stop();
  });

  it("lets go once the page has held still for ten frames after a retake: a jump after that takes nothing up", () => {
    const stop = startFocusGlide(testContext());
    tabOnto(policy());
    jump();
    frames(3);
    expect(reveal).toHaveBeenCalledTimes(1);
    frames(10);
    jump();
    frames(3);
    expect(reveal).toHaveBeenCalledTimes(1);
    stop();
  });

  it("waits for the jumps to settle: a second jump in the next frame (the still's settle) is taken up after it", () => {
    const stop = startFocusGlide(testContext());
    tabOnto(policy());
    jump();
    frames(1);
    jump();
    expect(reveal).not.toHaveBeenCalled();
    frames(3);
    expect(reveal).toHaveBeenCalledTimes(1);
    stop();
  });

  it("is not armed by mouse focus, which starts no glide", () => {
    const stop = startFocusGlide(testContext());
    tabOnto(policy(), false);
    jump();
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
    stop();
  });

  it("arms at the focus: a jump before the glide's first scroll (a resize two frames in) is a cut, taken up", () => {
    const stop = startFocusGlide(testContext());
    modality(policy(), true);
    pressTab();
    policy().focus();
    frames(1);
    jump(); // the glide has not scrolled yet: its first step can land in the third or fourth frame
    frames(3);
    expect(reveal).toHaveBeenCalledTimes(1);
    stop();
  });

  it("still watches a glide whose first scroll comes late, within six frames", () => {
    const stop = startFocusGlide(testContext());
    modality(policy(), true);
    pressTab();
    policy().focus();
    frames(4);
    glide();
    jump();
    frames(3);
    expect(reveal).toHaveBeenCalledTimes(1);
    stop();
  });

  it("lets go if neither a scroll nor a jump comes within six frames of the focus (no glide began)", () => {
    const stop = startFocusGlide(testContext());
    modality(policy(), true);
    pressTab();
    policy().focus();
    frames(6);
    glide();
    jump();
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
    stop();
  });

  it("is not armed by focus returning to the window: :focus-visible again, but no Tab moved it", () => {
    const stop = startFocusGlide(testContext());
    modality(policy(), true);
    policy().focus();
    jump(); // a resize that comes with it
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
    stop();
  });

  it("knows a Tab only in its own task: focus a later task moves is not the Tab's", async () => {
    const stop = startFocusGlide(testContext());
    modality(policy(), true);
    pressTab();
    await new Promise((done) => setTimeout(done, 0));
    policy().focus();
    jump();
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
    stop();
  });

  it("is not armed for a Tab stop already in the viewport, nor for a station of the running run (run.ts's)", () => {
    const stop = startFocusGlide(testContext());
    box = { top: 40, bottom: 72 }; // in the viewport, if under the masthead: the browser does not scroll for it
    tabOnto(policy());
    jump();
    frames(3);
    box = { top: 1400, bottom: 1432 };
    tabOnto(document.querySelector<HTMLAnchorElement>("#run a")!);
    jump();
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
    stop();
  });
});

describe("never against the reader", () => {
  it("does not pull back a reader who left mid-glide by a drag (no wheel, touch or key): only a jump cuts a glide", () => {
    const stop = startFocusGlide(testContext());
    tabOnto(policy());
    y = 1410; // a scrollbar drag, away
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event(LAYOUT_EVENT));
    window.dispatchEvent(new Event("resize"));
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
    stop();
  });

  it("lets go once the page has held still for ten frames: a jump after that takes nothing up", () => {
    const stop = startFocusGlide(testContext());
    tabOnto(policy());
    frames(10);
    jump();
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
    stop();
  });

  it("does not let go on the first scrollend: the jump that cuts the glide sends one before the glide is taken up", () => {
    const stop = startFocusGlide(testContext());
    tabOnto(policy());
    jump();
    window.dispatchEvent(new Event("scrollend"));
    frames(3);
    expect(reveal).toHaveBeenCalledTimes(1);
    stop();
  });

  for (const [name, event] of [
    ["a press of the pointer", new PointerEvent("pointerdown")],
    ["a wheel", new WheelEvent("wheel", { deltaY: 120 })],
    ["a finger dragging", new Event("touchmove")],
    ["a key that scrolls", new KeyboardEvent("keydown", { key: "PageDown" })],
  ] as const) {
    it(`lets go on the reader's own scroll: ${name}`, () => {
      const stop = startFocusGlide(testContext());
      tabOnto(policy());
      window.dispatchEvent(event);
      jump();
      frames(3);
      expect(reveal).not.toHaveBeenCalled();
      stop();
    });
  }

  it("lets go when focus has moved on", () => {
    const stop = startFocusGlide(testContext());
    tabOnto(policy());
    policy().blur();
    jump();
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
    stop();
  });

  it("does nothing with Motion off, where nothing glides, and stops listening on teardown", () => {
    const off = startFocusGlide(testContext({ motion: false }));
    tabOnto(policy());
    jump();
    frames(3);
    off();
    policy().blur();
    const stop = startFocusGlide(testContext());
    stop();
    tabOnto(policy());
    jump();
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
  });
});

/** A relayout between the reader and the link (the live drawing pinning, a late font, a resize): the link moves `by` down
 * the page, and the page says so, as tt:layout or as the window's resize. */
const relayout = (by = 2400, type: string = LAYOUT_EVENT) => {
  box = { top: box.top + by, bottom: box.bottom + by };
  window.dispatchEvent(new Event(type));
};

describe("a relayout that moves the link under its glide (the owner, 2026-09-28)", () => {
  it("takes the glide up again: the browser set its end at the Tab, and the link has moved past it", () => {
    const stop = startFocusGlide(testContext());
    tabOnto(policy());
    relayout();
    frames(3);
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(reveal).toHaveBeenCalledWith({ block: "center", inline: "nearest" });
    stop();
  });

  it("takes up a resize that moves the link, and a move up the page as well as down", () => {
    const stop = startFocusGlide(testContext());
    tabOnto(policy());
    relayout(-300, "resize");
    frames(3);
    expect(reveal).toHaveBeenCalledTimes(1);
    stop();
  });

  it("takes up a relayout before the glide's first scroll: the live drawing pins a frame after the Tab", () => {
    const stop = startFocusGlide(testContext());
    modality(policy(), true);
    pressTab();
    policy().focus();
    frames(1);
    relayout();
    frames(3);
    expect(reveal).toHaveBeenCalledTimes(1);
    stop();
  });

  it("takes nothing up for a relayout that leaves the link where it was on the page", () => {
    const stop = startFocusGlide(testContext());
    tabOnto(policy());
    relayout(0);
    relayout(0, "resize");
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
    stop();
  });

  it("shares the three takes with the place-keeping jumps", () => {
    const stop = startFocusGlide(testContext());
    tabOnto(policy());
    for (const [cut, times] of [[jump, 1], [() => relayout(), 2], [jump, 3], [() => relayout(), 3]] as const) {
      cut();
      frames(3);
      expect(reveal).toHaveBeenCalledTimes(times);
    }
    stop();
  });

  it("lets go once the page has held still for ten frames: a relayout after that takes nothing up", () => {
    const stop = startFocusGlide(testContext());
    tabOnto(policy());
    frames(10);
    relayout();
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
    stop();
  });

  it("carries a watched glide through the journey's rebuild, in the task that tears it down and starts it again", () => {
    const before = startFocusGlide(testContext());
    tabOnto(policy());
    relayout(); // a late font: 02's fit changes with it, and the journey rebuilds
    before();
    const after = startFocusGlide(testContext());
    frames(3);
    expect(reveal).toHaveBeenCalledTimes(1);
    after();
  });

  it("carries its takes through the rebuild: three in all", () => {
    const before = startFocusGlide(testContext());
    tabOnto(policy());
    for (let k = 0; k < 2; k += 1) {
      jump();
      frames(3);
    }
    expect(reveal).toHaveBeenCalledTimes(2);
    before();
    const after = startFocusGlide(testContext());
    frames(3);
    jump();
    frames(3);
    relayout();
    frames(3);
    expect(reveal).toHaveBeenCalledTimes(3);
    after();
  });

  it("carries nothing to a start in a later task, nor to one with Motion off", async () => {
    const first = startFocusGlide(testContext());
    tabOnto(policy());
    first();
    const off = startFocusGlide(testContext({ motion: false }));
    off();
    await Promise.resolve();
    const later = startFocusGlide(testContext());
    relayout();
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
    later();
  });
});

describe("a relayout never takes up a glide against the reader", () => {
  for (const [name, to] of [
    ["back, above where the Tab found them", 100],
    ["on, past the link's place", 3000],
  ] as const) {
    it(`does not pull back a reader who dragged out of the glide's span (${name}), though the link then moves`, () => {
      y = 600;
      box = { top: 2400, bottom: 2432 }; // 1800px down the window: its glide spans 600 to 2336
      const stop = startFocusGlide(testContext());
      tabOnto(policy());
      expect(reveal).not.toHaveBeenCalled();
      y = to; // a scrollbar drag: no wheel, touch or key
      window.dispatchEvent(new Event("scroll"));
      relayout();
      frames(3);
      relayout(100, "resize");
      frames(3);
      jump(); // let go: a jump after it takes nothing up either
      frames(3);
      expect(reveal).not.toHaveBeenCalled();
      stop();
    });
  }

  it("is not armed by mouse focus, nor by focus returning to the window", () => {
    const stop = startFocusGlide(testContext());
    tabOnto(policy(), false);
    relayout();
    frames(3);
    policy().blur();
    modality(policy(), true);
    policy().focus();
    relayout();
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
    stop();
  });

  it("leaves a station to run.ts once the run pins under the glide: its relayout is the run's to answer", () => {
    const run = document.querySelector("#run")!;
    run.classList.remove("is-running"); // a reader below the run Shift+Tabs up into it
    const stop = startFocusGlide(testContext());
    tabOnto(document.querySelector<HTMLAnchorElement>("#run a")!);
    run.classList.add("is-running");
    relayout();
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
    stop();
  });

  it("lets go on the reader's own scroll: a relayout after a wheel takes nothing up", () => {
    const stop = startFocusGlide(testContext());
    tabOnto(policy());
    window.dispatchEvent(new WheelEvent("wheel", { deltaY: 120 }));
    relayout();
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
    stop();
  });
});

describe("the Tab it knows (watchTab)", () => {
  const press = (init: KeyboardEventInit) => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", ...init }));

  it("knows Tab and Shift+Tab, and Safari's Option-Tab (Alt+Tab, Alt+Shift+Tab), which moves to links there", () => {
    for (const init of [{}, { shiftKey: true }, { altKey: true }, { altKey: true, shiftKey: true }]) {
      const tab = watchTab();
      press(init);
      expect(tab.down(), JSON.stringify(init)).toBe(true);
      tab.stop();
    }
  });

  it("does not take Ctrl+Tab or Cmd+Tab (the browser's tabs, the system's apps) for a move through the page", () => {
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { ctrlKey: true, shiftKey: true }, { metaKey: true, altKey: true }]) {
      const tab = watchTab();
      press(init);
      expect(tab.down(), JSON.stringify(init)).toBe(false);
      tab.stop();
    }
  });
});

describe("a glide's watch says whether it still holds (armed)", () => {
  it("from arm until the reader's own scroll or a press of the pointer lets go of it", () => {
    for (const own of [new WheelEvent("wheel", { deltaY: 120 }), new PointerEvent("pointerdown")]) {
      const watch = watchGlide(() => undefined);
      expect(watch.armed()).toBe(false);
      watch.arm();
      expect(watch.armed()).toBe(true);
      window.dispatchEvent(own);
      expect(watch.armed(), own.type).toBe(false);
      watch.stop();
    }
  });
});
