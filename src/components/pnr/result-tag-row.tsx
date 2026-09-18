import { Badge } from "@/components/ui/badge";
import { messages } from "@/messages";
import type { PnrSource } from "@/types/domain";
import { formatPnr } from "@/utils/pnr";
import { sourceTagFor } from "./record-values";

/**
 * The terminal result's first line, as drawn: the filled status tag, the outline source tag
 * ("Sample data" for the fixture only), and the PNR at the right in 13px figures.
 */
export function ResultTagRow({ tag, source, pnr, status }: { readonly tag: string; readonly source: PnrSource; readonly pnr: string; readonly status?: string }) {
  const sourceTag = sourceTagFor(source);
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Badge variant="accent" data-status={status}>
        {tag}
      </Badge>
      {sourceTag === "sample" ? (
        <Badge variant="outline" title={messages.common.sampleDataHint}>
          {messages.common.sampleData}
        </Badge>
      ) : null}
      <span className="tnum ml-auto text-label text-ink-1/70">{messages.result.pnr(formatPnr(pnr))}</span>
    </div>
  );
}
