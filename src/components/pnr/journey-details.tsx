import { KeyValueList } from "@/components/ui/key-value-list";
import { Panel } from "@/components/ui/panel";
import { messages } from "@/messages";
import type { PnrSnapshot } from "@/types/domain";
import { formatCount } from "@/utils/datetime";

export function JourneyDetails({ snapshot }: { readonly snapshot: PnrSnapshot }) {
  const m = messages.result;
  const t = snapshot.train;
  return (
    <Panel legend={m.journey.legend} legendId="journey-legend">
      <KeyValueList
        items={[
          { label: m.facts.train, value: m.trainLine(t.number, t.name), numeric: true },
          { label: m.facts.route, value: `${t.from.city} (${t.from.code}) → ${t.to.city} (${t.to.code})` },
          { label: m.facts.journey, value: snapshot.journeyDateLabel, numeric: true },
          { label: m.facts.cls, value: snapshot.cls, numeric: true },
          { label: m.facts.departs, value: `${t.depTime} ${messages.common.ist}`, numeric: true },
          { label: m.facts.chart, value: `${snapshot.chartTime} ${messages.common.ist}`, numeric: true },
          { label: m.facts.distance, value: m.facts.km(formatCount(t.distanceKm)), numeric: true },
        ]}
      />
    </Panel>
  );
}
