import { PnrClosingTerminal } from "@/components/pnr/pnr-terminal";
import { messages } from "@/messages";

/** The close: a second, compact check plate — "Got a ticket? Run a check · No sign-up". */
export function ClosingCta({ sampleMode }: { readonly sampleMode: boolean }) {
  const m = messages.home.closing;
  return (
    <section aria-label={m.title} className="pb-[84px] pt-12">
      <PnrClosingTerminal sampleMode={sampleMode} title={m.title} meta={m.meta} lead={m.lead} />
    </section>
  );
}
