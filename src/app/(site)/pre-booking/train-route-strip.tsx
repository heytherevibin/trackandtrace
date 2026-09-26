"use client";

import { useCallback, useId, useRef, useState } from "react";
import { messages } from "@/messages";
import type { TrainRow } from "@/services/route-availability";
import type { TrainStop } from "@/services/train-route-source";
import { cn } from "@/utils/cn";

// The train's whole run, behind an icon in the row's corner.
//
// **Fetched per TRAIN, and only when a reader opens one.** One provider request buys the run, and a
// search lists up to twelve trains — so asking for the list would be twelve requests nobody asked
// for. The answer is then held in the shared store for a day, because a timetable changes a few
// times a year, so the second reader of a popular train costs nothing.
//
// Until it arrives, the four points the SEARCH already carried are drawn: origin, boarding,
// alighting, destination. So the popover always says something true immediately, and the fetch only
// ever fills in the middle.
//
// Hover is not the only way in. It opens on focus and on click, because a popover a keyboard or a
// touch screen cannot reach is a popover most readers cannot reach.

const m = messages.booking.list.route;

/** Above this many stops the middle folds away. Both ends stay, because both ends are what is checked. */
const FOLD_ABOVE = 8;
/** How many to keep at each end when folded. */
const KEEP = 3;

interface Point {
  readonly code: string;
  readonly name: string;
  /** Whether this point is on the segment the traveller is actually travelling. */
  readonly mine: boolean;
  readonly arrival?: string | null;
  readonly departure?: string | null;
  readonly day?: number | null;
}

/**
 * The four points the search already gave, folded where two are the same station.
 *
 * Drawn until the full run arrives, and instead of it when the fetch fails: a popover that says
 * nothing while loading, and nothing again on failure, is worse than one that says what it knows.
 */
export function stopsOf(train: TrainRow["train"]): readonly Point[] {
  const out: Point[] = [];
  const push = (code: string, name: string, mine: boolean) => {
    const last = out[out.length - 1];
    // Folded, and the fold keeps `mine`: a station that is both the origin and where you board is
    // still where you board, and drawing it hollow would say the opposite.
    if (last && last.code === code) {
      if (mine) out[out.length - 1] = { ...last, mine: true };
      return;
    }
    out.push({ code, name, mine });
  };
  push(train.originCode, train.originName, false);
  push(train.fromCode, train.fromName, true);
  push(train.toCode, train.toName, true);
  push(train.destinationCode, train.destinationName, false);
  return out;
}

/** The fetched run, with the traveller's own segment marked from the codes the search gave. */
function pointsOfRun(stops: readonly TrainStop[], train: TrainRow["train"]): readonly Point[] {
  const from = train.fromCode.toUpperCase();
  const to = train.toCode.toUpperCase();
  const start = stops.findIndex((s) => s.code.toUpperCase() === from);
  const end = stops.map((s) => s.code.toUpperCase()).lastIndexOf(to);
  return stops.map((stop, i) => ({
    code: stop.code,
    name: stop.name,
    // Only between the two, and only when both were found. A run that does not contain the pair is
    // not a reason to mark every stop as the traveller's.
    mine: start >= 0 && end >= start && i >= start && i <= end,
    arrival: stop.arrival,
    departure: stop.departure,
    day: stop.day,
  }));
}

/** The glyph: a route that turns, with a node at each end. */
function RouteIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="3.5" cy="3.5" r="1.75" />
      <circle cx="12.5" cy="12.5" r="1.75" />
      <path d="M5.25 3.5h5.25a2 2 0 0 1 0 4h-5a2 2 0 0 0 0 4h5.25" strokeLinecap="round" />
    </svg>
  );
}

type Phase = "idle" | "loading" | "done" | "error";

