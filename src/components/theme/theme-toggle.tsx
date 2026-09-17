"use client";

import { AnimatePresence, m } from "motion/react";
import { useSyncExternalStore } from "react";
import { DarkThemeFilled, WeatherMoonFilled, WeatherSunnyFilled } from "@/components/icons";
import { messages } from "@/messages";
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

function modeAfter(value: ThemeChoice): Mode {
  const index = MODES.findIndex((mode) => mode.value === value);
  return MODES[(index + 1) % MODES.length]!;
}

/**
 * One theme button. It shows only the active mode, icon beside its capital label, and a click
 * moves to the next (Auto → Day → Night). The press compresses the button; the old icon turns
 * out as the new one turns in, and the label slides up. Reduced motion (MotionConfig "user")
 * drops the movement and keeps the change. Until the stored choice is known it holds its size
 * without claiming a mode.
 */
export function ThemeToggle({ className }: { readonly className?: string }) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribeNever, isClient, isServer);
  const current = MODES.find((mode) => mode.value === theme) ?? MODES[0]!;
  const next = modeAfter(current.value);
  const label = messages.shell.theme.cycle(current.label, next.label);

  return (
    <m.button
      type="button"
      onClick={() => setTheme(next.value)}
      aria-label={mounted ? label : messages.shell.theme.label}
      title={mounted ? label : undefined}
      whileTap={{ scale: 0.9 }}
      transition={{ type: "spring", stiffness: 600, damping: 28 }}
      className={cn(
        "press inline-flex h-8 shrink-0 cursor-pointer items-center gap-2 border border-line bg-transparent px-3 font-display text-2xs font-semibold uppercase leading-[normal] tracking-caps text-accent-text",
        "hover:border-line-strong hover:bg-accent/12 active:bg-accent/20",
        className,
      )}
    >
      <span aria-hidden="true" className="grid size-4 place-items-center">
        <AnimatePresence mode="popLayout" initial={false}>
          {mounted ? (
            <m.span
              key={current.value}
              className="col-start-1 row-start-1 flex"
              initial={{ rotate: -120, scale: 0.3, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              exit={{ rotate: 120, scale: 0.3, opacity: 0 }}
              transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
            >
              <current.Icon className="size-4" />
            </m.span>
          ) : null}
        </AnimatePresence>
      </span>
      {/* The longest label reserves the width, so the button never changes size between modes. */}
      <span aria-hidden="true" className="grid overflow-hidden">
        <span className="invisible col-start-1 row-start-1">{messages.shell.theme.system}</span>
        <AnimatePresence mode="popLayout" initial={false}>
          {mounted ? (
            <m.span
              key={current.value}
              className="col-start-1 row-start-1"
              initial={{ y: "110%", opacity: 0 }}
              animate={{ y: "0%", opacity: 1 }}
              exit={{ y: "-110%", opacity: 0 }}
              transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
            >
              {current.label}
            </m.span>
          ) : null}
        </AnimatePresence>
      </span>
    </m.button>
  );
}
