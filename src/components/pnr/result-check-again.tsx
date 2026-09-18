import Link from "next/link";
import { buttonClassName } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Plate } from "@/components/ui/plate";
import { messages } from "@/messages";
import { PnrCheckForm } from "./pnr-check-form";

/**
 * A dead end that offers the check: the title block on the left, the live check
 * terminal on the right, laid out on the landing hero's grid.
 */
export function CheckAgainSheet({ title, detail, autoFocus = false }: { readonly title: string; readonly detail: string; readonly autoFocus?: boolean }) {
  const m = messages.states.notFoundPage;
  return (
    <section className="page-frame page-body">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-start gap-x-[clamp(24px,4vw,64px)] gap-y-12">
        <div className="min-w-0">
          <PageHeader title={title} lead={detail} />
          <div className="mt-[28px] flex flex-wrap gap-3">
            <Link href="/" className={buttonClassName({ variant: "secondary" })}>
              {m.home}
            </Link>
            <Link href="/watchlist" className={buttonClassName({ variant: "ghost" })}>
              {messages.shell.nav.watchlist}
            </Link>
          </div>
        </div>
        <Plate as="div" title={m.terminalTitle} meta={[m.terminalForm]} cells="regular">
          <PnrCheckForm id="pnr-notfound" autoFocus={autoFocus} />
        </Plate>
      </div>
    </section>
  );
}
