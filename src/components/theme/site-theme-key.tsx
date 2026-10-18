"use client";

import { AnimatePresence, m } from "motion/react";
import { useSyncExternalStore } from "react";
import { messages } from "@/messages";
import { MASTHEAD_KEY } from "@/components/shell/nav-config";
import { cn } from "@/utils/cn";
import { nightFalls, resolvedChoice } from "./night-falls";
import { useTheme, type ResolvedTheme } from "./use-theme";

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
const subscribeNever = () => () => undefined;
const isClient = () => true;
const isServer = () => false;

/** v4's two faces. Until a reader presses a key the site follows the device; a press picks the other face. */
function faces(resolved: ResolvedTheme | undefined) {
  const night = resolved === "dark";
  const t = messages.shell.theme;
  return { night, current: night ? t.dark : t.light, next: night ? t.light : t.dark, nextValue: night ? ("light" as const) : ("dark" as const) };
}

function useFaces() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribeNever, isClient, isServer);
  const f = faces(mounted ? resolvedTheme : undefined);
  const flip = (el: HTMLElement) => {
    const root = document.documentElement;
    nightFalls(el, () => {
      root.dataset.themeSwitching = "";
      setTheme(f.nextValue);
      requestAnimationFrame(() => requestAnimationFrame(() => delete root.dataset.themeSwitching));
    }, resolvedChoice(f.nextValue));
  };
  return { ...f, mounted, flip };
}

function Sun() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="block">
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
    </svg>
  );
}

function Moon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="block">
      <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
    </svg>
  );
}

/**
 * The masthead's 40px theme key (v4 .mh-theme): a sun by Day, a moon by Night. With Motion on the old glyph turns out
 * as the new one turns in, as the console's key does; reduced motion (MotionConfig "user") drops the turn.
 */
export function SiteThemeKey({ className }: { readonly className?: string }) {
  const f = useFaces();
  const label = messages.shell.theme.cycle(f.current, f.next);
  return (
    <button
      type="button"
      onClick={(event) => f.flip(event.currentTarget)}
      aria-label={f.mounted ? label : messages.shell.theme.label}
      title={f.mounted ? label : undefined}
      aria-pressed={f.night}
      className={cn(MASTHEAD_KEY, className)}
    >
      {/* The clip sits on this span, not the key, so the key keeps its coarse-pointer hit overlay (motion.css). */}
      <span aria-hidden="true" className="grid size-full place-items-center overflow-hidden">
        <AnimatePresence initial={false}>
          {f.mounted ? (
            <m.span
              key={f.night ? "night" : "day"}
              className="col-start-1 row-start-1 flex"
              initial={{ rotate: -120, scale: 0.3, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              exit={{ rotate: 120, scale: 0.3, opacity: 0 }}
              transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
            >
              {f.night ? <Moon /> : <Sun />}
            </m.span>
          ) : null}
        </AnimatePresence>
      </span>
    </button>
  );
}

/** The menu drawer's theme row (v4): "Theme · Day" and a square switch, its knob yellow by Night. */
export function SiteThemeRow() {
  const f = useFaces();
  return (
    <button
      type="button"
      onClick={(event) => f.flip(event.currentTarget)}
      aria-pressed={f.night}
      className="nb-press inline-flex min-h-12 w-full cursor-pointer items-center justify-between gap-2 rounded-control border-2 border-edge bg-paper px-4 font-structure text-base font-bold leading-6 text-ink-1 shadow-control hover:bg-pink hover:text-on-fill"
    >
      {messages.shell.theme.row(f.current)}
      <span aria-hidden="true" className="relative block h-5 w-10 rounded-control border-2 border-edge bg-paper">
        <span className={cn("absolute top-0.5 size-3 border-2 border-edge transition-[left] duration-200", f.night ? "left-[22px] bg-accent" : "left-0.5 bg-edge")} />
      </span>
    </button>
  );
}
