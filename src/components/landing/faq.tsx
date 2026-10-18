import { messages } from "@/messages";
import { H2, SECTION, SectionKicker } from "./sheet-type";

/** 08 · Questions: seven disclosure rows, each with a yellow marker key (v4). */
export function Faq() {
  const m = messages.home.faq;
  return (
    <section id="faq" aria-labelledby="faq-title" className={`${SECTION} grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] items-start gap-x-16 gap-y-8`}>
      <div>
        <SectionKicker>{m.kicker}</SectionKicker>
        <h2 id="faq-title" className={H2}>
          {m.title}
        </h2>
      </div>
      <div className="border-t-2 border-edge">
        {m.items.map((item) => (
          <details key={item.q} className="faq-row border-b-2 border-edge">
            <summary className="faq-summary flex min-h-11 cursor-pointer list-none items-center gap-4 py-3 font-structure text-base font-bold leading-6">
              <span aria-hidden="true" className="faq-mark relative size-5 shrink-0 rounded-control border-2 border-edge bg-accent" />
              <span className="min-w-0 wrap-anywhere">{item.q}</span>
            </summary>
            <p className="m-0 max-w-[60ch] pb-4 pl-[36px] text-sm leading-5 text-ink-2">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
