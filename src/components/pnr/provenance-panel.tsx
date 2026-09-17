import { Plate } from "@/components/ui/plate";
import { messages } from "@/messages";
import type { PnrSource } from "@/types/domain";
import { formatTime } from "@/utils/datetime";
import { formatPnr } from "@/utils/pnr";
import { LifecycleList } from "./result-lifecycle";

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
      <LifecycleList
        label={m.legend}
        stops={[
          { id: "input", title: m.steps.input, detail: m.details.input(formatPnr(pnr)), done: true },
          { id: "validate", title: m.steps.validate, detail: m.details.validate, done: true },
          { id: "source", title: m.steps.source, detail: m.details.source(messages.result.sourceNames[source], m.latency(latencyMs)), done: true },
          { id: "result", title: m.steps.result, detail: m.details.result(formatTime(checkedAt)), done: true },
        ]}
      />
      <p className="border-t border-line px-5 py-3 text-label leading-6 text-ink-1/70">{m.note}</p>
    </Plate>
  );
}
