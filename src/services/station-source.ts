import type { SourceFailure } from "./sources/outcome";

// ---------------------------------------------------------------------------
// Finding a station, so the form can take a NAME where it used to take a code.
//
// **Two lookups, not one, and this is the whole reason this seam exists.** The
// provider's search matches names only — measured 2026-09-26:
//
//     "SBC"      → 0 results        (the station itself; its name is
//                                    "KRANTIVIRA SANGOLLI RAYANNA (BENGALURU)")
//     "MAS"      → 10 results, none of them MAS (AMMASANDRA, BHALUMASKA, …)
//     "bengal"   → SBC, among three
//
// So a reader who types the code they have always used gets nothing, or ten
// wrong stations. Wiring the search alone to the field would have made the form
// worse for everyone who already knows what they want. A code-shaped query is
// therefore ALSO resolved exactly, and that answer leads.
// ---------------------------------------------------------------------------

export interface Station {
  readonly code: string;
  readonly name: string;
}

export type StationsOutcome = { readonly ok: true; readonly stations: readonly Station[] } | SourceFailure;

export interface StationSource {
  /** Stations whose NAME matches. Never matches a code — see the note above. */
  search(name: string): Promise<StationsOutcome>;
  /** One station by its exact code, or a refusal when there is no such code. */
  byCode(code: string): Promise<StationsOutcome>;
}
