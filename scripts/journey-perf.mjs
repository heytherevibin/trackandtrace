// The journey's real-GPU budgets (spec §3.H), on this machine's GPU against a production build:
//   npm run build && npx next start -p 4210    (another shell; `lsof -nP -iTCP:4210 -sTCP:LISTEN` first)
//   node scripts/journey-perf.mjs               (run it twice: a fresh server's first answers are cold)
// A headed Chromium on the real GPU (Metal on a Mac), a fresh one for each, loads "/" twice:
// - a phone, 390×844 at 4× CPU: the longest journey task at load (≤ 120 ms) and the scene's longest step (≤ 61 ms),
//   from the start to one frame after the drawing goes live. Each long task is named by the scripts that ran in it
//   (Long Animation Frames), against the chunk lists journey-budgets.mjs reads from the build; the page's own longest
//   (React's hydration, Next's runtime) is printed beside them, but it is not the journey's. Then CLS, and the scroll
//   through the drawing: median fps and frames over 33 ms;
// - the reference desktop, 1280×800 at 1×: the same scroll's p95 and frames over 25 ms, recorded from two frames after
//   the jump into #anatomy, with the progress through #anatomy of every frame over 25 ms.
// Loading "/" must contact no live service: any request to a host but this server fails the run. It never submits a
// PNR. JOURNEY_PERF_URL points it at another server (default http://localhost:4210/). Exits 1 on a missed budget.
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chunksIn, measure } from "./journey-budgets.mjs";

export const BUDGETS = { journeyTask: 120, sceneStep: 61, cls: 0.05, desktopP95: 12, desktopOver25: 0, phoneFps: 55, phoneOver33: 2 };

/** @typedef {{ readonly start: number, readonly duration: number }} Task */
/** @typedef {{ readonly start: number, readonly duration: number, readonly url: string }} Script */
/** @typedef {"page" | "journey" | "scene"} Owner */
/** @typedef {{ readonly journey: ReadonlySet<string>, readonly scene: ReadonlySet<string> }} Owners */

/** A chunk's file name, from a script's URL. @param {string} url */
const chunkOf = (url) => url.split(/[?#]/)[0]?.split("/").pop() ?? "";

/**
 * Whose each long task is: the scene's if a scene script ran inside it, else the journey's if a journey script did,
 * else the page's.
 * @param {readonly Task[]} tasks @param {readonly Script[]} scripts @param {Owners} owners
 * @returns {Array<Task & { readonly owner: Owner }>}
 */
export function attribute(tasks, scripts, owners) {
  return tasks.map((task) => {
    const inside = scripts.filter((s) => s.start >= task.start - 1 && s.start < task.start + task.duration).map((s) => chunkOf(s.url));
    /** @type {Owner} */
    const owner = inside.some((c) => owners.scene.has(c)) ? "scene" : inside.some((c) => owners.journey.has(c)) ? "journey" : "page";
    return { ...task, owner };
  });
}

/**
 * The longest task on the page, the journey's (its scene steps included) and the scene's alone.
 * @param {ReadonlyArray<Task & { readonly owner: Owner }>} tasks
 */
export function longest(tasks) {
  /** @param {(owner: Owner) => boolean} which */
  const max = (which) => Math.max(0, ...tasks.filter((t) => which(t.owner)).map((t) => t.duration));
  return { page: max(() => true), journey: max((o) => o !== "page"), scene: max((o) => o === "scene") };
}

/** @param {readonly number[]} xs @param {number} p */
const quantile = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] ?? 0;

/**
 * p95 frame time, the median as frames per second, and the percentage of frames over 25 and 33 ms.
 * @param {readonly number[]} frames milliseconds between frames
 */
export function frameStats(frames) {
  if (!frames.length) return { count: 0, p95: 0, medianFps: 0, over25: 0, over33: 0 };
  /** @param {number} ms */
  const over = (ms) => Math.round((frames.filter((f) => f > ms).length / frames.length) * 1000) / 10;
  return { count: frames.length, p95: quantile(frames, 0.95), medianFps: Math.round(1000 / quantile(frames, 0.5)), over25: over(25), over33: over(33.4) };
}

// ---- the browser half

/* global window, document, requestAnimationFrame, PerformanceObserver */
/** Runs in the page before its own scripts: long tasks, the scripts inside long frames, and layout shift. */
function observe() {
  const perf = { tasks: /** @type {Task[]} */ ([]), scripts: /** @type {Script[]} */ ([]), cls: 0 };
  Reflect.set(window, "__perf", perf);
  new PerformanceObserver((l) => l.getEntries().forEach((e) => perf.tasks.push({ start: e.startTime, duration: e.duration }))).observe({ type: "longtask", buffered: true });
  new PerformanceObserver((l) =>
    l.getEntries().forEach((e) => {
      for (const s of Reflect.get(e, "scripts") ?? []) perf.scripts.push({ start: s.startTime, duration: s.duration, url: s.sourceURL });
    }),
  ).observe({ type: "long-animation-frame", buffered: true });
  new PerformanceObserver((l) =>
    l.getEntries().forEach((e) => {
      if (!Reflect.get(e, "hadRecentInput")) perf.cls += Number(Reflect.get(e, "value")) || 0;
    }),
  ).observe({ type: "layout-shift", buffered: true });
}

/** @param {import("@playwright/test").Page} page */
const twoFrames = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined)))));

