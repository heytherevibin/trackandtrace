import { PageHeader } from "@/components/ui/page-header";
import { messages } from "@/messages";

export interface LegalSection {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

/** Plain-language legal page: anchored sections, an on-page index on wide screens, a comfortable measure. */
export function LegalDocument({ title, lead, sections }: { readonly title: string; readonly lead: string; readonly sections: readonly LegalSection[] }) {
  const m = messages.legal;
  return (
    <section className="mx-auto w-full max-w-page px-4 py-8 sm:px-6">
      <PageHeader title={title} lead={lead} meta={<span>{`${m.updatedLabel}: ${m.updated}`}</span>} />
      <div className="mt-12 grid gap-12 lg:grid-cols-[14rem_1fr]">
        <nav aria-label={m.onThisPage} className="hidden lg:block">
          <p className="silk">{m.onThisPage}</p>
          <ol className="sticky top-24 mt-3 flex flex-col gap-2 text-sm">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-ink-2 hover:text-ink-1">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <article className="max-w-prose">
          {sections.map((s) => (
            <section key={s.id} id={s.id} className="seam py-6 first:border-t-0 first:pt-0" aria-labelledby={`${s.id}-title`}>
              <h2 id={`${s.id}-title`} className="text-xl">
                {s.title}
              </h2>
              <p className="mt-3 text-ink-2">{s.body}</p>
            </section>
          ))}
          <p className="silk mt-8">{messages.common.notAffiliated}</p>
        </article>
      </div>
    </section>
  );
}
