"use client";

import { useSyncExternalStore } from "react";
import { readRaw, writeRaw } from "./local-storage";

// PWA install: Chromium fires beforeinstallprompt; iOS Safari never does, so it
// gets written instructions. A dismissal sleeps the prompt for thirty days.

export const INSTALL_DISMISS_KEY = "tt.install.v1";
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallPlatform = "chromium" | "ios" | "none";

interface InstallState {
  readonly platform: InstallPlatform;
  readonly visible: boolean;
}

export function dismissSleeping(raw: unknown, now: Date): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  const at = (raw as { dismissedAt?: unknown }).dismissedAt;
  return typeof at === "string" && now.getTime() - Date.parse(at) < SNOOZE_MS;
}

let deferred: BeforeInstallPromptEvent | null = null;
let state: InstallState = { platform: "none", visible: false };
const listeners = new Set<() => void>();
let wired = false;

function emit(next: InstallState): void {
  state = next;
  for (const fn of listeners) fn();
}

function standalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

function wire(): void {
  if (wired || typeof window === "undefined") return;
  wired = true;
  if (standalone() || dismissSleeping(readRaw(INSTALL_DISMISS_KEY), new Date())) return;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    emit({ platform: "chromium", visible: true });
  });
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua) && !/crios|fxios/i.test(ua)) {
    emit({ platform: "ios", visible: true });
  }
}

export const installPromptStore = {
  subscribe(listener: () => void): () => void {
    wire();
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: (): InstallState => state,
  async install(): Promise<void> {
    const event = deferred;
    if (!event) return;
    deferred = null;
    await event.prompt();
    emit({ platform: "chromium", visible: false });
  },
  dismiss(): void {
    writeRaw(INSTALL_DISMISS_KEY, { dismissedAt: new Date().toISOString() });
    emit({ ...state, visible: false });
  },
} as const;

const SERVER_STATE: InstallState = { platform: "none", visible: false };

export function useInstallPrompt(): InstallState & { readonly install: () => void; readonly dismiss: () => void } {
  const current = useSyncExternalStore(installPromptStore.subscribe, installPromptStore.get, () => SERVER_STATE);
  return { ...current, install: () => void installPromptStore.install(), dismiss: installPromptStore.dismiss };
}
