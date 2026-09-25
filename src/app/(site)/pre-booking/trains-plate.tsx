import { TrainRowView } from "./train-row";
import { Corners } from "@/components/ui/corners";
import { PLATE_TITLE_STACK, plateCellClass } from "@/components/ui/plate";
import { messages } from "@/messages";
import type { RouteAvailabilityAnswer } from "@/services/route-availability";
import type { SourceFailure } from "@/services/sources/outcome";
import { cn } from "@/utils/cn";

// The plate the route's trains sit in.
//
// Two things it must never do, and both are the same mistake in different clothes: render an empty
// list where a refusal belongs, and render an empty list where "no trains run this pair" belongs.
// A reader takes either for "there is nothing available", which is a third thing neither of them
// says. So a refusal returns before any list, and an empty answer says what it means in words.

const m = messages.booking.list;
const CELL = "font-display text-label font-semibold uppercase leading-6 tracking-caps";

export function TrainsPlate({
  answer,
  refusal,
  sampleData,
}: {
  readonly answer: RouteAvailabilityAnswer | null;
  readonly refusal: SourceFailure | null;
  readonly sampleData: boolean;
}) {
  return (
    <section className="blueprint mt-[28px]" aria-labelledby="tl02-trains">
      <Corners />
      <div className="flex flex-wrap items-stretch border-b border-line">
        <h2 id="tl02-trains" className={cn(CELL, "min-w-[14ch] flex-1 px-5 py-2.5 text-pretty", PLATE_TITLE_STACK)}>
          {m.title}
        </h2>
        {answer ? (
          <span className={cn(CELL, "whitespace-nowrap border-l border-line px-5 py-2.5 text-ink-1/70", plateCellClass(0))}>
            {m.count(answer.rows.length, answer.leadClass)}
          </span>
        ) : null}
        {/* A sample answer always says so — the product's rule everywhere an answer is shown. */}
        {sampleData ? (
          <span
            title={messages.common.sampleDataHint}
            className={cn(CELL, "whitespace-nowrap border-l border-line px-5 py-2.5 text-ink-1/70", plateCellClass(1))}
          >
            {messages.common.sampleData}
          </span>
        ) : null}
      </div>

      {refusal || !answer ? (
        <div className="px-5 py-4 text-sm text-ink-1/78">{refusal?.message ?? messages.source.availability.couldNotAnswer}</div>
      ) : answer.rows.length === 0 ? (
        <div className="px-5 py-4 text-sm text-ink-1/78">{messages.booking.route.none(answer.from, answer.to)}</div>
      ) : (
        answer.rows.map((row, i) => <TrainRowView key={row.train.trainNo} row={row} last={i === answer.rows.length - 1} />)
      )}
    </section>
  );
}
