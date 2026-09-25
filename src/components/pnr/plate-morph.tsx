"use client";

import { animate, m, useMotionValue } from "motion/react";
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
// The height tween is driven imperatively (`animate` on a motion value), not the declarative `animate` prop:
// under this app's strict `domAnimation` `LazyMotion`, a prop-driven keyframe update on an already-mounted
// `m.div` does not interpolate `height` (it jumps straight to the target, verified against Motion 13's own
// source — `render/dom/features-animation.mjs` — and empirically against the running app). The imperative
// engine (`animate`, `useMotionValue`) is a separate, always-available part of the same package.

const EXPO = [0.16, 1, 0.3, 1] as const;
const MORPH_S = 0.42;

export function PlateMorph({ face, children }: { readonly face: string; readonly children: ReactNode }) {
  const on = useMotion().motion === "on";
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const seen = useRef<{ readonly face: string; readonly height: number } | null>(null);
  const controls = useRef<ReturnType<typeof animate> | null>(null);
  const height = useMotionValue<number | "auto">("auto");

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
    // stale heights and fire a second, stale `tt:layout` from its own `onComplete`.
    controls.current?.stop();
    controls.current = null;

    const box = outer.current;
    if (!on || before.height === measured) {
      height.set("auto");
      if (box) box.style.overflow = "";
      window.dispatchEvent(new Event(LAYOUT_EVENT));
      return;
    }

    height.set(before.height);
    if (box) box.style.overflow = "clip";
    controls.current = animate(height, measured, {
      duration: MORPH_S,
      ease: EXPO,
      onComplete: () => {
        controls.current = null;
        height.set("auto");
        if (box) box.style.overflow = "";
        window.dispatchEvent(new Event(LAYOUT_EVENT));
      },
    });
  });

  // True unmount only: an in-flight tween never touches a detached node.
  useLayoutEffect(() => () => controls.current?.stop(), []);

  return (
    <m.div ref={outer} className="plate-morph" style={{ height }}>
      <m.div ref={inner} key={face} initial={rise ? { y: 8 } : false} animate={{ y: 0 }} transition={{ duration: rise ? MORPH_S : 0, ease: EXPO }}>
        {children}
      </m.div>
    </m.div>
  );
}
