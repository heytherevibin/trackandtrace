import type { TrainRow } from "@/services/route-availability";

// Sorting and filtering the route list, over rows already in hand. Neither spends a request: the
// whole list arrived in one search, and re-asking it to reorder would be paying twice for the same
// answer.
//
// The rule under all of it: A VALUE THE SOURCE DID NOT GIVE IS NOT A ZERO. A train whose duration
// cannot be read, or whose fare never came, sorts LAST — sorting it first would answer "cheapest"
// or "quickest" with a train nobody can price or time.

export type SortKey = "departure" | "duration" | "fare";

/** Sorts after everything that has a value, whatever the direction. */
const LAST = Number.POSITIVE_INFINITY;

/**
 * The provider's own duration text, as minutes.
 *
 * Two forms are in the wild and both are kept verbatim by their adapters rather than re-derived
 * from the two times: "37h 40m" and "34:10 hrs". Anything else reads as null, because a duration
 * guessed from text nobody recognised would sort the list by a number the provider never sent.
 */
export function minutesOf(travelTime: string | null): number | null {
  if (!travelTime) return null;
  const text = travelTime.trim();
  const colon = /^(\d{1,3}):([0-5]\d)\b/.exec(text);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
  const spelled = /^(\d{1,3})\s*h(?:rs?|ours?)?(?:\s*(\d{1,2})\s*m(?:in(?:s|utes)?)?)?\b/i.exec(text);
  if (spelled) return Number(spelled[1]) * 60 + Number(spelled[2] ?? 0);
  return null;
}

/** "19:20" as minutes since midnight, or null when the provider gave nothing usable. */
function clockOf(departs: string | null): number | null {
  if (!departs) return null;
  const at = /^(\d{1,2}):([0-5]\d)$/.exec(departs.trim());
  if (!at) return null;
  const hours = Number(at[1]);
  return hours > 23 ? null : hours * 60 + Number(at[2]);
}

function fareOf(row: TrainRow, leadClass: string): number | null {
  return row.answers[leadClass]?.fare?.total ?? null;
}

function keyOf(row: TrainRow, leadClass: string, sort: SortKey): number {
  const value = sort === "departure" ? clockOf(row.train.departs) : sort === "duration" ? minutesOf(row.train.travelTime) : fareOf(row, leadClass);
  return value ?? LAST;
}

/**
 * True when the lead class on this row is something the source said can be booked.
 *
 * A row with no answer — never asked, or asked and refused — is not bookable. Keeping it under a
 * filter that says "only what I can book" would be making a claim on the source's behalf.
 */
function bookable(row: TrainRow, leadClass: string): boolean {
  return row.answers[leadClass]?.days.some((day) => day.canBook) ?? false;
}

export function orderRows(rows: readonly TrainRow[], leadClass: string, sort: SortKey, onlyBookable: boolean): readonly TrainRow[] {
  const kept = onlyBookable ? rows.filter((row) => bookable(row, leadClass)) : rows;
  // `toSorted` is stable, so a second click never shuffles rows that are genuinely equal.
  return kept.toSorted((a, b) => keyOf(a, leadClass, sort) - keyOf(b, leadClass, sort));
}
