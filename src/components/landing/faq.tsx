import { messages } from "@/messages";
import { H2, SectionKicker } from "./sheet-type";

/** 08 · Questions: seven disclosure rows on hairlines, 820px wide. */
export function Faq() {
  const m = messages.home.faq;
  return (
    <section id="faq" aria-labelledby="faq-title" className="section-pad">
      <SectionKicker rule="mb-6">{m.kicker}</SectionKicker>
      <h2 id="faq-title" className={H2}>
        {m.title}
      </h2>
      <div className="mt-[28px] max-w-faq border-t border-line">
        {m.items.map((item) => (
          <details key={item.q} className="border-b border-line">
            <summary className="cursor-pointer list-outside px-1 py-4 font-display text-lg font-semibold leading-normal tracking-head">{item.q}</summary>
            <p className="max-w-[64ch] px-1 pb-5 text-body leading-6 text-ink-1/78">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
