import type { Metadata } from "next";
import { SourceStatusTable } from "@/components/source/source-status-table";
import { Led } from "@/components/ui/led";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { messages } from "@/messages";

export const metadata: Metadata = { title: messages.accuracy.title };

export default function AccuracyPage() {
  const m = messages.accuracy;
  return (
    <section className="mx-auto flex w-full max-w-page flex-col gap-12 px-4 py-8 sm:px-6">
      <PageHeader title={m.title} lead={m.lead} />
      <UnavailableState title={m.unavailableTitle} detail={m.unavailableDetail} />
      <div>
        <SectionHeader id="connected-title" title={m.connectedTitle} />
        <div className="panel mt-6 overflow-hidden">
          <SourceStatusTable />
        </div>
      </div>
      <div>
        <SectionHeader id="evidence-title" title={m.evidence.title} />
        <dl className="panel mt-6 divide-y divide-line">
          {m.evidence.rows.map((row) => (
            <div key={row.legend} className="grid gap-3 p-6 sm:grid-cols-[10rem_1fr] sm:gap-8">
              <dt className="flex items-center gap-2 sm:items-start sm:pt-1">
                <Led tone="neutral" />
                <span className="silk">{row.legend}</span>
              </dt>
              <dd className="min-w-0">
                <p className="text-xl">{row.title}</p>
                <p className="mt-2 text-sm text-ink-2">{row.detail}</p>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
