import { QUALITY_STORAGE_KEY } from "@/components/motion/motion-boot";
import { HUD_CHUNK_MARK } from "./hud-mark";
import type { Teardown } from "./start-journey";

// The frame meter (spec §3.J, §7; prototype v3's hud.js; J5-10): for trying the landing on a real phone. It shows
// frame rate, slow frames, long tasks, which drawing the page shows and why, its quality step and the device, with
// Copy to send the numbers back. A review tool on previews only, so its words live here, not in the messages.

const WHY: Readonly<Record<string, string>> = { motion: "motion off", saver: "data saver", webgl: "no WebGL", quality: "device too slow", load: "3D did not load", fit: "text too large", place: "below the drawing" };

export interface LongTask {
  readonly at: number;
  readonly ms: number;
}
export interface FrameStats {
  readonly fps: number;
  readonly p95: number;
  readonly slow: number;
  readonly longs: number;
  readonly longMax: number;
}

export function frameStats(frames: readonly number[], longs: readonly LongTask[], now: number): FrameStats {
  const sorted = [...frames].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  const recent = longs.filter((l) => now - l.at < 10_000);
  return {
    fps: at(0.5) ? Math.round(1000 / at(0.5)) : 0,
    p95: Math.round(at(0.95) * 10) / 10,
    slow: sorted.length ? Math.round((sorted.filter((x) => x > 33.4).length / sorted.length) * 1000) / 10 : 0,
    longs: recent.length,
    longMax: Math.round(Math.max(0, ...recent.map((l) => l.ms))),
  };
}

/** "ANGLE (Vendor, ANGLE Metal Renderer: Chip, Version)" → "Vendor, Chip"; "Adreno (TM) 610" stays whole. */
function gpu(): string {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    const name: unknown = info && gl ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl ? "WebGL 2" : "none";
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return String(name).replace(/^ANGLE \((.*)\)$/, "$1").replace(/ANGLE [\w ]+Renderer: /, "").replace(/,? (Unspecified Version|OpenGL.*|Direct3D.*|vs_.*)$/, "").slice(0, 48);
  } catch {
    return "unknown";
  }
}

function quality(): string {
  try {
    return window.sessionStorage.getItem(QUALITY_STORAGE_KEY) ?? "0";
  } catch {
    return "?";
  }
}

export function startHud(): Teardown {
  const el = document.createElement("div");
  el.className = "journey-hud";
  el.dataset.chunk = HUD_CHUNK_MARK; // the chunk budgets find the meter's chunk by this (journey-budgets.mjs)
  const head = document.createElement("div");
  const title = document.createElement("span");
  title.textContent = "Frame meter";
  const copy = document.createElement("button");
  copy.type = "button";
  copy.textContent = "Copy";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  close.setAttribute("aria-label", "Close the frame meter");
  const pre = document.createElement("pre");
  head.append(title, copy, close);
  el.append(head, pre);
  document.body.append(el);

  const nav = navigator as Navigator & { readonly deviceMemory?: number };
  const device = `${nav.hardwareConcurrency ?? "?"} cores${nav.deviceMemory ? `, ${nav.deviceMemory} GB` : ""}, ${gpu()}`;
  let frames: number[] = [];
  let longs: LongTask[] = [];
  let last = 0;
  let raf = 0;
  let hold = 0;
  const text = () => {
    const s = frameStats(frames, longs, performance.now());
    const { drawing = "live", drawingWhy = "" } = document.documentElement.dataset;
    const why = drawingWhy.split(" ").filter(Boolean).map((w) => WHY[w] ?? w).join(", ");
    return [
      `fps ${s.fps}   p95 ${s.p95} ms   slow ${s.slow}%`,
      `long tasks (10 s) ${s.longs}${s.longMax ? `, max ${s.longMax} ms` : ""}`,
      `drawing ${drawing}${why ? ` (${why})` : ""}${drawing === "live" ? `   quality ${quality()}` : ""}`,
      `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x   ${device}`,
    ].join("\n");
  };
  let observer: PerformanceObserver | null = null;
  try {
    observer = new PerformanceObserver((list) => {
      longs = [...longs, ...list.getEntries().map((e) => ({ at: e.startTime, ms: e.duration }))];
    });
    observer.observe({ type: "longtask", buffered: false });
  } catch {
    observer = null; // no long-task timing in this browser
  }
  const tick = (t: number) => {
    if (last) frames = [...frames.slice(-179), t - last];
    last = t;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  const timer = window.setInterval(() => {
    if (performance.now() < hold) return;
    pre.textContent = text();
    longs = longs.filter((l) => performance.now() - l.at < 10_000);
  }, 500);
  pre.textContent = text();

  const stop = () => {
    cancelAnimationFrame(raf);
    window.clearInterval(timer);
    observer?.disconnect();
    el.remove();
  };
  copy.addEventListener("click", () => {
    const report = `Trakline journey · ${new Date().toISOString()}\n${text()}`;
    // An insecure page has no clipboard: navigator.clipboard is undefined there, whatever lib.dom's type says.
    const clipboard: Clipboard | undefined = navigator.clipboard;
    const written = clipboard ? clipboard.writeText(report) : Promise.reject(new Error("no clipboard"));
    written.then(
      () => {
        copy.textContent = "Copied";
      },
      () => {
        // no clipboard here: select the numbers and hold them still for eight seconds
        hold = performance.now() + 8000;
        const range = document.createRange();
        range.selectNodeContents(pre);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
        copy.textContent = "Selected";
      },
    );
    window.setTimeout(() => (copy.textContent = "Copy"), 1600);
  });
  close.addEventListener("click", stop);
  return stop;
}
