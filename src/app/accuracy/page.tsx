import type { Metadata } from "next";
import { SourceStatusTable } from "@/components/source/source-status-table";
import { Corners } from "@/components/ui/corners";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";

export const metadata: Metadata = { title: messages.accuracy.title };

// Transcribed from the Claude Design sheet "Accuracy B". Every figure is a real zero:
// nothing is verified or estimated until a source and its outcomes exist. Headings wrap
// "pretty" as the sheet's do (base.css balances h1–h4, which breaks lines differently).

/** Section kicker as drawn (13px steel capitals over a hairline); a heading for assistive tech. */
function Kicker({ id, children }: { readonly id: string; readonly children: string }) {
  return (
    <>
      <h2 id={id} className="kicker mb-3 block leading-normal text-pretty">
        {children}
      </h2>
      <hr className="mb-5 h-px border-0 bg-line" />
    </>
  );
}

export default function AccuracyPage() {
  const m = messages.accuracy;
  return (
    <section className="page-frame page-body">
      <div className="max-w-[60ch]">
        <h1 className="optical-hang text-page tracking-display text-pretty">{m.title}</h1>
        <p className="mt-3.5 text-base text-ink-1/78">{m.lead}</p>
      </div>

      <div className="blueprint mt-8 p-6" role="status">
        <Corners />
        <h2 className="text-3xl leading-[1.12] tracking-head text-pretty">{m.status.title}</h2>
        <p className="mt-2.5 max-w-[64ch] text-body text-ink-1/78">{m.status.detail}</p>
        <dl className="mt-[18px] grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3 border-t border-line pt-3.5">
          {m.status.facts.map((fact) => (
            <div key={fact.label}>
              <dt className="font-display text-2xs font-semibold uppercase leading-normal tracking-caps text-ink-1/70">{fact.label}</dt>
              <dd className="font-display text-2xl font-semibold leading-normal tracking-head tnum">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <section className="mt-[44px]" aria-labelledby="accuracy-connected">
        <Kicker id="accuracy-connected">{m.connected.kicker}</Kicker>
        <div className="blueprint">
          <Corners />
          <SourceStatusTable variant="ledger" />
        </div>
      </section>

      <section className="mt-[44px]" aria-labelledby="accuracy-evidence">
        <Kicker id="accuracy-evidence">{m.evidence.kicker}</Kicker>
        <dl className="blueprint">
          <Corners />
          {m.evidence.rows.map((row, index) => (
            <div key={row.legend} className={cn("grid grid-cols-[minmax(120px,180px)_1fr] gap-x-6 px-5 py-[18px]", index > 0 && "border-t border-line")}>
              <dt className="font-display text-label font-semibold uppercase leading-normal tracking-caps text-accent-text">{row.legend}</dt>
              <dd className="min-w-0">
                <span className="block font-display text-xl font-semibold uppercase leading-normal tracking-head">{row.title}</span>
                <span className="mt-1.5 block max-w-[64ch] text-sm leading-[22px] text-ink-1/74">{row.detail}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </section>
  );
}
