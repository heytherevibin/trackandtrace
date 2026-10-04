import { Plate } from "@/components/ui/plate";
import type { LeadFigures } from "@/console/leads/leads";
import { consoleMessages } from "@/console/messages";
import { formatCount } from "@/utils/datetime";

const m = consoleMessages.leads.figures;

/**
 * The Lifecycle plate (ConsoleLeads.dc.html): six figures, not a funnel. Six across from `lg`, two
 * across on a phone as the phone board draws them. A lead is counted once per fact that is true of
 * it, and the line beneath says the one thing the figures invite getting wrong: News and Account
 * are separate.
 *
 * `null` is figures that could not be read. They are never drawn as zeroes.
 */
export function FiguresPlate({ figures }: { readonly figures: LeadFigures | null }) {
  if (figures === null) {
    return (
      <Plate as="section" title={m.title} titleId="ld-figures" headingLevel={2} padding="none">
        <p role="status" className="px-5 py-4 text-sm">
          {m.unavailable}
        </p>
      </Plate>
    );
  }
  const cells = [
    [m.pending, figures.pending],
    [m.subscribed, figures.subscribed],
    [m.unsubscribed, figures.unsubscribed],
    [m.suppressed, figures.suppressed],
    [m.accounts, figures.accounts],
    [m.availability, figures.availability],
  ] as const;
  return (
    <Plate as="section" title={m.title} titleId="ld-figures" headingLevel={2} padding="none" meta={[m.total(formatCount(figures.total))]}>
      {/* `justify-between`: where a label takes two lines its figure still sits on the row's own
          baseline, level with the rest. The cells' own right and bottom hairlines are the grid's rules; the outermost ones are
          tucked under the plate's edge, so the same markup rules a 6-across and a 2-across grid. */}
      <div className="overflow-hidden">
        <dl className="-mb-px -mr-px grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {cells.map(([label, value]) => (
            <div key={label} className="border-line flex flex-col justify-between gap-1 border-b border-r px-5 py-4 max-sm:px-4 max-sm:py-3.5">
              <dt className="legend max-sm:legend-sm">{label}</dt>
              {/* 32/36 as drawn. The phone board draws 26/30; 24px is the nearest step the type scale has. */}
              <dd className="font-display tnum text-5xl font-semibold leading-9 max-sm:text-3xl max-sm:leading-[30px]">{formatCount(value)}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="text-ink-2 border-line text-label border-t px-5 pb-3.5 pt-3 leading-5 max-sm:px-4">{m.note}</p>
    </Plate>
  );
}
