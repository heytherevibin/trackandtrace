import Link from "next/link";
import { IstClock } from "@/components/shell/ist-clock";
import { SourceStatusTable } from "@/components/source/source-status-table";
import { buttonClassName } from "@/components/ui/button";
import { Plate } from "@/components/ui/plate";
import { messages } from "@/messages";
import { BODY, H2, SectionKicker } from "./sheet-type";

/** 04 · Connected right now: the sources board, read from the real flags, with the IST clock and the policy link. */
export function SourcesBoard() {
  const m = messages.home.sources;
  return (
    <section id="sources" aria-labelledby="sources-title" className="section-pad">
      <SectionKicker rule="mb-6">{m.kicker}</SectionKicker>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[56ch]">
          <h2 id="sources-title" className={H2}>
            {m.title}
          </h2>
          <p className={`mt-3.5 ${BODY}`}>{m.lead}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* The drawn clock box is 44px: 20px figures on a 1.5 line inside 6px × 12px. */}
          <IstClock size="md" framed />
          <Link href="/accuracy" className={buttonClassName({ variant: "secondary" })}>
            {m.policy}
          </Link>
        </div>
      </div>
      <Plate as="div" padding="none" className="mt-8">
        <SourceStatusTable variant="board" />
      </Plate>
    </section>
  );
}
