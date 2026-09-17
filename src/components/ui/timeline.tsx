import { cn } from "@/utils/cn";

export type TimelineStepState = "done" | "current" | "pending" | "failed";

export interface TimelineStep {
  readonly id: string;
  readonly title: string;
  readonly detail?: string;
  readonly state: TimelineStepState;
}

const RING: Record<TimelineStepState, string> = {
  done: "border-accent bg-accent",
  current: "border-accent bg-accent-wash",
  pending: "border-line bg-transparent",
  failed: "border-ink-alert bg-transparent",
};

/** The request lifecycle as a vertical line of stops; filled stops are done, the hollow steel ring is where it waits. */
export function Timeline({ steps, label, className }: { readonly steps: readonly TimelineStep[]; readonly label: string; readonly className?: string }) {
  return (
    <ol className={cn("flex flex-col", className)} aria-label={label}>
      {steps.map((step, index) => (
        <li key={step.id} className="flex gap-3.5" aria-current={step.state === "current" ? "step" : undefined} data-state={step.state}>
          <span className="flex flex-col items-center" aria-hidden="true">
            <span className={cn("mt-1 size-3 shrink-0 rounded-full border", RING[step.state])} />
            {index < steps.length - 1 ? <span className="min-h-5 w-px flex-1 bg-line" /> : null}
          </span>
          <span className="min-w-0 pb-[18px]">
            <span className="block font-display text-base font-semibold uppercase tracking-head text-ink-1">{step.title}</span>
            {step.detail ? <span className={cn("mt-0.5 block text-label", step.state === "failed" ? "text-ink-alert" : "text-ink-3")}>{step.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
