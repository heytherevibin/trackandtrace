import { Corners } from "@/components/ui/corners";
import { messages } from "@/messages";

export interface LegalSection {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

/** "01", "02", … as the sheets number their sections. */
const sectionNumber = (index: number): string => String(index + 1).padStart(2, "0");

/**
 * Privacy and Terms, built from the B sheets' grammar (neither page is drawn): the 60ch title
 * block with a legend meta line, an "On this page" plate that sticks on wide screens, and
 * numbered sections (steel kicker over a hairline, 22px capital heading, 15/24 body copy).
 */
export function LegalDocument({ title, lead, sections }: { readonly title: string; readonly lead: string; readonly sections: readonly LegalSection[] }) {
  const m = messages.legal;
  return (
    <section className="page-frame page-body">
      <div className="max-w-[60ch]">
        <h1 className="optical-hang text-page tracking-display text-pretty">{title}</h1>
        <p className="mt-3.5 text-base text-ink-1/78">{lead}</p>
        <p className="legend mt-3 leading-normal">{m.updatedLine(m.updated)}</p>
      </div>
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:gap-x-16">
        <nav aria-label={m.onThisPage} className="blueprint lg:sticky lg:top-24">
          <Corners />
          <div className="flex flex-wrap items-stretch border-b border-line">
            <span className="min-w-[14ch] flex-1 px-5 py-2.5 font-display text-label font-semibold uppercase leading-6 tracking-caps">{m.onThisPage}</span>
          </div>
          <ol className="flex flex-col gap-2.5 p-5">
            {sections.map((s, index) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="flex items-baseline gap-3 text-sm text-ink-1/78 no-underline hover:text-accent-text">
                  <span aria-hidden="true" className="font-display text-label font-semibold tracking-caps text-accent-text tnum">
                    {sectionNumber(index)}
                  </span>
                  <span>{s.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <article className="min-w-0">
          {sections.map((s, index) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className={index > 0 ? "mt-10" : undefined}>
              <span aria-hidden="true" className="kicker mb-3 block leading-normal tnum">
                {sectionNumber(index)}
              </span>
              <hr className="mb-3 h-px border-0 bg-line" />
              <h2 id={`${s.id}-title`} className="text-2xl tracking-head text-pretty">
                {s.title}
              </h2>
              <p className="mt-2.5 max-w-[64ch] text-body text-ink-1/78">{s.body}</p>
            </section>
          ))}
          <p className="mt-12 border-t border-line pt-3 text-label leading-6 text-ink-1/70">{messages.common.notAffiliated}</p>
        </article>
      </div>
    </section>
  );
}