export function TrainRoutePopover({ train, className }: { readonly train: TrainRow["train"]; readonly className?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [run, setRun] = useState<readonly TrainStop[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const asked = useRef(false);

  const fetchRun = useCallback(async () => {
    // Once per row, whatever happens. A failed run is not retried on every hover, which on a bad
    // day would be a request per mouse movement.
    if (asked.current) return;
    asked.current = true;
    setPhase("loading");
    try {
      const res = await fetch(`/api/train-route?train=${encodeURIComponent(train.trainNo)}`);
      const body = (await res.json()) as { ok?: boolean; stops?: readonly TrainStop[] };
      if (!res.ok || body.ok !== true || !Array.isArray(body.stops) || body.stops.length === 0) {
        setPhase("error");
        return;
      }
      setRun(body.stops);
      setPhase("done");
    } catch {
      setPhase("error");
    }
  }, [train.trainNo]);

  /**
   * Opening is what asks. Not an effect on `open`: an effect that writes state renders the popover
   * once idle and again loading, and the second render is the one a reader sees flicker.
   */
  function show(): void {
    setOpen(true);
    void fetchRun();
  }

  const points = run ? pointsOfRun(run, train) : stopsOf(train);
  if (points.length < 2) return null;

  const first = points.findIndex((p) => p.mine);
  const last = points.map((p) => p.mine).lastIndexOf(true);
  const joins = first > 0;
  const continues = last >= 0 && last < points.length - 1;
  const facts = [train.halts === null ? null : m.halts(train.halts), train.distanceKm === null ? null : m.distance(train.distanceKm)].filter(
    (fact): fact is string => fact !== null,
  );

  // The fold. `null` marks where the middle was taken out, so the list can draw one row saying so.
  const folds = points.length > FOLD_ABOVE && !expanded;
  const shown: readonly (Point | null)[] = folds ? [...points.slice(0, KEEP), null, ...points.slice(points.length - KEEP)] : points;
  const hidden = points.length - KEEP * 2;

  return (
    <div className={cn("relative", className)} onMouseEnter={show} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={m.label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onFocus={show}
        onClick={() => (open ? setOpen(false) : show())}
        className="press inline-flex h-8 w-8 cursor-pointer items-center justify-center border border-line text-ink-1/70 hover:bg-ink-1/7 hover:text-ink-1"
      >
        <RouteIcon />
      </button>
      {open ? (
        <div
          id={id}
          data-testid="train-run"
          className="popup-motion absolute right-0 top-full z-popover mt-1 w-max min-w-64 max-w-sm border border-line bg-surface-2 p-3 shadow-2"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="legend-sm text-ink-1/70">{run ? m.scheduled : m.label}</span>
            {phase === "loading" ? <span className="text-label text-ink-1/60">{m.loading}</span> : null}
          </div>
          <ol className="mt-2">
            {shown.map((point, i) =>
              point === null ? (
                <li key="fold" className="flex gap-2.5">
                  <span aria-hidden="true" className="relative flex w-2 shrink-0 flex-col items-center">
                    {/* A dashed gutter, so the run visibly continues through what is folded. */}
                    <span className="w-px flex-1 border-l border-dashed border-line" />
                  </span>
                  <span className="pb-2.5">
                    <button type="button" onClick={() => setExpanded(true)} className="press cursor-pointer text-label text-accent-text underline underline-offset-4">
                      {m.hiddenStops(hidden)}
                    </button>
                  </span>
                </li>
              ) : (
                <li key={`${point.code}-${i}`} className="flex gap-2.5">
                  <span aria-hidden="true" className="relative flex w-2 shrink-0 flex-col items-center">
                    <span className={cn("h-2 w-px", i === 0 ? "bg-transparent" : "bg-line")} />
                    <span className={cn("size-2 shrink-0 rounded-full border", point.mine ? "border-accent bg-accent" : "border-line-strong bg-surface-2")} />
                    <span className={cn("w-px flex-1", i === shown.length - 1 ? "bg-transparent" : "bg-line")} />
                  </span>
                  <span className={cn("flex min-w-0 flex-1 items-baseline gap-2 pb-2.5", point.mine ? "text-ink-1" : "text-ink-1/60")}>
                    <span className="font-data text-xs">{point.code}</span>
                    {point.name && point.name.toUpperCase() !== point.code.toUpperCase() ? <span className="truncate text-label">{point.name}</span> : null}
                    {/* The time a traveller reads is the one they act on: departure where there is
                        one, arrival at the terminus where there is not. */}
                    {point.departure ?? point.arrival ? (
                      <span className="ml-auto shrink-0 font-data text-2xs text-ink-1/60">{point.departure ?? point.arrival}</span>
                    ) : null}
                  </span>
                </li>
              ),
            )}
          </ol>
          <div className="text-label text-ink-1/70">
            {/* Said only when true. A train boarded at its origin needs no note, and one that ends
                where you get off is not carrying on anywhere. */}
            {joins ? <span className="text-ink-1">{m.boardsLater}. </span> : null}
            {continues ? `${m.carriesOn} ${points[points.length - 1]?.name ?? ""}. ` : null}
            {facts.join(" · ")}
          </div>
          {phase === "error" ? <div className="mt-1.5 text-label text-ink-1/70">{m.failed}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
