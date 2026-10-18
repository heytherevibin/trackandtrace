import Link from "next/link";
import { IstClock } from "@/components/shell/ist-clock";
import { buttonClassName } from "@/components/ui/button";
import { messages } from "@/messages";
import type { ComponentState } from "@/services/service-status";
import { cn } from "@/utils/cn";
import { BODY, H2, SECTION, SectionKicker } from "./sheet-type";

/** 04 · Reliability: what every result promises, in one plate of three, and the status line (v4). */
export function ReliabilityBand({ checks }: { readonly checks: ComponentState }) {
  const m = messages.home.reliability;
  return (
    <section id="reliability" aria-labelledby="reliability-title" className={SECTION}>
      <SectionKicker>{m.kicker}</SectionKicker>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <h2 id="reliability-title" className={H2}>
          {m.title}
        </h2>
        <p className={`m-0 max-w-[44ch] ${BODY}`}>{m.lead}</p>
      </div>
      <dl className="blueprint mt-8 grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))]">
        {m.facts.map((fact, index) => (
          <div key={fact.legend} className={cn("min-w-0 px-4 py-6", index > 0 && "border-l-2 border-edge max-[608px]:border-l-0 max-[608px]:border-t-2")}>
            <dt className="legend text-link">{fact.legend}</dt>
            <dd className="m-0 mt-2">
              <span className="block font-display text-xl uppercase leading-7 wrap-break-word">{fact.title}</span>
              <span className={`mt-2 block ${BODY}`}>{fact.detail}</span>
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <p className="legend m-0 inline-flex flex-wrap items-center gap-2.5 text-ink-2">
          <span aria-hidden="true" className={cn("size-2 rounded-full border-2 border-edge", checks === "operational" ? "bg-lime" : "bg-red")} />
          <span>{messages.service.checksLine[checks]}</span>
          <span aria-hidden="true">·</span>
          <IstClock />
        </p>
        <Link href="/accuracy" className={buttonClassName({ variant: "secondary" })}>
          {m.policy}
        </Link>
      </div>
    </section>
  );
}