/**
 * Jumps to #anatomy, waits two frames, then records every frame (and where the page stood) while the wheel scrolls.
 * @param {import("@playwright/test").Page} page @param {{ width: number, height: number }} size
 */
async function scrollThrough(page, { width, height }) {
  const section = await page.evaluate(() => {
    const s = document.getElementById("anatomy");
    if (!s) throw new Error("no #anatomy");
    const top = s.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top - 64, behavior: "instant" });
    return { top, travel: Math.max(1, s.offsetHeight - window.innerHeight) };
  });
  await twoFrames(page);
  await page.evaluate(() => {
    /** @type {Array<{ dt: number, y: number }>} */
    const frames = [];
    Reflect.set(window, "__frames", frames);
    let last = 0;
    /** @param {number} t */
    const tick = (t) => {
      if (last) frames.push({ dt: t - last, y: window.scrollY });
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.mouse.move(width / 2, height / 2);
  for (let i = 0; i < 60; i += 1) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(16);
  }
  /** @type {Array<{ dt: number, y: number }>} */
  const frames = await page.evaluate(() => Reflect.get(window, "__frames"));
  const slow = frames.filter((f) => f.dt > 25).map((f) => `${f.dt.toFixed(0)} ms at ${((f.y - section.top) / section.travel).toFixed(2)}`);
  return { stats: frameStats(frames.map((f) => f.dt)), slow };
}

/**
 * One viewport in its own browser, so no run inherits another's compiled shaders or caches.
 * @param {string} base @param {Owners} owners @param {{ width: number, height: number, cpu: number }} run
 */
async function measureRun(base, owners, { width, height, cpu }) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: false, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width, height } });
  /** @type {Set<string>} */
  const foreign = new Set();
  const origin = new URL(base).origin;
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.origin !== origin && u.protocol !== "data:" && u.protocol !== "blob:") foreign.add(u.origin);
  });
  const cdp = await page.context().newCDPSession(page);
  if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  await page.addInitScript(observe);
  await page.goto(base);
  await page.waitForSelector("#anatomy.is-live", { timeout: 60_000 });
  await twoFrames(page);
  /** @type {{ tasks: Task[], scripts: Script[], cls: number }} */
  const perf = await page.evaluate(() => Reflect.get(window, "__perf"));
  const tasks = attribute(perf.tasks, perf.scripts, owners);
  const scroll = await scrollThrough(page, { width, height });
  await browser.close();
  return { tasks: longest(tasks), all: tasks, cls: perf.cls, ...scroll, foreign: [...foreign] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
  const built = measure(chunksIn(join(root, ".next/static/chunks")), { requireLoader: true });
  if (built.failures.length) throw new Error(`the build's chunks cannot be placed: ${built.failures.join("; ")}`);
  const owners = { journey: new Set(built.journey.map(chunkOf)), scene: new Set(built.scene.map(chunkOf)) };
  const base = process.env.JOURNEY_PERF_URL ?? "http://localhost:4210/";
  const phone = await measureRun(base, owners, { width: 390, height: 844, cpu: 4 });
  const desk = await measureRun(base, owners, { width: 1280, height: 800, cpu: 1 });

  const ms = (/** @type {number} */ n) => `${n.toFixed(0)} ms`;
  const lines = [
    [`phone longest journey task at load ${ms(phone.tasks.journey)} (page's own longest ${ms(phone.tasks.page)})`, phone.tasks.journey <= BUDGETS.journeyTask],
    [`phone longest scene step ${ms(phone.tasks.scene)}`, phone.tasks.scene <= BUDGETS.sceneStep],
    [`phone scroll median ${phone.stats.medianFps} fps, ${phone.stats.over33}% > 33 ms (${phone.stats.count} frames)`, phone.stats.medianFps >= BUDGETS.phoneFps && phone.stats.over33 <= BUDGETS.phoneOver33],
    [`desktop scroll p95 ${desk.stats.p95.toFixed(1)} ms, ${desk.stats.over25}% > 25 ms (${desk.stats.count} frames)`, desk.stats.p95 <= BUDGETS.desktopP95 && desk.stats.over25 <= BUDGETS.desktopOver25],
    [`CLS at load: phone ${phone.cls.toFixed(3)}, desktop ${desk.cls.toFixed(3)}`, Math.max(phone.cls, desk.cls) <= BUDGETS.cls],
    [`other hosts asked: ${[...phone.foreign, ...desk.foreign].join(", ") || "none"}`, !phone.foreign.length && !desk.foreign.length],
  ];
  console.log(`phone long tasks: ${phone.all.map((t) => `${t.owner} ${ms(t.duration)}`).join(", ") || "none"}`);
  console.log(`desktop long tasks: ${desk.all.map((t) => `${t.owner} ${ms(t.duration)}`).join(", ") || "none"}`);
  if (phone.slow.length) console.log(`phone frames over 25 ms (progress through #anatomy): ${phone.slow.join(", ")}`);
  if (desk.slow.length) console.log(`desktop frames over 25 ms (progress through #anatomy): ${desk.slow.join(", ")}`);
  for (const [text, ok] of lines) console.log(`${ok ? "✓" : "✗"} ${text}`);
  process.exit(lines.every(([, ok]) => ok) ? 0 : 1);
}
