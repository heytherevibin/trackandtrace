// Whether a pinned piece's parts fit its window (spec §3.A): inside the pin, and above the window's foot under
// the masthead. A part that is not shown (null) never blocks. Pure; chapters.ts measures the boxes.

export interface Span {
  readonly top: number;
  readonly bottom: number;
}

export function fitsWindow(parts: readonly (Span | null)[], pin: Span, windowBottom: number): boolean {
  const bottom = Math.min(pin.bottom, windowBottom);
  return parts.every((p) => p === null || (p.top >= pin.top - 1 && p.bottom <= bottom + 1));
}
