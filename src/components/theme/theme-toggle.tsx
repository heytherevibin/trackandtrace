"use client";

import { AnimatePresence, m } from "motion/react";
import { useSyncExternalStore } from "react";
import { DarkThemeFilled, WeatherMoonFilled, WeatherSunnyFilled } from "@/components/icons";
import { messages } from "@/messages";
import { MASTHEAD_CONTROL, MASTHEAD_ICON_CONTROL } from "@/components/shell/nav-config";
import { cn } from "@/utils/cn";
import { useTheme, type ThemeChoice } from "./use-theme";

const subscribeNever = () => () => undefined;
const isClient = () => true;
const isServer = () => false;

interface Mode {
  readonly value: ThemeChoice;
  readonly label: string;
  readonly Icon: typeof DarkThemeFilled;
}

/** The cycle order: System → Day → Night → System. System follows the device (half light, half dark). */
const MODES: readonly Mode[] = [
  { value: "system", label: messages.shell.theme.system, Icon: DarkThemeFilled },
  { value: "light", label: messages.shell.theme.light, Icon: WeatherSunnyFilled },
  { value: "dark", label: messages.shell.theme.dark, Icon: WeatherMoonFilled },
];

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/**
 * Changes the theme with every colour landing at once, like next-themes' disableTransitionOnChange,
 * but without switching transitions off wholesale: the press animation keeps easing (motion.css reads
 * data-theme-switching and leaves only transform transitions running for two frames).
 */
function switchTheme(setTheme: (next: ThemeChoice) => void, next: ThemeChoice): void {
  const root = document.documentElement;
  root.dataset.themeSwitching = "";
  setTheme(next);
  requestAnimationFrame(() => requestAnimationFrame(() => delete root.dataset.themeSwitching));
}

function modeAfter(value: ThemeChoice): Mode {
  const index = MODES.findIndex((mode) => mode.value === value);
  return MODES[(index + 1) % MODES.length]!;
}

/**
 * One square theme icon button. It shows only the active mode's icon; the mode and the next one live in
 * its accessible name and tooltip ("Theme: Day. Switch to Night"). A click moves System → Day → Night. The
 * press is the app-wide one (motion.css); the old icon turns out as the new one turns in. Reduced motion
 * (MotionConfig "user") drops the turn and keeps the change. Until the stored choice is known it holds its
 * size without claiming a mode.
 */
export function ThemeToggle({ className }: { readonly className?: string }) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribeNever, isClient, isServer);
  const current = MODES.find((mode) => mode.value === theme) ?? MODES[0]!;
  const next = modeAfter(current.value);
  const label = messages.shell.theme.cycle(current.label, next.label);

  return (
    <button
      type="button"
      onClick={() => switchTheme(setTheme, next.value)}
      aria-label={mounted ? label : messages.shell.theme.label}
      title={mounted ? label : undefined}
      className={cn(MASTHEAD_CONTROL, MASTHEAD_ICON_CONTROL, "overflow-hidden", className)}
    >
      {/* Entering and leaving icons overlap in one grid cell (no popLayout, which lifted the leaving icon out
          of flow and flashed it outside the button on its last frame). The button clips its content, so a
          turning icon is never painted past the box, whatever layers an engine composites it on. */}
      <span aria-hidden="true" className="grid size-5 place-items-center">
        <AnimatePresence initial={false}>
          {mounted ? (
            <m.span
              key={current.value}
              className="col-start-1 row-start-1 flex"
              initial={{ rotate: -120, scale: 0.3, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              exit={{ rotate: 120, scale: 0.3, opacity: 0 }}
              transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
            >
              <current.Icon className="size-5" />
            </m.span>
          ) : null}
        </AnimatePresence>
      </span>
    </button>
  );
}