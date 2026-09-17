import { Plate } from "@/components/ui/plate";
import { Timeline } from "@/components/ui/timeline";
import { messages } from "@/messages";
import type { PnrSource } from "@/types/domain";
import { formatTime } from "@/utils/datetime";
import { formatPnr } from "@/utils/pnr";

/** The request lifecycle as the Pre-booking sheet draws it, every stop done, closed by the data-policy note. */
export function ProvenancePanel({
  pnr,
  source,
  checkedAt,
  latencyMs,
  className,
}: {
  readonly pnr: string;
  readonly source: PnrSource;
  readonly checkedAt: string;
  readonly latencyMs: number;
  readonly className?: string;
}) {
  const m = messages.result.provenance;
  return (
    <Plate title={m.legend} titleId="provenance-title" headingLevel={2} cells="tight" padding="none" className={className}>
      <Timeline
        label={m.legend}
        className="p-5"
        steps={[
          { id: "input", title: m.steps.input, detail: m.details.input(formatPnr(pnr)), state: "done" },
          { id: "validate", title: m.steps.validate, detail: m.details.validate, state: "done" },
          { id: "source", title: m.steps.source, detail: m.details.source(messages.result.sourceNames[source], m.latency(latencyMs)), state: "done" },
          { id: "result", title: m.steps.result, detail: m.details.result(formatTime(checkedAt)), state: "done" },
        ]}
      />
      <p className="border-t border-line px-5 py-3 text-label leading-6 text-ink-1/70">{m.note}</p>
    </Plate>
  );
}
