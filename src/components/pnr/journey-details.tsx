import { FactGrid } from "@/components/ui/fact-grid";
import { Plate } from "@/components/ui/plate";
import { messages } from "@/messages";
import type { PnrSnapshot, Quota } from "@/types/domain";
import { chartValue, distanceValue, timeValue } from "./record-values";

/**
 * The journey record as the terminal frames its facts: legend over figure in hairline
 * cells. Eight facts on two columns, so every row of the frame closes at any width.
 */
export function JourneyDetails({ snapshot, quota, className }: { readonly snapshot: PnrSnapshot; readonly quota: Quota; readonly className?: string }) {
  const m = messages.result;
  const t = snapshot.train;
  return (
    <Plate title={m.journey.legend} titleId="journey-title" headingLevel={2} cells="tight" className={className}>
      <FactGrid
        framed
        className="grid-cols-2"
        items={[
          { label: m.facts.train, value: m.trainLine(t.number, t.name) },
          { label: m.facts.route, value: m.facts.routeStops(t.from.city, t.from.code, t.to.city, t.to.code) },
          { label: m.facts.journey, value: snapshot.journeyDateLabel },
          { label: m.facts.cls, value: snapshot.cls },
          { label: m.facts.quota, value: quota },
          { label: m.facts.distance, value: distanceValue(t.distanceKm) },
          { label: m.facts.departs, value: timeValue(t.depTime) },
          { label: m.facts.chart, value: chartValue(snapshot) },
        ]}
      />
    </Plate>
  );
}
