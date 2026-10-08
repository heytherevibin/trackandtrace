import { describe, expect, it, vi } from "vitest";
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

  it("a Tab's own keydown lets go of the glide before it, never of the glide its focus arms (Tab counts as taking over, as place-memory has it)", () => {
    const stop = startFocusGlide(testContext());
    tabOnto(policy()); // a glide armed for the first Tab stop
    const other = document.createElement("a"); // a second Tab stop below the window, outside the run
    other.href = "/tos";
    other.getBoundingClientRect = () => ({ top: at.box.top - at.y, bottom: at.box.bottom - at.y }) as DOMRect; // below the window, as the policy link
    other.scrollIntoView = reveal;
    document.getElementById("reliability")!.append(other);
    tabOnto(other); // the next Tab: its keydown lets go of the first glide, its focus arms the second
    jump();
    frames(3);
    expect(reveal).toHaveBeenCalledTimes(1); // taken up once, for the stop focus is on
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

// WebKit's scroll anchoring takes a row for its anchor while the row's section entrance lifts it (a transform), and moves
// the scroll to follow it. Any move of the scroll ends a glide in flight, and this one comes with no jump, no relayout and
// no resize to hear: a Tab's glide from the page's top to the run stopped 800 to 2,000 px short of its station in 10 runs
// in 50, focus left off-screen (WCAG 2.4.11), and in none of 50 with anchoring off. So it is held off while a Tab's glide
// is watched, as it is for a link's (link-glide.test.tsx), and given back as the watch lets go.
describe("scroll anchoring, held off while a Tab's glide is watched", () => {
  const anchoring = () => document.documentElement.style.getPropertyValue("overflow-anchor");

  it("is held off from the Tab's focus, and given back once the page has held still for ten frames", () => {
    const stop = startFocusGlide(testContext());
    expect(anchoring()).toBe("");
    tabOnto(policy());
    expect(anchoring()).toBe("none");
    frames(5);
    expect(anchoring()).toBe("none");
    frames(10);
    expect(anchoring()).toBe("");
    stop();
  });

  it("stays held off through a take-up, until the glide taken up has come to rest", () => {
    const stop = startFocusGlide(testContext());
    tabOnto(policy());
    jump();
    frames(3);
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(anchoring()).toBe("none");
    frames(10);
    expect(anchoring()).toBe("");
    stop();
  });

  for (const [name, own] of [
    ["a press of the pointer", () => window.dispatchEvent(new PointerEvent("pointerdown"))],
    ["a wheel", () => window.dispatchEvent(new WheelEvent("wheel", { deltaY: 120 }))],
    ["focus moving on", () => policy().blur()],
  ] as const) {
    it(`is given back as the reader takes over: ${name}`, () => {
      const stop = startFocusGlide(testContext());
      tabOnto(policy());
      expect(anchoring()).toBe("none");
      own();
      expect(anchoring()).toBe("");
      stop();
    });
  }

  it("is given back when no glide begins within six frames of the focus", () => {
    const stop = startFocusGlide(testContext());
    modality(policy(), true);
    pressTab();
    policy().focus();
    expect(anchoring()).toBe("none");
    frames(6);
    expect(anchoring()).toBe("");
    stop();
  });

  it("is never touched by focus that starts no glide: a mouse's, or a Tab stop already in the window", () => {
    const stop = startFocusGlide(testContext());
    const set = vi.spyOn(document.documentElement.style, "setProperty");
    tabOnto(policy(), false);
    policy().blur();
    at.box = { top: 140, bottom: 172 };
    tabOnto(policy());
    expect(set).not.toHaveBeenCalledWith("overflow-anchor", "none");
    stop();
  });

  it("is given back when the journey ends mid-glide", () => {
    const stop = startFocusGlide(testContext());
    tabOnto(policy());
    expect(anchoring()).toBe("none");
    stop();
    expect(anchoring()).toBe("");
  });

  // A Shift+Tab into the run from below it, the run not yet pinned, arms this module's watch and run.ts's for the one
  // glide; this one lets go as the run pins under it, and run.ts's holds the glide on to its station.
  it("stays held off while either of two watches holds the glide, and comes back as the last lets go", () => {
    const [first, second] = [watchGlide(() => undefined), watchGlide(() => undefined)];
    first.arm();
    second.arm();
    expect(anchoring()).toBe("none");
    first.disarm();
    expect(anchoring()).toBe("none");
    second.disarm();
    expect(anchoring()).toBe("");
    first.stop();
    second.stop();
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
