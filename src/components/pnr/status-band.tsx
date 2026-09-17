import { Badge } from "@/components/ui/badge";
import { KeyValueList } from "@/components/ui/key-value-list";
import { StatusPill } from "@/components/ui/status-pill";
import { messages } from "@/messages";
import type { PnrResult } from "@/types/domain";
import type { Tone } from "@/types/ui";
import { cn } from "@/utils/cn";
import { formatTime } from "@/utils/datetime";
import { statusDescription, statusLabel, toneForStatus } from "@/utils/status-tone";
import { ChartCountdown } from "./chart-countdown";

const TINT: Record<Tone, string> = {
  go: "bg-go-bg border-go-line",
  watch: "bg-watch-bg border-watch-line",
  stop: "bg-stop-bg border-stop-line",
  neutral: "bg-neutral-bg border-neutral-line",
};

/** The readout cluster: the lamp, the status word, and the facts that decide the journey. */
export function StatusBand({ result, cached }: { readonly result: PnrResult; readonly cached: boolean }) {
  const m = messages.result;
  const s = result.snapshot;
  const tone = toneForStatus(result.lead.status);
  const sourceName = s.source === "fixture" ? m.sources.fixture : m.sources.live;
  return (
    <section className={cn("panel overflow-hidden border", TINT[tone])} aria-labelledby="status-band-title">
      <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.2fr_1fr] lg:gap-8">
        <div>
          <h2 id="status-band-title" className="silk">
            {m.band.legend}
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <StatusPill status={result.lead.status} position={result.lead.position} live />
            {s.source === "fixture" ? (
              <Badge tone="watch" variant="outline" title={messages.common.sampleDataHint}>
                {messages.common.sampleData}
              </Badge>
            ) : null}
          </div>
          <p className="mt-4 font-display text-3xl font-bold leading-tight sm:text-4xl" data-testid="result-status">
            {statusLabel(result.lead.status, result.lead.position)}
          </p>
          <p className="mt-3 max-w-prose text-ink-2">{statusDescription(result.lead.status)}</p>
          <p className="silk mt-6 text-ink-3">
            {m.band.retrieved(formatTime(result.checkedAt), sourceName)}
            {cached ? ` · ${m.band.cached}` : ""}
          </p>
        </div>
        <div className="seam pt-6 lg:border-l lg:border-t-0 lg:border-line lg:pl-8 lg:pt-0">
          <KeyValueList
            items={[
              { label: m.facts.passengers, value: String(s.passengerCount), numeric: true },
              { label: m.facts.quota, value: result.lead.quota, numeric: true },
              { label: m.facts.departs, value: `${s.train.depTime} ${messages.common.ist}`, numeric: true },
              { label: m.facts.chart, value: <ChartCountdown chartAt={s.chartAt} /> },
            ]}
          />
        </div>
      </div>
    </section>
  );
}
