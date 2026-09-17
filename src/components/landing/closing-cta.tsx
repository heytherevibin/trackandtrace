import { RevealOnView } from "@/components/motion/reveal-on-view";
import { PnrCheckForm } from "@/components/pnr/pnr-check-form";
import { messages } from "@/messages";

export function ClosingCta() {
  const m = messages.home.cta;
  return (
    <section className="mx-auto w-full max-w-page px-4 py-16 sm:px-6" aria-labelledby="cta-title">
      <RevealOnView>
        <div className="panel p-6 sm:p-8">
          <h2 id="cta-title" className="text-2xl">
            {m.title}
          </h2>
          <p className="mt-2 text-ink-2">{m.lead}</p>
          <div className="mt-6">
            <PnrCheckForm id="pnr-footer" compact />
          </div>
        </div>
      </RevealOnView>
    </section>
  );
}
