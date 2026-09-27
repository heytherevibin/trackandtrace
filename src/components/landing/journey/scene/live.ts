import { animate, onScroll, type ScrollObserver } from "animejs";
import { Vector3, type PerspectiveCamera } from "three";
import { QUALITY_STORAGE_KEY } from "@/components/motion/motion-boot";
import { messages } from "@/messages";
import { storedQuality, type Ask, type Begin } from "../drawing";
import { createGovernor, startLevel } from "../governor";
import { DEPART_EVENT, LAYOUT_EVENT, THEME_EVENT, emit } from "../journey-events";
import type { Box } from "../labels-layout";
import { createLiveLabels, revealOf, wipe } from "../live-labels";
import { SMOOTH } from "../motion-tokens";
import { track } from "../observers";
import { anatomyPose, terminusPose, type AnatomyPose } from "../pose";
import type { JourneyContext, Teardown } from "../start-journey";
import { isPartId } from "../train-parts";
import { QUALITY, createEngine, type Engine } from "./engine";
import type { Rect } from "./fit";
import { smoothstep } from "./math";
import { readPalette, systemReader, tokenReader, type ScenePalette } from "./palette";
import type { RigPartId } from "./rig";
import { SCENE_CHUNK_MARK } from "./scene-mark";

// The live drawn train (spec §3.A–C; prototype v3's journey.js): the scene chunk's only door. The drawing chapter,
// pinned while a scan gate sweeps the steel locomotive into its drawing; it turns, comes apart into labelled parts,
// shows its dimensions, takes its coaches and departs past the line side (tt:depart, the horn's cue). And the terminus
// arrival above the closing plate. Anime.js turns scroll into progress; one render loop draws while a stage shows,
// and a governor steps quality down when frames run long. The engine is kept for the journey's life (J5-4).

export { SCENE_CHUNK_MARK };

interface JourneyProbe {
  anatomy(): number;
  terminus(): number;
  quality(): number;
  night(): boolean;
  box(): Box | null;
  inked(selector: string): number;
}
declare global {
  interface Window {
    /** Outside production builds only (J5-13): what the e2e specs read. */
    __ttJourney?: JourneyProbe;
    /** Outside production builds only: set by the e2e fixture, whose software GPU draws slower than any budget (J5-12),
     * so the governor may step quality down but never floors the drawing to the still. */
    __ttHoldFloor?: boolean;
  }
}

const night = (): boolean => document.documentElement.dataset.theme === "dark";
const FORCED = "(forced-colors: active)";

/** The theme's tokens, or the system's own colours under forced colours (J5-21); null when they do not parse. */
function readColours(): ScenePalette | null {
  return readPalette(window.matchMedia(FORCED).matches ? systemReader() : tokenReader(), night());
}

function palette(): ScenePalette {
  const p = readColours();
  if (!p) throw new Error("the theme's colour tokens did not parse");
  return p;
}

/** Waits for the page: scheduler.yield where the browser has it, else a task. The scene keeps its own rather than the
 * journey's (../pause.ts): a trace (Long Animation Frames) names the work after a yield for the script that called
 * scheduler.yield, so the scene's steps read as the scene's, and scripts/journey-perf.mjs can hold them to 61 ms. */
