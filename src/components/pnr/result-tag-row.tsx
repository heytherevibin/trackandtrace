import { Badge } from "@/components/ui/badge";
import { messages } from "@/messages";
import { formatPnr } from "@/utils/pnr";

/**
 * The terminal result's first line, as drawn: the filled status tag, the outline
 * "Sample data" tag on fixture answers, and the PNR at the right in 13px figures.
 */
export function ResultTagRow({ tag, sample, pnr, status }: { readonly tag: string; readonly sample: boolean; readonly pnr: string; readonly status?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Badge variant="accent" data-status={status}>
        {tag}
      </Badge>
      {sample ? (
        <Badge variant="outline" title={messages.common.sampleDataHint}>
          {messages.common.sampleData}
        </Badge>
      ) : null}
      <span className="tnum ml-auto text-label text-ink-1/70">{messages.result.pnr(formatPnr(pnr))}</span>
    </div>
  );
}
