import Link from "next/link";
import { PnrCheckForm } from "@/components/pnr/pnr-check-form";
import { buttonClassName } from "@/components/ui/button";
import { messages } from "@/messages";

export default function NotFound() {
  const m = messages.states.notFoundPage;
  return (
    <section className="mx-auto w-full max-w-page px-4 py-12 sm:px-6">
      <h1 className="text-3xl">{m.title}</h1>
      <p className="mt-2 text-ink-2">{m.detail}</p>
      <div className="panel mt-8 p-4 sm:p-6">
        <PnrCheckForm id="pnr-notfound" />
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/" className={buttonClassName({ variant: "secondary" })}>
          {m.home}
        </Link>
        <Link href="/watchlist" className={buttonClassName({ variant: "ghost" })}>
          {messages.shell.nav.watchlist}
        </Link>
      </div>
    </section>
  );
}
