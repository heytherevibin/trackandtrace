// The journey's performance budgets (spec §3.H), against this checkout's production build, which the script serves
// itself on this machine with sample data and nothing live (scripts/serve-local-production.mjs; J6-14):
//   npm run build:local && node scripts/journey-perf.mjs              the real-GPU run, by hand, on the owner's Mac (run
//                                                                      it twice: a fresh server's first answers are cold)
//   npm run build:local && node scripts/journey-perf.mjs --software   the nightly's throttled run, on a runner with no GPU
// Only a build made by `npm run build:local` is served (every live variable blanked, stamped beside BUILD_ID; J6-2). It
// refuses port 4210 when another server answers there (`lsof -nP -iTCP:4210 -sTCP:LISTEN`), and, through the serve
// script, a working tree holding any .env file but .env.example. JOURNEY_PERF_URL points it at a server already
// running instead. Either run fails when the server's offline guard refused anything, or when the
// page asked any host but this one. It never submits a PNR. Exits 1 on a missed budget.
//
// The real-GPU run: a headed Chromium on the real GPU (Metal on a Mac), a fresh one for each, loads "/" twice:
// - a phone, 390×844 at 4× CPU: the longest journey task at load (≤ 120 ms) and the scene's longest step (≤ 61 ms),
//   from the start to one frame after the drawing goes live. Each long task is named by the scripts that ran in it
//   (Long Animation Frames), against the chunk lists journey-budgets.mjs reads from the build; the page's own longest
//   (React's hydration, Next's runtime) is printed beside them, but it is not the journey's. Then CLS, and the scroll
//   through the drawing: median fps and frames over 33 ms;
// - the reference desktop, 1280×800 at 1×: the same scroll's p95 and frames over 25 ms, recorded from two frames after
//   the jump into #anatomy, with the progress through #anatomy of every frame over 25 ms.
// The software run (J6-3): a headless Chromium drawing through SwiftShader, on the CPU: a phone at 4×, 6× and 10× CPU,
// and the desktop at 1×. A software GPU measures the rasteriser, not the page, so frame times and long tasks are printed
// only. It fails on what holds on any machine: another host asked, CLS over 0.05, a drawing that never decided (or
// decided live and never settled), and at 10× a governor that never answered (no quality step stored in tt.q, and no
// still for quality or load). How long the pin takes is the runner's, not the page's: printed, never judged.
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chunksIn, measure } from "./journey-budgets.mjs";
import { refusals, startLocalProduction } from "./serve-local-production.mjs";

export const BUDGETS = { journeyTask: 120, sceneStep: 61, cls: 0.05, desktopP95: 12, desktopOver25: 0, phoneFps: 55, phoneOver33: 2 };

/** How long a software run waits, once the drawing has decided live, for the chapter to pin (or settle on the still): a
 * bound on how slow the runner may be, not a budget. The page limits only the scene chunk's arrival (20 s), never the
 * engine's build, and on a GPU-less runner the build compiles every shader on the CPU: the nightly's 10× pin had not come
 * after 30 s (run 36406365173), and in a Linux container at 1 CPU the 40× pin came 33 s after the decision. The governor
 * is fed frames only once the chapter is pinned and scrolled, so a wait that ends first judges nothing of it.
 *
 * About three times the slowest the nightly has printed ("settled N s after it decided", at 4×, 6×, 10× and the desktop's 1×):
 *   36451581440 (pull request, 2026-09-28)  1.5, 4.6, 38.9, 0.4 s
 *   36651308147 (schedule, 2026-09-30)      2.8, 21.0, 25.6, 0.2 s
 *   36692565952 (pull request, 2026-09-30)  1.5, 3.4, 22.5, 0.2 s
 *   36797288618 (schedule, 2026-10-01)      2.7, 15.6, 52.0, 0.6 s
 * The slowest, 52.0 s at 10×, of only four samples whose 10× settles spread 22.5–52.0 s: 150 s (2.9×), where #91 guessed
 * 180, as a miss turns the nightly red for nothing. Every run waiting out both its waits (DECIDE_MS and this) and its
 * scroll still leaves a fifth of the production job's 30 minutes spare, a ceiling of 165 s (journey-perf.test.ts holds
 * both, and that the ceiling refuses 180). */
export const SETTLE_MS = 150_000;

/** The slowest "settled N s after it decided" the nightly has printed, in seconds. */
export const SLOWEST_SETTLE_S = 52.0;

/** How long a software run waits for the drawing to decide at all. */
export const DECIDE_MS = 60_000;

