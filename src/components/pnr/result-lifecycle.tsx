import { Plate } from "@/components/ui/plate";
import { Timeline } from "@/components/ui/timeline";
import { messages } from "@/messages";
import { formatPnr } from "@/utils/pnr";

/**
 * Under an unavailable result, as the Pre-booking sheet draws its lifecycle: the request
 * was entered and validated, the source stop stays a hollow ring, nothing is presented.
 */
export function UnavailableLifecycle({ pnr, className }: { readonly pnr: string; readonly className?: string }) {
  const m = messages.states.lifecycle;
  return (
    <Plate title={m.legend} titleId="lifecycle-title" headingLevel={2} cells="tight" padding="none" className={className}>
      <Timeline
        label={m.legend}
        className="p-5"
        steps={[
          { id: "input", title: m.steps.input, detail: m.details.input(formatPnr(pnr)), state: "done" },
          { id: "validate", title: m.steps.validate, detail: m.details.validate, state: "done" },
          { id: "source", title: m.steps.source, detail: m.details.source, state: "pending" },
          { id: "result", title: m.steps.result, detail: m.details.result, state: "pending" },
        ]}
      />
    </Plate>
  );
}
