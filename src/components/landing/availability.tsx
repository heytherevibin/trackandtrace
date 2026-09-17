import Link from "next/link";
import { RevealOnView } from "@/components/motion/reveal-on-view";
import { SourceStatusTable } from "@/components/source/source-status-table";
import { buttonClassName } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { messages } from "@/messages";

export function Availability() {
  const m = messages.home.availability;
  return (
    <section className="mx-auto w-full max-w-page px-4 py-16 sm:px-6" aria-labelledby="availability-title">
      <RevealOnView>
        <SectionHeader id="availability-title" title={m.title} description={m.lead} actions={<Link href="/accuracy" className={buttonClassName({ variant: "secondary", size: "sm" })}>{m.link}</Link>} />
        <div className="panel mt-8 overflow-hidden">
          <SourceStatusTable />
        </div>
      </RevealOnView>
    </section>
  );
}
