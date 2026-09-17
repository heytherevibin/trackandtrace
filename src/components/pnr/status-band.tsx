import { FactGrid } from "@/components/ui/fact-grid";
import { Plate } from "@/components/ui/plate";
import { messages } from "@/messages";
import type { PnrResult } from "@/types/domain";
import { formatTime } from "@/utils/datetime";
import { statusDescription, statusLabel } from "@/utils/status-tone";
import { ChartCountdown } from "./chart-countdown";
import { ResultTagRow } from "./result-tag-row";

/**
 * The status plate: the landing terminal's result state on its own sheet. Tag row,
 * 30px capital status, the plain description, the framed facts that decide the
 * journey, and the provenance line.
 */
export function StatusBand({ result, cached, className }: { readonly result: PnrResult; readonly cached: boolean; readonly className?: string }) {
  const m = messages.result;
  const s = result.snapshot;
  const label = statusLabel(result.lead.status, result.lead.position);
  const provenance = m.status.provenance(formatTime(result.checkedAt), m.sources[s.source]);
  return (
    <Plate
      title={m.status.legend}
      titleId="status-title"
      headingLevel={2}
      meta={[m.status.sheet]}
      cells="tight"
      className={className}
      bodyClassName="flex flex-col gap-3.5"
    >
      <ResultTagRow tag={label} sample={s.source === "fixture"} pnr={s.pnr} status={result.lead.status} />
      <p className="font-display text-4xl font-semibold uppercase tracking-display" data-testid="result-status">
        {label}
      </p>
      <p className="text-sm text-ink-1/78">{statusDescription(result.lead.status)}</p>
      <FactGrid
        framed
        items={[
          { label: m.facts.passengers, value: String(s.passengerCount) },
          { label: m.facts.quota, value: result.lead.quota },
          { label: m.facts.departs, value: m.facts.time(s.train.depTime) },
          { label: m.facts.chart, value: <ChartCountdown chartAt={s.chartAt} /> },
        ]}
      />
      <p className="text-label text-ink-1/70">{cached ? `${provenance} · ${m.status.cached}` : provenance}</p>
    </Plate>
  );
}
