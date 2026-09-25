"use client";

import { animate, m } from "motion/react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { LAYOUT_EVENT } from "@/components/landing/journey/journey-events";
import { useMotion } from "@/components/motion/use-motion";

// A check plate's morph between its entry and its record (spec §3.B; ruling J3-13): the block's height tweens
// from the old face's to the new one's, so the plate's border grows with it, and the new face rises 8px. The
// old face goes at once, never fading text. Motion off: an instant swap. Afterwards the height is the
// content's again, and the page is told its layout moved (tt:layout).
//
// Only a change of face morphs. The first face never rises: not in the server's markup, not at hydration
// (where Motion always reads as on), not on first paint, whatever the reader's Motion. The rise belongs to
// a face that replaced another after mount, and only with Motion on.
//
// This component is the one writer of the block's inline height: it is tweened as a plain number by Motion's
// imperative `animate`, written from its `onUpdate`, and cleared when it settles, so the server's markup (no
// inline height) is the resting state. It is not a motion value bound through `style`: that gave Motion's
// render a second say over the same property, and its render could skip the settle when the tween's
// promise-driven completion landed after the frame that painted its last value. A stopped tween never
// settles through its own `onComplete`: only the tween still current may.

const EXPO = [0.16, 1, 0.3, 1] as const;
const MORPH_S = 0.42;

type Tween = ReturnType<typeof animate>;

/** Stops the block's height tween, if one is running. The ref is cleared first, so its completion is a no-op
 * (a stop can land the tween on its last frame); whoever stops it writes the height next. */
function stopGrow(grow: { current: Tween | null }): void {
  const running = grow.current;
  grow.current = null;
  running?.stop();
}

export function PlateMorph({ face, children }: { readonly face: string; readonly children: ReactNode }) {
  const on = useMotion().motion === "on";
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const seen = useRef<{ readonly face: string; readonly height: number } | null>(null);
  const grow = useRef<Tween | null>(null);

  // Whether the face has ever changed since mount: the last face seen, updated during render (React's
  // pattern for information from previous renders), so the new face's first render already knows.
  const [last, setLast] = useState<{ readonly face: string; readonly changed: boolean }>({ face, changed: false });
  if (last.face !== face) setLast({ face, changed: true });
  const rise = on && last.changed;

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

    const box = outer.current;
    const settle = () => {
      if (box) {
        box.style.height = "";
        box.style.overflow = "";
      }
      window.dispatchEvent(new Event(LAYOUT_EVENT));
    };
    if (!on || before.height === measured) {
      settle();
      return;
    }

    if (box) {
      box.style.height = `${before.height}px`;
      box.style.overflow = "clip";
    }
    const tween: Tween = animate(before.height, measured, {
      duration: MORPH_S,
      ease: EXPO,
      onUpdate: (h) => {
        if (box) box.style.height = `${h}px`;
      },
      onComplete: () => {
        if (grow.current !== tween) return;
        grow.current = null;
        settle();
      },
    });
    grow.current = tween;
  });

  // True unmount only: an in-flight tween is stopped, and its completion is already a no-op.
  useLayoutEffect(() => () => stopGrow(grow), []);

  return (
    <div ref={outer} className="plate-morph">
      <m.div ref={inner} key={face} initial={rise ? { y: 8 } : false} animate={{ y: 0 }} transition={{ duration: rise ? MORPH_S : 0, ease: EXPO }}>
        {children}
      </m.div>
    </div>
  );
}