/** The software runs, in order: a phone at 4×, 6× and 10× CPU, and the desktop at 1×. */
export const SOFTWARE_RUNS = [
  { width: 390, height: 844, cpu: 4 },
  { width: 390, height: 844, cpu: 6 },
  { width: 390, height: 844, cpu: 10 },
  { width: 1280, height: 800, cpu: 1 },
];

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

/**
 * What a software GPU's run can fail on (J6-3): another host asked, CLS over budget, a drawing that never decided (or
 * decided live and never settled: pinned, or on the still), and at the heaviest rate a governor that never answered,
 * judged only once the drawing has settled (it is fed no frame before the pin). Frame times and long tasks are never its
 * business.
 * @param {{ rate: number, foreign: readonly string[], cls: number, why: string | null, q: string | null, heaviest: boolean, settled: boolean }} run
 * @returns {string[]}
 */
export function softwareFailures(run) {
  /** @type {string[]} */
  const out = [];
  if (run.foreign.length) out.push(`asked ${run.foreign.join(", ")}`);
  if (run.cls > BUDGETS.cls) out.push(`CLS ${run.cls.toFixed(3)} over ${BUDGETS.cls}`);
  if (run.why === null) out.push("the drawing never decided");
  else if (!run.settled) out.push(`the drawing decided live but neither pinned nor settled on the still in ${SETTLE_MS / 1000} s`);
  if (run.why === null || !run.settled) return out;
  const answered = run.q !== null || /\b(quality|load)\b/.test(run.why ?? "");
  if (run.heaviest && !answered) out.push("the governor never answered: no quality step stored, and no still for quality or load");
  return out;
}

/** @param {number} n */
const ms = (n) => `${n.toFixed(0)} ms`;

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
 * Every origin but the page's own that the page asks, as it asks.
 * @param {import("@playwright/test").Page} page @param {string} base
 */
function watchForeign(page, base) {
  /** @type {Set<string>} */
  const foreign = new Set();
  const origin = new URL(base).origin;
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.origin !== origin && u.protocol !== "data:" && u.protocol !== "blob:") foreign.add(u.origin);
  });
  return foreign;
}

/**
 * One viewport in its own browser, so no run inherits another's compiled shaders or caches.
 * @param {string} base @param {Owners} owners @param {{ width: number, height: number, cpu: number }} run
 */
async function measureRun(base, owners, { width, height, cpu }) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: false, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width, height } });
  const foreign = watchForeign(page, base);
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

/** In the page: the drawing has settled, pinned live or on the still. A run that settled on the still stops waiting
 * there, rather than for a pin that will not come (up to SETTLE_MS a run). Serialised into the page by Playwright,
 * so it closes over nothing. */
export function drawingSettled() {
  return document.querySelector("#anatomy.is-live") !== null || document.documentElement.dataset.drawing === "still";
}

/**
 * One software-GPU run, in its own headless browser (SwiftShader): the page's decision, its quality step and its CLS;
 * its long tasks and, when live, its scroll, printed only.
 * @param {string} base @param {Owners} owners @param {{ width: number, height: number, cpu: number }} run
 */
async function softwareRun(base, owners, { width, height, cpu }) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  const foreign = watchForeign(page, base);
  const cdp = await page.context().newCDPSession(page);
  if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  await page.addInitScript(observe);
  await page.goto(base);
  const decided = await page.waitForSelector("html[data-drawing-why]", { state: "attached", timeout: DECIDE_MS }).then(() => true, () => false);
  const since = Date.now();
  const settled = decided && (await page.waitForFunction(drawingSettled, undefined, { timeout: SETTLE_MS }).then(() => true, () => false));
  const settling = (Date.now() - since) / 1000;
  const live = settled && (await page.locator("#anatomy.is-live").count()) > 0;
  const scroll = live ? await scrollThrough(page, { width, height }) : null;
  /** @type {{ tasks: Task[], scripts: Script[], cls: number }} */
  const perf = await page.evaluate(() => Reflect.get(window, "__perf"));
  const state = await page.evaluate(() => ({ why: document.documentElement.getAttribute("data-drawing-why"), q: window.sessionStorage.getItem("tt.q") }));
  await browser.close();
  return { width, height, cpu, tasks: longest(attribute(perf.tasks, perf.scripts, owners)), cls: perf.cls, stats: scroll?.stats ?? null, foreign: [...foreign], settled, settling, ...state };
}

/**
 * The real-GPU run's verdicts (spec §3.H).
 * @param {string} base @param {Owners} owners @returns {Promise<Array<[string, boolean]>>}
 */
