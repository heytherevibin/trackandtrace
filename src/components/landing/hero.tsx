import { HeroDial } from "@/components/landing/journey/hero-dial";
import { PnrTerminal } from "@/components/pnr/pnr-terminal";
import { SheetTag } from "@/components/pnr/pnr-terminal-tags";
import { messages } from "@/messages";

/** Hero, as drawn: the promise in hero capitals with four outline tags on the left, the live check plate on the right. */
export function Hero({ sampleMode, connected = false }: { readonly sampleMode: boolean; readonly connected?: boolean }) {
  const m = messages.home.hero;
  const tags = [m.tags.free, m.tags.noAccount, m.tags.notLogged, m.tags.failsClosed];
  return (
    <section
      aria-labelledby="hero-title"
      className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-start gap-x-[clamp(24px,4vw,64px)] gap-y-12 pb-[72px] pt-[clamp(48px,7vw,96px)] lg:-mx-2 lg:overflow-x-clip lg:px-2"
    >
      <div className="min-w-0">
        <h1 id="hero-title" className="optical-hang text-hero tracking-display text-balance">
          <span className="block">{m.lineOne}</span>
          <span className="block">{m.lineTwo}</span>
        </h1>
        <p className="mt-[28px] max-w-[56ch] text-lead text-ink-1/82">{m.lead}</p>
        <div className="mt-[28px] flex flex-wrap gap-2.5">
          {tags.map((tag) => (
            <SheetTag key={tag} variant="outline">
              {tag}
            </SheetTag>
          ))}
        </div>
      </div>
      <div className="dial-host">
        <HeroDial />
        <PnrTerminal sampleMode={sampleMode} connected={connected} />
      </div>
    </section>
  );
}
