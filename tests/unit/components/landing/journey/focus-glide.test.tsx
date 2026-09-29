import { describe, expect, it } from "vitest";
import { startFocusGlide, watchGlide, watchTab } from "@/components/landing/journey/focus-glide";
import { LAYOUT_EVENT } from "@/components/landing/journey/journey-events";
import { at, frames, glide, jump, modality, policy, pressTab, reveal, tabOnto, setUpGlideRig } from "./focus-glide-rig";
import { testContext } from "./journey-context";

// The browser glides a Tab stop into the window, and an instant scroll that keeps the reader's place (jumpTo: keepPlace,
// the still's settle, the drawing falling to the still under load) cancels that glide, stranding focus off-screen at rest
// (WCAG 2.4.11). The glide is taken up again after each such cut, at most three times, and only that: armed by a Tab that
// starts a glide, it never pulls a reader who left by their own hand (a scrollbar drag sends no wheel, touch or key), nor
// one whom focus returning to the window finds away, and it lets go once the page holds still (Task 6 review, rounds 2–4).
// A relayout's cut is focus-glide-relayout.test.tsx's.

setUpGlideRig();

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
    at.box = { top: 40, bottom: 72 }; // in the viewport, if under the masthead: the browser does not scroll for it
    tabOnto(policy());
    jump();
    frames(3);
    at.box = { top: 1400, bottom: 1432 };
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
    at.y = 1410; // a scrollbar drag, away
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
