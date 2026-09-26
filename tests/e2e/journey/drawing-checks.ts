import type { Page } from "@playwright/test";

/**
 * The drawn train's own collisions (spec §5), beside the shared checker in collisions.ts. It reports:
 * - a label over the drawing's drawn box (the shown <svg>'s content, not its holder);
 * - two leaders that cross;
 * - a leader that crosses another label.
 * Only while the labels stand in columns; the parts list cannot overlap.
 */
export async function drawingCollisions(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const pin = document.querySelector<HTMLElement>("#anatomy .anatomy-pin.is-columns");
    if (!pin) return [];
    const svg = [...pin.querySelectorAll<SVGSVGElement>(".anatomy-still:not(.is-noscript) svg")].find((s) => s.checkVisibility());
    const found: string[] = [];
    const labels = [...pin.querySelectorAll<HTMLElement>(".callout")].map((el) => ({ part: el.dataset.part ?? "", r: el.getBoundingClientRect() }));
    type R = { left: number; top: number; right: number; bottom: number };
    const overlaps = (a: R, b: R) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    if (svg) {
      const box = svg.getBBox();
      const m = svg.getScreenCTM();
      if (m && box.width > 0) {
        const p = (x: number, y: number) => new DOMPoint(x, y).matrixTransform(m);
        const a = p(box.x, box.y);
        const b = p(box.x + box.width, box.y + box.height);
        const drawn = { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) };
        for (const l of labels) if (overlaps(l.r, drawn)) found.push(`label ${l.part} over the drawing`);
      }
    }
    const pr = pin.getBoundingClientRect();
    const leaders = [...pin.querySelectorAll<SVGLineElement>(".callout-lines line")].map((line, i) => ({
      part: labels[i]?.part ?? String(i),
      a: { x: pr.left + Number(line.getAttribute("x1")), y: pr.top + Number(line.getAttribute("y1")) },
      b: { x: pr.left + Number(line.getAttribute("x2")), y: pr.top + Number(line.getAttribute("y2")) },
    }));
    type P = { x: number; y: number };
    const side = (p: P, q: P, r: P) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    const cross = (p1: P, p2: P, q1: P, q2: P) => side(p1, p2, q1) * side(p1, p2, q2) < 0 && side(q1, q2, p1) * side(q1, q2, p2) < 0;
    leaders.forEach((s, i) =>
      leaders.slice(i + 1).forEach((t) => {
        if (cross(s.a, s.b, t.a, t.b)) found.push(`leaders ${s.part} and ${t.part} cross`);
      }),
    );
    for (const s of leaders) {
      for (const l of labels) {
        if (l.part === s.part) continue;
        const { left, top, right, bottom } = l.r;
        const edges: [P, P][] = [[{ x: left, y: top }, { x: right, y: top }], [{ x: right, y: top }, { x: right, y: bottom }], [{ x: right, y: bottom }, { x: left, y: bottom }], [{ x: left, y: bottom }, { x: left, y: top }]];
        if (edges.some(([p, q]) => cross(s.a, s.b, p, q))) found.push(`leader ${s.part} crosses label ${l.part}`);
      }
    }
    return found;
  });
}
