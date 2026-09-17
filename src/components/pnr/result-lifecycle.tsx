import { Plate } from "@/components/ui/plate";
import { messages } from "@/messages";
import { formatPnr } from "@/utils/pnr";

export interface LifecycleStop {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly done: boolean;
}

/**
 * The request lifecycle exactly as the Pre-booking sheet draws it: a 12px stop
 * (steel when done, a hairline ring otherwise) on a hairline stem, a 16px capital
 * title, a 13px detail at 70%. Composed here rather than through <Timeline> because
 * cn() currently drops `text-label` when a colour class follows it.
 */
export function LifecycleList({ label, stops }: { readonly label: string; readonly stops: readonly LifecycleStop[] }) {
  return (
    <ol className="m-0 flex list-none flex-col p-5" aria-label={label}>
      {stops.map((stop, index) => (
        <li key={stop.id} className="flex gap-3.5" data-state={stop.done ? "done" : "pending"}>
          <span className="flex flex-col items-center" aria-hidden="true">
            <span className={stop.done ? "mt-1 size-3 rounded-full border border-accent bg-accent" : "mt-1 size-3 rounded-full border border-line bg-transparent"} />
            {index < stops.length - 1 ? <span className="min-h-5 w-px flex-1 bg-line" /> : null}
          </span>
          <span className="pb-[18px]">
            <span className="block font-display text-base leading-6 font-semibold uppercase tracking-head">{stop.title}</span>
            <span className="mt-0.5 block text-label text-ink-1/70">{stop.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Under an unavailable result: the lifecycle stops at the source and nothing is presented. */
export function UnavailableLifecycle({ pnr, className }: { readonly pnr: string; readonly className?: string }) {
  const m = messages.states.lifecycle;
  return (
    <Plate title={m.legend} titleId="lifecycle-title" headingLevel={2} cells="tight" padding="none" className={className}>
      <LifecycleList
        label={m.legend}
        stops={[
          { id: "input", title: m.steps.input, detail: m.details.input(formatPnr(pnr)), done: true },
          { id: "validate", title: m.steps.validate, detail: m.details.validate, done: true },
          { id: "source", title: m.steps.source, detail: m.details.source, done: false },
          { id: "result", title: m.steps.result, detail: m.details.result, done: false },
        ]}
      />
    </Plate>
  );
}
