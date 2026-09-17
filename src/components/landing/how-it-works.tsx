import { RevealOnView } from "@/components/motion/reveal-on-view";
import { Led } from "@/components/ui/led";
import { SectionHeader } from "@/components/ui/section-header";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";

/** The check as a journey: three stations on one line, the last one the terminus. */
export function HowItWorks() {
  const m = messages.home.how;
  return (
    <section className="mx-auto w-full max-w-page px-4 py-16 sm:px-6" aria-labelledby="how-title">
      <RevealOnView>
        <SectionHeader id="how-title" title={m.title} />
        <ol className="mt-8 flex flex-col sm:flex-row sm:gap-0">
          {m.steps.map((step, i) => {
            const last = i === m.steps.length - 1;
            return (
              <li key={step.title} className="flex gap-4 sm:flex-1 sm:flex-col sm:gap-0">
                <div className="flex flex-col items-center sm:w-full sm:flex-row">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line-strong bg-key-cap shadow-1">
                    <Led tone="key" lit />
                  </span>
                  {!last ? <span aria-hidden="true" className="track-v my-1 w-2 flex-1 sm:track-h sm:mx-1 sm:my-0 sm:h-2 sm:w-auto" /> : <span aria-hidden="true" className="hidden h-6 w-1 rounded-sm bg-line-strong sm:ml-1 sm:block" />}
                </div>
                <div className={cn("min-w-0 pb-8 sm:pb-0 sm:pt-4", !last && "sm:pr-8")}>
                  <span className="silk text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="mt-1 text-xl">{step.title}</h3>
                  <p className="mt-2 max-w-narrow text-sm text-ink-2">{step.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </RevealOnView>
    </section>
  );
}
