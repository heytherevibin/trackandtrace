"use client";

import { animate } from "motion/react";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { LAYOUT_EVENT } from "@/components/landing/journey/journey-events";
import { useMotion } from "@/components/motion/use-motion";

// A check plate's morph between its entry and its record (spec §3.B; ruling J3-13): the block's height tweens
// from the old face's to the new one's, so the plate's border grows with it, and the new face rises 8px. The
// old face goes at once, never fading text. Motion off: an instant swap. Afterwards the height is the
// content's again, and the page is told its layout moved (tt:layout).
//
// Only a change of face morphs. The first face never rises: not in the server's markup, not at hydration
// (where Motion always reads as on), not on first paint, whatever the reader's Motion. The rise belongs to
// a face that replaced another after mount, and only with Motion on. Motion switched off mid-rise stops the
// face where it rests.
//
// This component is the one writer of the block's inline height and the face's inline transform: both are
// tweened as plain numbers by Motion's imperative `animate`, written from its `onUpdate`, and cleared when
// they settle, so the server's markup (no inline style) is the resting state. Neither is a motion value bound
// through `style`: that gave Motion's render a second say over the same property, and its render could skip
// the settle when the tween's promise-driven completion landed after the frame that painted its last value.
// A stopped tween never settles through its own `onComplete`: only the tween still current may.

const EXPO = [0.16, 1, 0.3, 1] as const;
const MORPH_S = 0.42;
const RISE_PX = 8;

type Tween = ReturnType<typeof animate>;
interface Rise {
  readonly tween: Tween;
  readonly el: HTMLElement;
}

/** Stops the block's height tween, if one is running. The ref is cleared first, so its completion is a no-op
 * (a stop can land the tween on its last frame); whoever stops it writes the height next. */
function stopGrow(grow: { current: Tween | null }): void {
  const running = grow.current;
  grow.current = null;
  running?.stop();
}

/** Stops the face's rise, if one is running, and puts the face at rest (no inline transform). */
function stopRise(rise: { current: Rise | null }): void {
  const running = rise.current;
  if (!running) return;
  rise.current = null;
  running.tween.stop();
  running.el.style.transform = "";
}

export function PlateMorph({ face, children }: { readonly face: string; readonly children: ReactNode }) {
  const on = useMotion().motion === "on";
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const seen = useRef<{ readonly face: string; readonly height: number } | null>(null);
  const grow = useRef<Tween | null>(null);
  const rise = useRef<Rise | null>(null);

  // After every commit: remember this face's height; when the face has just changed, morph from the last one's.
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measured = el.offsetHeight;
    const before = seen.current;
    seen.current = { face, height: measured };
    if (!before || before.face === face) return;

    // Every face change starts clean: a still-running tween from the last one would otherwise keep writing
    // stale heights and fire a second, stale `tt:layout`.
    stopGrow(grow);
    stopRise(rise);

    const box = outer.current;
    const settle = () => {
      if (box) {
        box.style.height = "";
        box.style.overflow = "";
      }
      window.dispatchEvent(new Event(LAYOUT_EVENT));
    };

    if (on) {
      // Written before the first paint, so the new face is never seen at rest before it rises.
      el.style.transform = `translateY(${RISE_PX}px)`;
      const tween: Tween = animate(RISE_PX, 0, {
        duration: MORPH_S,
        ease: EXPO,
        onUpdate: (y) => {
          el.style.transform = `translateY(${y}px)`;
        },
        onComplete: () => {
          if (rise.current?.tween !== tween) return;
          rise.current = null;
          el.style.transform = "";
        },
      });
      rise.current = { tween, el };
    }

    if (!on || before.height === measured) {
      settle();
      return;
    }

    if (box) {
      box.style.height = `${before.height}px`;
      box.style.overflow = "clip";
    }
    // The tween is of the way there, 0 to 1, and "there" is the face's height as it stands on each frame, not the
    // height measured above. A face can change its own height after this commit without this component rendering
    // again: the record's passenger table stacks where the window cannot show it (use-outgrown.ts), and the stacked
    // record is taller. A tween to the first measure ended that much short, and the plate jumped the rest when it let
    // go. A face that keeps its height gives the same numbers as before.
    const from = before.height;
    const tween: Tween = animate(0, 1, {
      duration: MORPH_S,
      ease: EXPO,
      onUpdate: (way) => {
        if (box) box.style.height = `${from + (el.offsetHeight - from) * way}px`;
      },
      onComplete: () => {
        if (grow.current !== tween) return;
        grow.current = null;
        settle();
      },
    });
    grow.current = tween;
  });

  // The face's height is kept as it changes, not only as this component renders. A face can change its own height in a
  // commit of its own (the record's passenger table stacks on a phone, use-outgrown.ts), and the next morph starts from
  // the height remembered here: remembered from the commit that drew the face, "Check another PNR" cut a stacked record
  // to its table's height for a frame before it shrank. Each face is an element of its own (keyed), so each is watched.
  useEffect(() => {
    const el = inner.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      if (seen.current?.face === face) seen.current = { face, height: el.offsetHeight };
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [face]);

  // Motion switched off mid-rise: the face stops where it rests, at once.
  useLayoutEffect(() => {
    if (!on) stopRise(rise);
  }, [on]);

  // True unmount only: an in-flight tween is stopped, and its completion is already a no-op.
  useLayoutEffect(
    () => () => {
      stopGrow(grow);
      stopRise(rise);
    },
    [],
  );

  return (
    <div ref={outer} className="plate-morph">
      <div ref={inner} key={face}>
        {children}
      </div>
    </div>
  );
}
