import { messages } from "@/messages";
import { BODY, H2, H3, SectionKicker } from "./sheet-type";

// The route line: twin rails with sleepers and three stops at origin, midway, and terminus.
const STOPS = ["left-0", "left-[calc(50%-8px)]", "left-[calc(100%-16px)]"] as const;

/** 02 · How it works: the check drawn as a route with three stops. */
export function HowItWorks() {
  const m = messages.home.how;
  return (
    <section id="how" aria-labelledby="how-title" className="section-pad">
      <SectionKicker rule="mb-3">{m.kicker}</SectionKicker>
      <h2 id="how-title" className={H2}>
        {m.title}
      </h2>
      <div aria-hidden="true" className="relative mt-[44px] h-6">
        <div className="rail absolute inset-x-0 top-1.5 h-3" />
        {STOPS.map((left) => (
          <span key={left} className={`absolute top-1 flex size-4 items-center justify-center rounded-full border border-accent-text bg-surface-0 ${left}`}>
            <span className="size-1.5 rounded-full bg-accent" />
          </span>
        ))}
      </div>
      <ol className="mt-5 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-x-[clamp(20px,3vw,48px)] gap-y-8 p-0">
        {m.steps.map((step) => (
          <li key={step.num} className="min-w-0">
            <span className="font-display text-label font-semibold uppercase leading-normal tracking-caps text-accent-text tnum">{m.stepLabel(step.num, step.kicker)}</span>
            <h3 className={`mt-2 ${H3}`}>{step.title}</h3>
            <p className={`mt-2.5 ${BODY}`}>{step.detail}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
