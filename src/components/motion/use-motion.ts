"use client";

import { useSyncExternalStore } from "react";
import { MOTION_STORAGE_KEY, REDUCED_MOTION_QUERY, resolveMotion, type MotionState } from "./motion-boot";

/** Dispatched on window after every rewrite of <html data-motion>; the journey (J3) rebuilds on it. */
export const MOTION_EVENT = "tt:motion";

function storedChoice(): string | null {
  try {
    return window.localStorage.getItem(MOTION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function deviceReducesMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** Re-resolves Motion from the choice (else the stored one) and the device, writes it, and tells listeners. */
export function applyMotion(choice: string | null = storedChoice()): MotionState {
  const motion = resolveMotion(choice, deviceReducesMotion());
  document.documentElement.setAttribute("data-motion", motion);
  window.dispatchEvent(new Event(MOTION_EVENT));
  return motion;
}

/** The footer switch. On is the default, so switching on forgets the choice rather than storing "on". */
export function chooseMotion(on: boolean): void {
  const choice = on ? null : "off";
  try {
    if (choice === null) window.localStorage.removeItem(MOTION_STORAGE_KEY);
    else window.localStorage.setItem(MOTION_STORAGE_KEY, choice);
  } catch {
    // Storage refused (blocked site data): this page still follows the switch; the next one will not know.
  }
  applyMotion(choice);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(MOTION_EVENT, onChange);
  return () => window.removeEventListener(MOTION_EVENT, onChange);
}

const readMotion = (): MotionState => (document.documentElement.getAttribute("data-motion") === "off" ? "off" : "on");
const assumeOn = (): MotionState => "on";
const assumeNotReduced = (): boolean => false;

/** Motion as the page shows it (<html data-motion>). The server and hydration assume on and not reduced. */
export function useMotion(): { readonly motion: MotionState; readonly deviceReduced: boolean } {
  const motion = useSyncExternalStore(subscribe, readMotion, assumeOn);
  const deviceReduced = useSyncExternalStore(subscribe, deviceReducesMotion, assumeNotReduced);
  return { motion, deviceReduced };
}
