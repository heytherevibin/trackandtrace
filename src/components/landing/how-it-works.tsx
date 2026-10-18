import { messages } from "@/messages";
import { BODY, H2, H3, SECTION, SectionKicker } from "./sheet-type";

/** 02 · How it works: three stops on one line — Origin, En route, Terminus (v4). */
export function HowItWorks() {
  const m = messages.home.how;
  return (
    <section id="how" aria-labelledby="how-title" className={SECTION}>
      <SectionKicker>{m.kicker}</SectionKicker>
      <h2 id="how-title" className={H2}>
        {m.title}
      </h2>
      {/* In px throughout, so the stops sit on the line's ends whatever the text size. */}
      <div aria-hidden="true" className="relative mt-8 h-[24px]">
        <div className="absolute inset-x-0 top-[11px] h-[2px] bg-edge" />
        <span className="absolute left-0 top-[4px] size-[16px] rounded-full border-2 border-edge bg-accent" />
        <span className="absolute left-[calc(50%-8px)] top-[4px] size-[16px] rounded-full border-2 border-edge bg-accent" />
        <span className="absolute left-[calc(100%-16px)] top-[4px] size-[16px] rounded-full border-2 border-edge bg-accent" />
      </div>
      <ol className="m-0 mt-6 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-6 p-0">
        {m.steps.map((step) => (
          <li key={step.num} className="min-w-0">
            <span className="legend text-link">{m.stepLabel(step.num, step.kicker)}</span>
            <h3 className={`mt-2 ${H3}`}>{step.title}</h3>
            <p className={`m-0 mt-2 ${BODY}`}>{step.detail}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
