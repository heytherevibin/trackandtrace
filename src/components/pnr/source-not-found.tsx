import { Plate } from "@/components/ui/plate";
import { messages } from "@/messages";
import { formatTime } from "@/utils/datetime";
import { ResultTagRow } from "./result-tag-row";

/** The source answered with no record: the terminal's not-found state, on the status plate. */
export function SourceNotFound({ pnr, sample, retrievedAt, className }: { readonly pnr: string; readonly sample: boolean; readonly retrievedAt: Date; readonly className?: string }) {
  const m = messages.result;
  const s = messages.states.notFound;
  return (
    <Plate title={m.status.legend} meta={[m.status.sheet]} cells="tight" role="status" aria-live="polite" className={className} bodyClassName="flex flex-col gap-3.5">
      <ResultTagRow tag={m.status.notFoundTag} sample={sample} pnr={pnr} status="NOT_FOUND" />
      <h2 className="font-display text-4xl font-semibold uppercase tracking-display">{s.title}</h2>
      <p className="text-sm text-ink-1/78">{s.detail}</p>
      <p className="text-label text-ink-1/70">{m.status.notFoundProvenance(formatTime(retrievedAt), sample ? m.sources.fixture : m.sources.live)}</p>
    </Plate>
  );
}
