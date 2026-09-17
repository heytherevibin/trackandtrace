import { SampleTag, SheetTag } from "@/components/pnr/pnr-terminal-tags";
import { Plate } from "@/components/ui/plate";
import { messages } from "@/messages";
import type { Specimen } from "./specimen-data";
import { BODY, H2, SectionKicker, TABLE_HEAD } from "./sheet-type";

const TH = `border-b border-line px-3 py-2 text-left ${TABLE_HEAD}`;
const TD = "border-b border-line px-3 py-2";

/** 03 · The record you get: the copy on the left, Sheet 02's specimen record on the right. */
export function SpecimenRecord({ specimen }: { readonly specimen: Specimen | null }) {
  const m = messages.home.record;
  const p = messages.check.result.passengers;
  return (
    <section id="record" aria-labelledby="record-title" className="section-pad">
      <SectionKicker rule="mb-6">{m.kicker}</SectionKicker>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-start gap-x-[clamp(24px,4vw,64px)] gap-y-8">
        <div className="min-w-0">
          <h2 id="record-title" className={H2}>
            {m.title}
          </h2>
          <p className={`mt-5 max-w-[48ch] ${BODY}`}>{m.bodyOne}</p>
          <p className={`mt-4 max-w-[48ch] ${BODY}`}>{m.bodyTwo}</p>
        </div>
        <Plate as="div" title={m.plateTitle} meta={[m.plateSheet]} cells="tight" padding="none" bodyClassName="flex flex-col gap-3 px-5 py-[18px]">
          {specimen ? (
            <>
              <div className="flex flex-wrap items-center gap-2.5">
                <SheetTag variant="accent">{specimen.leadTag}</SheetTag>
                <SampleTag />
              </div>
              <p className="font-display text-xl font-semibold uppercase leading-normal tracking-head tnum">{specimen.trainLine}</p>
              <p className="text-sm leading-normal text-ink-1/74 tnum">{specimen.journeyLine}</p>
              <table className="w-full border-collapse border border-line text-sm leading-normal">
                <caption className="sr-only">{m.caption}</caption>
                <thead>
                  <tr>
                    <th scope="col" className={TH}>
                      {p.passenger}
                    </th>
                    <th scope="col" className={TH}>
                      {p.booked}
                    </th>
                    <th scope="col" className={TH}>
                      {p.current}
                    </th>
                    <th scope="col" className={TH}>
                      {p.allocation}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {specimen.pax.map((row) => (
                    <tr key={row.key}>
                      <td className={TD}>{row.name}</td>
                      <td className={`${TD} text-ink-1/70 tnum`}>{row.booked}</td>
                      <td className={`${TD} font-semibold tnum`}>{row.current}</td>
                      <td className={`${TD} tnum`}>{row.alloc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-label leading-normal text-ink-1/70">{specimen.provenance}</p>
            </>
          ) : null}
        </Plate>
      </div>
    </section>
  );
}
