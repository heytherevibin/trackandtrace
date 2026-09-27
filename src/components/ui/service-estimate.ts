// The reservation service's own confirmation estimate — shown as ITS estimate, never as ours.
//
// **What changed, and it is a promise and not a feature flag.** Until now these fields were carried
// through the type layer, recorded in the observation store, and never drawn: the site said
// confirmation odds were never shown, and showing someone else's as our own would have been untrue
// twice over. It is drawn now, attributed, because a traveller deciding whether to book is better
// served by the service's own reading than by our silence about a number the service published and
// they can see elsewhere. What stays true is the part that mattered: **Trakline still calculates
// nothing.** `queueMovement` reports what has already happened to a queue; this reports what the
// reservation service says about it; neither is a number this product invented.
//
// **The rule reads what the service SAID.** Counted in the live store on 2026-09-27, across 441
// rows, its `prediction` takes four forms:
//
//   301 × "N% Chance"        an estimate, with its figure
//     2 × "Low Chance"       an estimate in WORDS — and it still carries a figure, 26 and 25
//    65 × "Available"        pct 100 on 65 bookable rows: the status, restated
//    73 × "No More Booking"  pct 0 on 73 rows, none bookable: likewise
//
// So the test is the word "chance", not the shape of the number. An allow-list of `N% Chance` would
// have silently dropped "Low Chance" — which is the WARNING case, the one a traveller most needs —
// and a rule keyed on the percentage alone would have drawn "100%" beside a day whose berths are
// already free, turning an echo into a forecast. A form this app has never seen is not shown at
// all, which is the same way `statusTone` fails safe.

/** Reads the service's estimate, or null when it has not made one. */
export function serviceEstimate(day: { readonly prediction: string | null; readonly predictionPercentage: number | null }): number | null {
  const said = day.prediction?.trim() ?? "";
  const pct = day.predictionPercentage;
  if (said === "" || pct === null) return null;
  if (!/chance/i.test(said)) return null;
  // A percentage outside its own range is a reading this app has got wrong, and a number drawn from
  // a misreading is worse than none — the same guard `percent` applies on the way in.
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
  return pct;
}
