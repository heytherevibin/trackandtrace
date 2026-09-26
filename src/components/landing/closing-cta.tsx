import { PnrClosingTerminal } from "@/components/pnr/pnr-terminal";
import { messages } from "@/messages";
import { TerminusStage } from "./journey/terminus-stage";

/** The close: a second, compact check plate — "Got a ticket? Run a check · No sign-up". */
export function ClosingCta({ sampleMode, connected = false }: { readonly sampleMode: boolean; readonly connected?: boolean }) {
  const m = messages.home.closing;
  return (
    <section id="terminus" aria-label={m.title} className="pb-[84px] pt-12">
      <TerminusStage />
      <PnrClosingTerminal sampleMode={sampleMode} connected={connected} title={m.title} meta={m.meta} lead={m.lead} />
    </section>
  );
}
