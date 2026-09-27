// The departure board's status column (v3's board.js): the page's own station is AT PLATFORM, those behind it
// DEPARTED, the one after it NEXT, the rest blank. `stop` is a row's station index (1 for 01); `station` the
// strip's current index (0 at DEP).

export type BoardStatus = "departed" | "here" | "next" | "";

export function boardStatus(stop: number, station: number): BoardStatus {
  if (stop < station) return "departed";
  if (stop === station) return "here";
  return stop === station + 1 ? "next" : "";
}
