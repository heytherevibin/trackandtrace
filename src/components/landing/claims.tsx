import { RevealOnView } from "@/components/motion/reveal-on-view";
import { Led } from "@/components/ui/led";
import { SectionHeader } from "@/components/ui/section-header";
import { messages } from "@/messages";

/** The three claims as legend rows on one plate, the way a panel prints its settings. */
export function Claims() {
  const m = messages.home.claims;
  return (
    <section className="mx-auto w-full max-w-page px-4 py-16 sm:px-6" aria-labelledby="claims-title">
      <RevealOnView>
        <SectionHeader id="claims-title" title={m.title} />
        <dl className="panel mt-8 divide-y divide-line">
          {m.rows.map((row) => (
            <div key={row.legend} className="grid gap-3 p-6 sm:grid-cols-[8rem_1fr] sm:gap-8">
              <dt className="flex items-center gap-2 sm:items-start sm:pt-1">
                <Led tone="go" lit />
                <span className="silk">{row.legend}</span>
              </dt>
              <dd className="min-w-0">
                <p className="text-xl">{row.title}</p>
                <p className="mt-2 text-sm text-ink-2">{row.detail}</p>
              </dd>
            </div>
          ))}
        </dl>
      </RevealOnView>
    </section>
  );
}
