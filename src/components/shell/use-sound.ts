"use client";

import { useSyncExternalStore } from "react";

// The landing's Sound switch (spec §3.A, Footer): off by default; "on" is remembered. The journey's sound.ts
// listens for SOUND_EVENT and sounds only after the reader's own gesture.

export const SOUND_STORAGE_KEY = "tt.sound";
export const SOUND_EVENT = "tt:sound";

export interface SoundDetail {
  readonly on: boolean;
}

/** This page's choice when storage refuses it (blocked site data): it lasts the visit. */
const memory = { on: false };

export function soundOn(): boolean {
  try {
    return window.localStorage.getItem(SOUND_STORAGE_KEY) === "on";
  } catch {
    return memory.on;
  }
}

export function chooseSound(on: boolean): void {
  memory.on = on;
  try {
    if (on) window.localStorage.setItem(SOUND_STORAGE_KEY, "on");
    else window.localStorage.removeItem(SOUND_STORAGE_KEY);
  } catch {
    // as above
  }
  window.dispatchEvent(new CustomEvent<SoundDetail>(SOUND_EVENT, { detail: { on } }));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === SOUND_STORAGE_KEY || e.key === null) onChange();
  };
  window.addEventListener(SOUND_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(SOUND_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

const assumeOff = (): boolean => false;

/** Sound as the reader chose it. The server and hydration assume off. */
export function useSound(): boolean {
  return useSyncExternalStore(subscribe, soundOn, assumeOff);
}
