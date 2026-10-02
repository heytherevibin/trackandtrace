import type { Page } from "@playwright/test";

// The 44px hit-walk, shared by tap-targets.spec.ts (every route at 100%) and the 200% text sweep (text-200.ts).

const MIN = 44;

export interface Undersized {
  readonly name: string;
  readonly box: string;
  readonly missed: string;
}

/**
 * Measures how far each control actually answers, by walking outward from its centre until
 * something else replies, and reports the ones that reach less than 44px across. The reach is
 * measured, not assumed to be centred: a narrow control beside a neighbour grows to one side
 * (.tap-44-start), and that is still 44px of target. A point answered by a DIFFERENT control
 * ends the walk — an overlay that swallows its neighbour shortens the neighbour, and shows up here.
 * A walk that leaves the viewport also ends: the reader cannot reach there either.
 */
export async function undersizedTargets(page: Page, within = "body"): Promise<readonly Undersized[]> {
  return page.evaluate(
    ({ min, within }) => {
      const SELECTOR = 'a[href], button, [role="button"], [role="switch"], input:not([type="hidden"]), select, textarea, summary';
      const reach = min; // how far the walk may go from the centre before giving up
      const root = document.querySelector(within);
      if (!root) throw new Error(`nothing matches ${within}`);
      const out: { name: string; box: string; missed: string }[] = [];
      for (const el of root.querySelectorAll<HTMLElement>(SELECTOR)) {
        if (!el.checkVisibility({ checkVisibilityCSS: true, opacityProperty: true })) continue;
        if (el.closest(".sr-only")) continue; // the skip link, revealed only on focus
        // A form proxy hidden from everyone (Base UI's checkbox beside a switch: aria-hidden, out of the tab
        // order, clipped to nothing) is not a target. The finger aims at the switch, which is measured.
        if (el.matches('input[aria-hidden="true"][tabindex="-1"]')) continue;
        if (el.tagName === "A" && el.closest("p, li, dd")) continue; // a link in running text is prose
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // A field is a replaced element and takes no pseudo-element, so it cannot carry an overlay.
        // The drawn 40px well is the whole target; growing it would change the drawing. Named here
        // rather than silently skipped: a field under 40px is still a failure.
        if (el.matches("input, select, textarea") && r.height >= 40) continue;
        // elementFromPoint only answers inside the viewport, so bring the control into it first and
        // re-read the box. Centred, so the sticky masthead never sits on what is being measured.
        el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
        const seen = el.getBoundingClientRect();
        const cx = seen.left + seen.width / 2;
        const cy = seen.top + seen.height / 2;
        const answers = (x: number, y: number): boolean => {
          if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
          // `next dev` floats its own indicator (<nextjs-portal>) over the bottom-left corner. It is not the app,
          // and production never renders it (tests/e2e/layout.ts skips it too), so look through it.
          const hit = document.elementsFromPoint(x, y).find((node) => !node.closest("nextjs-portal")) ?? null;
          // A <label> wrapped round its radio or checkbox answers for it: a press anywhere on the label is a press on
          // the control (the unsubscribe page's reasons, size-4 radios inside min-h-11 labels).
          const label = hit?.closest("label");
          return hit === el || el.contains(hit) || hit?.closest(SELECTOR) === el || (label !== null && label !== undefined && label.contains(el) && label.control === el);
        };
        const reachFrom = (dx: number, dy: number): number => {
          let far = 0;
          for (let d = 1; d <= reach; d += 1) {
            if (!answers(cx + dx * d, cy + dy * d)) break;
            far = d;
          }
          return far;
        };
        const width = reachFrom(-1, 0) + reachFrom(1, 0) + 1;
        const height = reachFrom(0, -1) + reachFrom(0, 1) + 1;
        if (width < min || height < min) {
          out.push({
            name: (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName).trim().slice(0, 32) || el.tagName,
            box: `${Math.round(r.width)}x${Math.round(r.height)}`,
            missed: `reaches ${width}x${height}`,
          });
        }
      }
      return out;
    },
    { min: MIN, within },
  );
}

export const report = (missed: readonly Undersized[]): readonly string[] => missed.map((m) => `${m.name} [${m.box}] ${m.missed}`);
