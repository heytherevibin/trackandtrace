import { Plate } from "@/components/ui/plate";
import { messages } from "@/messages";
import { ROW_NUM } from "./sheet-type";

// The drawn four-column row needs about 550px before the remark column has room; below
// sm the same cells keep their type and padding, and the remark drops under the property.
const ROW =
  "grid grid-cols-[minmax(48px,56px)_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 sm:grid-cols-[minmax(60px,72px)_minmax(160px,1.3fr)_minmax(120px,.8fr)_minmax(0,1.6fr)] sm:gap-y-0";

/** Sheet 01: the operating principles as a datasheet — number, property, value, remark. */
export function PrinciplesSheet() {
  const m = messages.home.principles;
  return (
    <section aria-label={m.label} className="pb-[60px] pt-6">
      <Plate as="div" title={m.title} meta={[m.code, m.sheet]} cells="wide" padding="none">
        <div role="table" aria-label={m.label}>
          {m.rows.map((row, i) => (
            <div
              key={row.num}
              role="row"
              className={`${ROW} ${i > 0 ? "border-t border-line" : ""}`}
            >
              <span role="cell" className={`pl-6 ${ROW_NUM}`}>
                {row.num}
              </span>
              <span role="cell" className="text-body leading-normal">
                {row.prop}
              </span>
              <span role="cell" className="whitespace-nowrap pr-6 font-display text-2xl font-semibold leading-normal tracking-head tnum sm:pr-0">
                {row.val}
              </span>
              <span role="cell" className="col-span-2 col-start-2 pr-6 text-sm leading-normal text-ink-1/74 sm:col-span-1 sm:col-start-auto">
                {row.rem}
              </span>
            </div>
          ))}
        </div>
        <p className="border-t border-line px-6 py-3 text-label leading-6 text-ink-1/70">{m.note}</p>
      </Plate>
    </section>
  );
}
