import { Plate } from "@/components/ui/plate";
import { messages } from "@/messages";
import type { PnrSource } from "@/types/domain";
import { formatTime } from "@/utils/datetime";
import { ResultTagRow } from "./result-tag-row";
import { publicSourceOf } from "@/utils/source";

/** The source answered with no record: the terminal's not-found state, on the status plate, labelled by its source. */
export function SourceNotFound({ pnr, source, retrievedAt, className }: { readonly pnr: string; readonly source: PnrSource; readonly retrievedAt: Date; readonly className?: string }) {
  const m = messages.result;
  const s = messages.states.notFound;
  return (
    <Plate title={m.status.legend} meta={[m.status.sheet]} cells="tight" role="status" aria-live="polite" className={className} bodyClassName="flex flex-col gap-3.5">
      <ResultTagRow tag={m.status.notFoundTag} source={source} pnr={pnr} status="NOT_FOUND" />
      <h2 className="font-display text-4xl font-semibold uppercase tracking-display">{s.title}</h2>
      <p className="text-sm text-ink-1/78">{s.detail}</p>
      <p className="text-label text-ink-1/70">{m.status.notFoundProvenance(formatTime(retrievedAt), m.sources[publicSourceOf(source)])}</p>
    </Plate>
  );
}
