import { PnrClosingTerminal } from "@/components/pnr/pnr-terminal";
import type { ThirdPartySource } from "@/utils/source";
import { messages } from "@/messages";

/** The close: a second, compact check plate — "Got a ticket? Run a check · No sign-up". */
export function ClosingCta({ sampleMode, thirdPartySource }: { readonly sampleMode: boolean; readonly thirdPartySource?: ThirdPartySource }) {
  const m = messages.home.closing;
  return (
    <section aria-label={m.title} className="pb-[84px] pt-12">
      <PnrClosingTerminal sampleMode={sampleMode} thirdPartySource={thirdPartySource} title={m.title} meta={m.meta} lead={m.lead} />
    </section>
  );
}
