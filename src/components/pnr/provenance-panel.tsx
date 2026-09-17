import { Panel } from "@/components/ui/panel";
import { Timeline } from "@/components/ui/timeline";
import { messages } from "@/messages";
import type { PnrSource } from "@/types/domain";
import { formatTime } from "@/utils/datetime";

/** The step sequence after a run: every lamp lit, the last one current. */
export function ProvenancePanel({ source, checkedAt, latencyMs }: { readonly source: PnrSource; readonly checkedAt: string; readonly latencyMs: number }) {
  const m = messages.result.provenance;
  const sourceName = source === "fixture" ? messages.result.sources.fixture : messages.result.sources.live;
  return (
    <Panel legend={m.legend} legendId="provenance-legend">
      <Timeline
        label={m.legend}
        steps={[
          { id: "input", title: m.steps.input, state: "done" },
          { id: "validate", title: m.steps.validate, state: "done" },
          { id: "source", title: m.steps.source, detail: `${sourceName} · ${m.latency(latencyMs)}`, state: "done" },
          { id: "result", title: m.steps.result, detail: `${formatTime(checkedAt)} ${messages.common.ist}`, state: "done" },
        ]}
      />
      <p className="seam mt-6 pt-4 text-xs text-ink-2">{m.note}</p>
    </Panel>
  );
}
