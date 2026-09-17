import { PnrCheckForm } from "@/components/pnr/pnr-check-form";
import { messages } from "@/messages";

export default function PnrNotFound() {
  const m = messages.states.notFoundPage;
  return (
    <section className="mx-auto w-full max-w-page px-4 py-12 sm:px-6">
      <h1 className="text-3xl">{m.pnrTitle}</h1>
      <p className="mt-2 text-ink-2">{m.pnrDetail}</p>
      <div className="panel mt-8 p-4 sm:p-6">
        <PnrCheckForm id="pnr-notfound" autoFocus />
      </div>
    </section>
  );
}
