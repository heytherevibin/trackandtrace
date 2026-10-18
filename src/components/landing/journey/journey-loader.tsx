"use client";

import { useEffect } from "react";

/** How long the page waits for the journey before it stays still for good (spec §3.B). */
export const WATCHDOG_MS = 15_000;
/** The longest the import waits for the browser to be idle. */
export const IDLE_TIMEOUT_MS = 1_500;

export type LoadJourney = () => Promise<{ readonly startJourney: () => () => void }>;

const loadJourney: LoadJourney = () => import("./start-journey");

function whenIdle(run: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, 1);
  return () => window.clearTimeout(id);
}

/**
 * Starts the landing's journey once the page is idle, so the check never waits on it. If the chunk fails, throws,
 * or has not started after WATCHDOG_MS, <html data-journey="failed"> keeps the page as the server drew it: still,
 * static, whole. It never touches the reader's Motion choice.
 */
export function JourneyLoader({ load = loadJourney }: { readonly load?: LoadJourney }) {
  useEffect(() => {
    const html = document.documentElement;
    let stop: (() => void) | null = null;
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      html.setAttribute("data-journey", "failed");
    };
    const watchdog = window.setTimeout(fail, WATCHDOG_MS);
    const cancelIdle = whenIdle(() => {
      load().then(({ startJourney }) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(watchdog);
        try {
          stop = startJourney();
        } catch {
          html.setAttribute("data-journey", "failed");
        }
      }, fail);
    });
    return () => {
      settled = true;
      cancelIdle();
      window.clearTimeout(watchdog);
      stop?.();
      stop = null;
      if (html.getAttribute("data-journey") === "failed") html.removeAttribute("data-journey");
    };
  }, [load]);
  return null;
}
