import { Plate } from "@/components/ui/plate";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";

// v4 .prow: number, property, value and remark on one row; on a phone the remark drops under the property and value.
// Narrower than 20rem of the sheet's own width (a 280px phone, or text made larger), the value drops under the property.
const ROW =
  "grid grid-cols-[minmax(48px,64px)_minmax(160px,1.3fr)_minmax(96px,.6fr)_minmax(0,1.6fr)] items-center gap-x-4 gap-y-1 py-4 max-sm:grid-cols-[48px_minmax(0,1fr)_auto] @max-[20rem]:grid-cols-[48px_minmax(0,1fr)]";

/** Sheet 01: the operating principles as a datasheet — number, property, value, remark (v4, TT-100). */
export function PrinciplesSheet() {
  const m = messages.home.principles;
  return (
    <section id="principles" aria-label={m.label} className="pb-16 pt-4 max-sm:pb-8">
      <Plate as="div" title={m.title} meta={[m.code, m.sheet]} padding="none" corners={false} metaWraps>
        <div role="table" aria-label={m.label} className="@container">
          {m.rows.map((row, i) => (
            <div key={row.num} role="row" className={cn(ROW, i > 0 && "border-t-2 border-edge")}>
              <span role="cell" className="pl-[16px] font-figure text-xs leading-4 text-ink-3">
                {row.num}
              </span>
              <span role="cell" className="text-base font-medium leading-6 wrap-anywhere">
                {row.prop}
              </span>
              <span role="cell" className="whitespace-nowrap font-display text-3xl leading-8 max-sm:pr-4 @max-[20rem]:col-start-2">
                {row.val}
              </span>
              <span role="cell" className="min-w-0 pr-4 text-sm leading-5 text-ink-2 max-sm:col-[2/-1]">
                {row.rem}
              </span>
            </div>
          ))}
        </div>
        <p className="m-0 border-t-2 border-edge px-4 py-3 text-sm leading-5 text-ink-2">{m.note}</p>
      </Plate>
    </section>
  );
}
