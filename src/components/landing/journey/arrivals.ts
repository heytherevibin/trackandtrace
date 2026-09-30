import { animate, splitText, stagger, utils, type TextSplitter } from "animejs";
import { ease } from "./ease";
import { STAGGER, T } from "./motion-tokens";
import { watchEntrances, type Entrance } from "./observers";
import type { JourneyContext, Teardown } from "./start-journey";

// Section entrances (spec §3.A), once per section per load (the owner, 2026-09-30): kickers flip in, rows rise,
// registration marks snap onto plates. Each has its own key in the journey's played set (watchEntrances).
// Text moves by transform only; the marks are drawing and may fade. Motion off: none of it.

const ROWS: readonly (readonly [targets: string, section: string])[] = [
  ["#principles [role=row]", "#principles"],
  ["#record .blueprint, #record .berth-plan", "#record"],
  ["#reliability dl > div, #reliability .station-clock", "#reliability"],
  ["#roadmap li", "#roadmap"],
  ["#features article", "#features"],
  ["#faq details", "#faq"],
];

type Styled = HTMLElement | SVGElement;

/** Stops any tween on these elements and hands their transform and opacity back to the stylesheet. */
function release(els: readonly Styled[]): void {
  if (els.length) utils.remove(els as Styled[]);
  for (const el of els) {
    el.style.removeProperty("transform");
    el.style.removeProperty("opacity");
  }
}

function all<E extends Element>(selector: string, root: ParentNode = document): E[] {
  return [...root.querySelectorAll<E>(selector)];
}

function kickers(): Entrance[] {
  return all<HTMLElement>("main [data-flap]").map((kicker, k) => {
    let split: TextSplitter | null = null;
    const unsplit = () => {
      split?.revert();
      split = null;
    };
    return {
      trigger: kicker.closest("section") ?? kicker,
      at: 0.88,
      once: `kicker:${k}`,
      arm: () => {
        unsplit();
        split = splitText(kicker, { chars: true });
        utils.set(split.chars, { rotateX: -80 });
      },
      play: () => {
        const own = split;
        if (!own) return;
        animate(own.chars, {
          rotateX: [-80, 0],
          delay: stagger(STAGGER.char),
          duration: T.base,
          ease: ease.expo(),
          // Never revert inside a completion: Anime.js is still finishing it.
          onComplete: () => window.setTimeout(() => split === own && unsplit(), 0),
        });
      },
      settle: unsplit,
    };
  });
}

function rows(): Entrance[] {
  return ROWS.flatMap(([selector, section]) => {
    const trigger = document.querySelector(section);
    const targets = all<HTMLElement>(selector);
    if (!trigger || !targets.length) return [];
    return [
      {
        trigger,
        at: 0.88,
        once: `rows:${section}`,
        arm: () => {
          release(targets);
          utils.set(targets, { translateY: 16 });
        },
        play: () => {
          animate(targets, { translateY: [16, 0], delay: stagger(STAGGER.row), duration: T.slow, ease: ease.expo(), onComplete: () => release(targets) });
        },
        settle: () => release(targets),
      },
    ];
  });
}

function marks(): Entrance[] {
  return all<HTMLElement>("main .blueprint").flatMap((plate, k) => {
    const corners = all<HTMLElement>(":scope > .corner", plate);
    if (!corners.length) return [];
    return [
      {
        trigger: plate,
        at: 0.92,
        once: `marks:${k}`,
        arm: () => {
          release(corners);
          utils.set(corners, { scale: 2.2, opacity: 0 });
        },
        play: () => {
          animate(corners, { scale: [2.2, 1], opacity: [0, 1], delay: stagger(STAGGER.row), duration: T.base, ease: ease.expo(), onComplete: () => release(corners) });
        },
        settle: () => release(corners),
      },
    ];
  });
}

export function startArrivals({ motion, played }: JourneyContext): Teardown {
  if (!motion) return () => {};
  return watchEntrances([...kickers(), ...rows(), ...marks()], played);
}
