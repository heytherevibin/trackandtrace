import Link from "next/link";
import { IstClock } from "@/components/shell/ist-clock";
import { buttonClassName } from "@/components/ui/button";
import { Corners } from "@/components/ui/corners";
import { Led } from "@/components/ui/led";
import { messages } from "@/messages";
import type { ComponentState } from "@/services/service-status";
import { BODY, H2, SectionKicker } from "./sheet-type";

/**
 * 04 · Reliability: what every result promises, in three plates, and one status line. It replaces the
 * sources board: travellers see what the service guarantees, never how it is wired.
 */
export function ReliabilityBand({ checks }: { readonly checks: ComponentState }) {
  const m = messages.home.reliability;
  return (
    <section id="reliability" aria-labelledby="reliability-title" className="section-pad">
      <SectionKicker rule="mb-6">{m.kicker}</SectionKicker>
      <div className="max-w-[56ch]">
        <h2 id="reliability-title" className={H2}>
          {m.title}
        </h2>
        <p className={`mt-3.5 ${BODY}`}>{m.lead}</p>
      </div>
      <dl className="blueprint mt-8 grid grid-cols-1 md:grid-cols-3">
        <Corners />
        {m.facts.map((fact, index) => (
          <div key={fact.legend} className={`min-w-0 px-5 py-[18px] ${index > 0 ? "border-t border-line md:border-t-0 md:border-l" : ""}`}>
            <dt className="font-display text-label font-semibold uppercase leading-normal tracking-caps text-accent-text">{fact.legend}</dt>
            <dd className="mt-2">
              <span className="block font-display text-xl font-semibold leading-snug tracking-head">{fact.title}</span>
              <span className="mt-1.5 block text-sm leading-[22px] text-ink-1/74">{fact.detail}</span>
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <p className="m-0 inline-flex items-center gap-2.5 font-display text-label font-semibold uppercase tracking-caps text-ink-1/78">
          <Led lit={checks === "operational"} size="sm" />
          <span>{messages.service.checksLine[checks]}</span>
          <span aria-hidden="true" className="text-ink-1/40">·</span>
          <IstClock />
        </p>
        <Link href="/accuracy" className={buttonClassName({ variant: "secondary" })}>
          {m.policy}
        </Link>
      </div>
    </section>
  );
}
