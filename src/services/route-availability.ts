import type { AvailabilityAnswer } from "./availability-source";
import type { RouteTrain } from "./route-source";
import type { BookingClass } from "@/types/domain";

// ---------------------------------------------------------------------------
// The shape of a whole route's answer: every train the pair returns, each
// carrying the classes asked for so far.
//
// Availability exists only per train PER CLASS, so a row with no class asked is
// a timetable entry and not an answer — nothing to scan, sort or filter by.
// The rule this shape encodes: the FIRST chosen class is asked for every train,
// and the rest wait until a row is opened. Nine requests for a search of eight
// trains instead of twenty-five, and two more per row opened.
//
// Every row carrying the same class is also what makes the list sortable: a
// column of SL answers can be ranked against each other, where a mixture of
// classes could not.
//
// The types live here, apart from the service that fills them, so the surface
// that renders them does not import the fan-out and everything it reaches.
// ---------------------------------------------------------------------------

export interface RouteAvailabilityRequest {
  readonly from: string;
  readonly to: string;
  readonly journeyDate: string; // ISO
  readonly quota: string;
  /** In any order; the lead is derived, never taken as given. */
  readonly classes: readonly BookingClass[];
}

/**
 * One train's row.
 *
 * `answers` holds only the classes that were actually asked. A class in
 * `pending` was chosen and not asked — the row's "3A, 2A not asked yet".
 * `beyondCap` marks a train the fan-out cap stopped before it was asked at all,
 * which is a different thing from a train whose ask failed.
 *
 * `failed` is that third case: asked, and the source could not answer. The row
 * renders a refusal where its block would go. **It must never render as an
 * absent or empty block — an absence reads as "no berths".**
 */
export interface TrainRow {
  readonly train: RouteTrain;
  readonly answers: Readonly<Record<string, AvailabilityAnswer>>;
  readonly pending: readonly BookingClass[];
  /**
   * Classes this train does not carry — a fact about the TRAIN, and an answer.
   *
   * The provider names it distinctly ("Class does not exist in this train for this Train route",
   * measured 2026-09-25), so it is neither pending nor failed: asking again can only be refused the
   * same way, and calling it a failure would say "we could not ask", which is a different thing.
   */
  readonly notCarried: readonly BookingClass[];
  readonly beyondCap: boolean;
  readonly failed: boolean;
}

export interface RouteAvailabilityAnswer {
  readonly from: string;
  readonly to: string;
  readonly journeyDate: string;
  /** The class every asked row carries, and the one the list can be ranked by. */
  readonly leadClass: BookingClass;
  readonly rows: readonly TrainRow[];
  readonly retrievedAt: string;
}

/**
 * The chosen class the list leads with: the first in the order
 * `bookingClassSchema` declares, not the first clicked and not the cheapest.
 * Derived from the enum rather than a list kept beside it, so the two cannot
 * drift, and stable — two readers with the same selection see the same column.
 */
export function leadClassOf(chosen: readonly BookingClass[], order: readonly BookingClass[]): BookingClass | null {
  return order.find((cls) => chosen.includes(cls)) ?? null;
}
