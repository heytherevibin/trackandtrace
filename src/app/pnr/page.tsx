import type { Metadata } from "next";
import { PnrHashResult } from "@/components/pnr/pnr-hash-result";
import { messages } from "@/messages";
import { activePnrSource } from "@/services/env";
import { publicSourceOf } from "@/utils/source";

export const metadata: Metadata = { title: messages.result.pageTitle, robots: { index: false, follow: false } };

/** /pnr#<pnr>: the shell is static; the record is asked for in the browser, keyed by the hash. */
export default function PnrPage() {
  return (
    <section className="page-frame page-body">
      <noscript>
        <p className="mb-6 text-body text-ink-1/78">{messages.result.needsScript}</p>
      </noscript>
      <PnrHashResult source={publicSourceOf(activePnrSource())} />
    </section>
  );
}