async function hardware(base, owners) {
  const phone = await measureRun(base, owners, { width: 390, height: 844, cpu: 4 });
  const desk = await measureRun(base, owners, { width: 1280, height: 800, cpu: 1 });
  console.log(`phone long tasks: ${phone.all.map((t) => `${t.owner} ${ms(t.duration)}`).join(", ") || "none"}`);
  console.log(`desktop long tasks: ${desk.all.map((t) => `${t.owner} ${ms(t.duration)}`).join(", ") || "none"}`);
  if (phone.slow.length) console.log(`phone frames over 25 ms (progress through #anatomy): ${phone.slow.join(", ")}`);
  if (desk.slow.length) console.log(`desktop frames over 25 ms (progress through #anatomy): ${desk.slow.join(", ")}`);
  return [
    [`phone longest journey task at load ${ms(phone.tasks.journey)} (page's own longest ${ms(phone.tasks.page)})`, phone.tasks.journey <= BUDGETS.journeyTask],
    [`phone longest scene step ${ms(phone.tasks.scene)}`, phone.tasks.scene <= BUDGETS.sceneStep],
    [`phone scroll median ${phone.stats.medianFps} fps, ${phone.stats.over33}% > 33 ms (${phone.stats.count} frames)`, phone.stats.medianFps >= BUDGETS.phoneFps && phone.stats.over33 <= BUDGETS.phoneOver33],
    [`desktop scroll p95 ${desk.stats.p95.toFixed(1)} ms, ${desk.stats.over25}% > 25 ms (${desk.stats.count} frames)`, desk.stats.p95 <= BUDGETS.desktopP95 && desk.stats.over25 <= BUDGETS.desktopOver25],
    [`CLS at load: phone ${phone.cls.toFixed(3)}, desktop ${desk.cls.toFixed(3)}`, Math.max(phone.cls, desk.cls) <= BUDGETS.cls],
    [`other hosts asked: ${[...phone.foreign, ...desk.foreign].join(", ") || "none"}`, !phone.foreign.length && !desk.foreign.length],
  ];
}

/**
 * The software run's verdicts (J6-3): each line prints its numbers, and judges only softwareFailures.
 * @param {string} base @param {Owners} owners @returns {Promise<Array<[string, boolean]>>}
 */
async function software(base, owners) {
  /** @type {Array<[string, boolean]>} */
  const lines = [];
  for (const run of SOFTWARE_RUNS) {
    const r = await softwareRun(base, owners, run);
    const scrolled = r.stats ? `scroll median ${r.stats.medianFps} fps, p95 ${r.stats.p95.toFixed(1)} ms, ${r.stats.over33}% > 33 ms` : "not live, so no scroll";
    const drawing = r.why === null ? "undecided" : r.why === "" ? "live" : `still (${r.why})`;
    const settledIn = r.settled ? `settled ${r.settling.toFixed(1)} s after it decided` : "never settled";
    console.log(`${r.width}×${r.height} at ${r.cpu}× (software GPU, printed only): longest journey task ${ms(r.tasks.journey)}, scene step ${ms(r.tasks.scene)}, page ${ms(r.tasks.page)}; ${scrolled}; drawing ${drawing}, ${settledIn}; quality step ${r.q ?? "none stored"}`);
    const failures = softwareFailures({ rate: r.cpu, foreign: r.foreign, cls: r.cls, why: r.why, q: r.q, heaviest: r.cpu === 10, settled: r.settled });
    lines.push([`${r.width}×${r.height} at ${r.cpu}×: CLS ${r.cls.toFixed(3)}, other hosts ${r.foreign.join(", ") || "none"}, drawing ${drawing}${failures.length ? `: ${failures.join("; ")}` : ""}`, failures.length === 0]);
  }
  return lines;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
  const built = measure(chunksIn(join(root, ".next/static/chunks")), { requireLoader: true });
  if (built.failures.length) throw new Error(`the build's chunks cannot be placed: ${built.failures.join("; ")}`);
  const owners = { journey: new Set(built.journey.map(chunkOf)), scene: new Set(built.scene.map(chunkOf)) };
  const own = process.env.JOURNEY_PERF_URL ? null : await startLocalProduction({ port: 4210 });
  const base = process.env.JOURNEY_PERF_URL ?? own?.url ?? "";
  const judge = process.argv.includes("--software") ? software : hardware;
  const lines = await judge(base, owners).finally(() => own?.stop());
  if (own) {
    const refused = refusals();
    lines.push([`the server's offline guard refused: ${refused.join(", ") || "nothing"}`, refused.length === 0]);
  }
  for (const [text, ok] of lines) console.log(`${ok ? "✓" : "✗"} ${text}`);
  process.exit(lines.every(([, ok]) => ok) ? 0 : 1);
}
