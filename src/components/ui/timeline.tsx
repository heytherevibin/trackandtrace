import type { Tone } from "@/types/ui";
import { cn } from "@/utils/cn";
import { Led } from "./led";

export type TimelineStepState = "done" | "current" | "pending" | "failed";

export interface TimelineStep {
  readonly id: string;
  readonly title: string;
  readonly detail?: string;
  readonly state: TimelineStepState;
}

const TONE: Record<TimelineStepState, { tone: Tone | "key"; lit: boolean }> = {
  done: { tone: "go", lit: true },
  current: { tone: "key", lit: true },
  pending: { tone: "neutral", lit: false },
  failed: { tone: "stop", lit: true },
};

/** The step sequence: one lamp per stage, the lit one is where the request stopped. */
export function Timeline({ steps, label, className }: { readonly steps: readonly TimelineStep[]; readonly label: string; readonly className?: string }) {
  return (
    <ol className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4", className)} aria-label={label}>
      {steps.map((step, index) => {
        const { tone, lit } = TONE[step.state];
        return (
          <li key={step.id} className="rounded-md border border-line bg-surface-2 p-3" aria-current={step.state === "current" ? "step" : undefined} data-state={step.state}>
            <div className="flex items-center gap-2">
              <Led tone={tone} lit={lit} />
              <span className="silk">{String(index + 1).padStart(2, "0")}</span>
            </div>
            <p className="mt-2 text-sm font-medium text-ink-1">{step.title}</p>
            {step.detail ? <p className="mt-1 text-xs text-ink-2">{step.detail}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