function pause(): Promise<void> {
  const scheduler: unknown = Reflect.get(window, "scheduler");
  const yielding: unknown = typeof scheduler === "object" && scheduler !== null ? Reflect.get(scheduler, "yield") : undefined;
  if (typeof yielding === "function") {
    const waited: unknown = Reflect.apply(yielding, scheduler, []);
    return Promise.resolve(waited).then(() => undefined);
  }
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

/** The engine for this journey: built once, a part at a time, and disposed when the journey ends (J5-4). */
function engineFor(ctx: JourneyContext): Promise<Engine> {
  const held = ctx.scene.get();
  if (held) return held;
  const colours = palette();
  const canvas = document.createElement("canvas");
  canvas.id = "journey-canvas";
  canvas.setAttribute("aria-hidden", "true");
  canvas.hidden = true;
  (document.getElementById("app-root") ?? document.body).append(canvas);
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() || "sans-serif";
  const coaches = window.matchMedia("(max-width: 47.99rem)").matches ? 2 : 3;
  const made = createEngine(canvas, { palette: colours, coaches, words: messages.home.drawing.nameboard, family }, pause);
  ctx.scene.set(made);
  ctx.atEnd(() => {
    void made.then(
      (engine) => {
        engine.dispose();
        canvas.remove();
      },
      () => canvas.remove(),
    );
  });
  made.catch(() => {
    if (ctx.scene.get() === made) ctx.scene.set(null);
    canvas.remove();
  });
  return made;
}

/** Loads nothing more: builds (or reuses) the engine and hands back what begins the live chapter on it. */
export async function prepareLive(ask: Ask, ctx: JourneyContext): Promise<Begin> {
  const engine = await engineFor(ctx);
  return () => startLive(engine, ask);
}

function startLive(engine: Engine, ask: Ask): Teardown {
  const section = document.getElementById("anatomy");
  const stageA = section?.querySelector<HTMLElement>(".anatomy-stage");
  const labels = section ? createLiveLabels(section) : null;
  if (!section || !stageA || !labels) throw new Error("the drawing chapter's markup is missing");
  const stageT = document.querySelector<HTMLElement>(".terminus-stage");
  const { pin } = labels;
  const dims = [...pin.querySelectorAll<HTMLElement>(".dim-label")];
  const { rig, camera } = engine.world;
  const A = { p: 0 };
  const T = { p: 0 };
  const target = new Vector3();
  const pickCamera: PerspectiveCamera = camera.clone();
  let poseA: AnatomyPose | null = null;
  let rectA: Rect | null = null;
  let zone: Box | null = null;
  let alive = true;
  let drawnKey = "";
  engine.setPalette(palette()); // the theme may have changed while nothing live listened
  engine.canvas.hidden = false; // this module owns the canvas element: it shows only while the drawing is live

  // ---- pointing: a label lights its part, a part lights its label (fine pointers only)
  let hot: RigPartId | null = null;
  const setHot = (id: RigPartId | null) => {
    if (id === hot) return;
    hot = id;
    rig.setHighlight(id);
    for (const l of labels.labels) l.classList.toggle("is-hot", l.dataset.part === id);
    engine.frame();
  };
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const onStageMove = (e: PointerEvent) => {
    if (!rectA || !poseA || poseA.callouts < 0.5) return setHot(null);
    setHot(engine.pick(e.clientX, e.clientY, rectA, pickCamera));
  };
  const onStageLeave = () => setHot(null);
  const pointing = fine
    ? labels.labels.map((label) => {
        const enter = () => {
          const part = label.dataset.part ?? "";
          setHot(isPartId(part) ? part : null);
        };
        label.addEventListener("pointerenter", enter);
        label.addEventListener("pointerleave", onStageLeave);
        return () => {
          label.removeEventListener("pointerenter", enter);
          label.removeEventListener("pointerleave", onStageLeave);
        };
      })
    : [];
  if (fine) {
    stageA.addEventListener("pointermove", onStageMove);
    stageA.addEventListener("pointerleave", onStageLeave);
  }

  // ---- after each anatomy frame: the labels, their leaders and the dimension figures
  const placeOverlay = () => {
    const pose = poseA;
    const rect = rectA;
    if (!pose || !rect) return;
    pickCamera.copy(camera);
    labels.draw((part) => engine.project(rig.anchor(part), rect), (i) => revealOf(i, pose.callouts));
    const pr = pin.getBoundingClientRect();
    for (const el of dims) {
      const s = engine.project(rig.dimAnchor(el.dataset.dim === "height" ? "height" : "length"), rect);
      el.style.transform = `translate(${(s.x - pr.left).toFixed(1)}px, ${(s.y - pr.top).toFixed(1)}px) translate(-50%, -50%)`;
      el.style.clipPath = wipe(pose.dims);
    }
  };

  engine.addView("anatomy", {
    el: stageA,
    bleed: true,
    update: ({ camera: cam, rect, aspect, quality, night: isNight }) => {
      const pose = anatomyPose(A.p, aspect);
      poseA = pose;
      rectA = rect;
      engine.live(pose, quality, isNight);
      if (!zone) return;
      const pr = pin.getBoundingClientRect();
      target.set(...pose.target);
      // the sides hold while the list stands beside the drawing (and let go as the train pulls away), or while the
      // labels flank it
      const across = labels.beside() ? 1 - smoothstep(0, 3, pose.drive) : smoothstep(0, 0.6, pose.explode);
      engine.fit.apply(cam, rect, { l: pr.left + zone.l, r: pr.left + zone.r, t: pr.top + zone.t, b: pr.top + zone.b }, { across, panto: pose.panto, target, center: labels.listMode() ? 1 : 0 });
    },
    after: placeOverlay,
  });
  if (stageT) {
    engine.addView("terminus", { el: stageT, bleed: true, update: ({ aspect, quality, night: isNight }) => engine.live(terminusPose(T.p, aspect), quality, isNight) });
  }

  // ---- scroll → progress; the departure is a moment on it
  let prev = 0;
  const onA = () => {
    if (prev < 0.88 && A.p >= 0.88) emit(DEPART_EVENT);
    prev = A.p;
  };
  // progress starts the moment the pin takes hold (its sticky top differs in the list layout)
  const enterAt = () => {
    const stick = Math.round(Number.parseFloat(getComputedStyle(pin).top)) || 0;
    return stick >= 0 ? `top+=${stick} top` : `top-=${-stick} top`;
  };
  const observeA = track(onScroll({ target: section, enter: enterAt, leave: "bottom bottom", sync: SMOOTH }));
  const driveA = animate(A, { p: [0, 1], ease: "linear", duration: 1000, onUpdate: onA, autoplay: observeA });
  const observeT = stageT ? track(onScroll({ target: stageT, enter: "bottom top", leave: "center center", sync: SMOOTH })) : null;
  const driveT = observeT ? animate(T, { p: [0, 1], ease: "linear", duration: 1000, autoplay: observeT }) : null;

  // ---- quality: frame intervals while drawing steer the resolution, the coaches and the Night effects
  const governor = createGovernor({
    levels: QUALITY.length,
    start: startLevel(storedQuality(), QUALITY.length),
    set: (level) => {
      engine.setQuality(level);
      try {
        window.sessionStorage.setItem(QUALITY_STORAGE_KEY, String(level));
      } catch {
        // the step lasts this page only
      }
      drawnKey = "";
    },
    floor: () => {
      if (process.env.NODE_ENV !== "production" && window.__ttHoldFloor === true) return;
      ask.still("quality");
    },
  });
  engine.setQuality(governor.level());

  // ---- draw only while a stage is on (or about to come on) screen, and only when something changed
  // anime's scroll sync stays awake for 500 ms of its clock after each scroll event, so one long frame (a slow phone's
  // stall) can spend that in a single tick and leave the drawing short of the page until the reader scrolls again. A
  // frame with nothing to draw while a progress still disagrees with its scroll wakes the sync, so it catches up.
  const behind = (observer: ScrollObserver | null, p: number): boolean => observer !== null && Math.abs(observer.progress - p) > 1e-4;
  const onScreen = new Set<Element>();
  let raf = 0;
  const loop = (now: number) => {
    const key = `${A.p}|${T.p}|${stageA.getBoundingClientRect().top}|${stageT?.getBoundingClientRect().top ?? 0}|${window.innerWidth}`;
    if (key !== drawnKey) {
      drawnKey = key;
      engine.frame();
      governor.drew(now);
    } else {
      governor.idle();
      if (behind(observeA, A.p)) observeA.container.handleScroll();
      else if (observeT && behind(observeT, T.p)) observeT.container.handleScroll();
    }
    raf = onScreen.size > 0 ? requestAnimationFrame(loop) : 0;
  };
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) onScreen.add(e.target);
        else onScreen.delete(e.target);
      }
      if (onScreen.size && !raf) raf = requestAnimationFrame(loop);
      if (!onScreen.size) engine.frame();
    },
    { rootMargin: "20% 0px" },
  );
  io.observe(stageA);
  if (stageT) io.observe(stageT);

  // ---- theme: re-read the tokens and draw at once (J5-9); tt:theme is Night falls' synchronous redraw (J6)
  const onTheme = () => {
    const next = readColours();
    if (next) engine.setPalette(next);
    drawnKey = "";
    engine.frame();
  };
  const themeWatch = new MutationObserver(onTheme);
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const forced = window.matchMedia(FORCED);
  forced.addEventListener("change", onTheme);
  window.addEventListener(THEME_EVENT, onTheme);

  // ---- layout: the labels, and the zone the drawing keeps to; a chapter that cannot fit even as a list draws still
  let layoutFrame = 0;
  const relayout = () => {
    layoutFrame = 0;
    if (!alive) return;
    zone = labels.layout();
    if (!zone) {
      // asked after this start has returned, never inside it (drawing.ts is still pinning)
      queueMicrotask(() => {
        if (alive) ask.still("fit");
      });
      return;
    }
    drawnKey = "";
    engine.frame();
  };
  const soon = () => {
    if (!layoutFrame) layoutFrame = requestAnimationFrame(relayout);
  };
  const ro = new ResizeObserver(soon);
  ro.observe(pin);
  for (const l of labels.labels) ro.observe(l);
  window.addEventListener(LAYOUT_EVENT, relayout);
  window.addEventListener("resize", relayout);
  void document.fonts.ready.then(soon);
  relayout();
  engine.frame();

  if (process.env.NODE_ENV !== "production") {
    window.__ttJourney = {
      anatomy: () => A.p,
      terminus: () => T.p,
      quality: () => engine.quality(),
      night: () => engine.night(),
      box: () => (poseA && rectA ? engine.fit.screenBox(camera, rectA, poseA.panto) : null),
      inked: (selector) => {
        const el = document.querySelector(selector);
        return el ? engine.inked(el) : 0;
      },
    };
  }

  return () => {
    alive = false;
    driveA.revert();
    observeA.revert();
    driveT?.revert();
    observeT?.revert();
    io.disconnect();
    cancelAnimationFrame(raf);
    ro.disconnect();
    cancelAnimationFrame(layoutFrame);
    themeWatch.disconnect();
    forced.removeEventListener("change", onTheme);
    window.removeEventListener(THEME_EVENT, onTheme);
    window.removeEventListener(LAYOUT_EVENT, relayout);
    window.removeEventListener("resize", relayout);
    stageA.removeEventListener("pointermove", onStageMove);
    stageA.removeEventListener("pointerleave", onStageLeave);
    for (const stop of pointing) stop();
    setHot(null);
    labels.clear();
    for (const el of dims) {
      el.style.removeProperty("transform");
      el.style.removeProperty("clip-path");
    }
    engine.removeView("anatomy");
    engine.removeView("terminus");
    engine.frame(); // nothing left on screen: clears the canvas
    engine.canvas.hidden = true;
    if (process.env.NODE_ENV !== "production") delete window.__ttJourney;
  };
}
