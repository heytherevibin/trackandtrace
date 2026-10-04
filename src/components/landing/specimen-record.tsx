import { SampleTag, SheetTag } from "@/components/pnr/pnr-terminal-tags";
import { Plate } from "@/components/ui/plate";
import { STACKED_ROLES as R, stackedTable } from "@/components/ui/stacked-table";
import { messages } from "@/messages";
import { BerthPlan } from "./journey/berth-plan";
import type { Specimen } from "./specimen-data";
import { BODY, H2, SectionKicker, TABLE_HEAD } from "./sheet-type";

const S = stackedTable("sm");
// A stacked passenger row's three labelled values stand side by side, but in one column where the plate's body is under
// 8rem (its own container, below sm only, as the board's in journey.css): only text grown against the width (200% in a
// 280px window), never at 100% (12rem there).
// A cell's side padding is 12px and the plate's 20px, as drawn, and neither grows with the text: at 200% in a 640px
// window the four columns need every pixel of the plate, and padding that doubled ran the table 29px past the window.
const TH = `border-b border-line px-[12px] py-2 text-left ${TABLE_HEAD}`;
const TD = `border-b border-line px-[12px] py-2 ${S.cell}`;

/** 03 · The record you get: the copy on the left, Sheet 02's specimen record on the right. */
export function SpecimenRecord({ specimen }: { readonly specimen: Specimen | null }) {
  const m = messages.home.record;
  const p = messages.check.result.passengers;
  return (
    <section id="record" aria-labelledby="record-title" className="section-pad">
      <SectionKicker rule="mb-6">{m.kicker}</SectionKicker>
      {/* Two columns where each has 23.75rem (380px as drawn); in rem, so with its text at 200% the record's four-column
          table gets the whole width instead of running past the window beside the words. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,23.75rem),1fr))] items-start gap-x-[clamp(24px,4vw,64px)] gap-y-8">
        <div className="min-w-0">
          <h2 id="record-title" className={H2}>
            {m.title}
          </h2>
          <p className={`mt-5 max-w-[48ch] ${BODY}`}>{m.bodyOne}</p>
          <p className={`mt-4 max-w-[48ch] ${BODY}`}>{m.bodyTwo}</p>
          <BerthPlan seats={specimen?.seats ?? null} />
        </div>
        <Plate as="div" title={m.plateTitle} meta={[m.plateSheet]} cells="tight" padding="none" bodyClassName="max-sm:@container flex flex-col gap-3 px-[20px] py-[18px]">
          {specimen ? (
            <>
              <div className="flex flex-wrap items-center gap-2.5">
                <SheetTag variant="accent" wrap>
                  {specimen.leadTag}
                </SheetTag>
                <SampleTag />
              </div>
              <p className="font-display text-xl font-semibold uppercase leading-normal tracking-head tnum">{specimen.trainLine}</p>
              <p className="text-sm leading-normal text-ink-1/74 tnum">{specimen.journeyLine}</p>
              <table role={R.table} className={`w-full border-collapse border border-line text-sm leading-normal ${S.table}`}>
                <caption className="sr-only">{m.caption}</caption>
                <thead role={R.rowgroup} className={S.head}>
                  <tr role={R.row}>
                    <th role={R.columnheader} scope="col" className={TH}>
                      {p.passenger}
                    </th>
                    <th role={R.columnheader} scope="col" className={TH}>
                      {p.booked}
                    </th>
                    <th role={R.columnheader} scope="col" className={TH}>
                      {p.current}
                    </th>
                    <th role={R.columnheader} scope="col" className={TH}>
                      {p.allocation}
                    </th>
                  </tr>
                </thead>
                <tbody role={R.rowgroup} className={S.body}>
                  {specimen.pax.map((row) => (
                    <tr key={row.key} role={R.row} className={`${S.row} max-sm:grid-cols-3 @max-[8rem]:grid-cols-1 max-sm:px-3.5 max-sm:py-3`}>
                      <td role={R.cell} className={`${TD} ${S.wide} max-sm:font-semibold`}>
                        {row.name}
                      </td>
                      <td role={R.cell} data-label={p.booked} className={`${TD} text-ink-1/70 tnum`}>
                        {row.booked}
                      </td>
                      <td role={R.cell} data-label={p.current} className={`${TD} font-semibold tnum`}>
                        {row.current}
                      </td>
                      <td role={R.cell} data-label={p.allocation} className={`${TD} tnum`}>
                        {row.alloc}
                      </td>
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
