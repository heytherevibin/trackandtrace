import { Badge } from "@/components/ui/badge";
import { messages } from "@/messages";
import { HeroCheck } from "./hero-check";

/** v4's punched ticket over the promise: a yellow stub with three printed lines and a striped pink counterfoil. */
function Ticket() {
  return (
    <div aria-hidden="true" className="nb-ticket mb-[28px] ml-1 max-sm:hidden">
      <span className="nb-ticket-l1" />
      <span className="nb-ticket-l2" />
      <span className="nb-ticket-l3" />
      <span className="nb-ticket-stub" />
    </div>
  );
}

/** Hero, as Neubrutal v4 draws it: the ticket, the kicker, the promise in Archivo capitals over a pink shadow, the lead
 *  and four tags on the left; the live check plate on the right (on a phone, the plate first). */
export function Hero({ sampleMode, connected = false }: { readonly sampleMode: boolean; readonly connected?: boolean }) {
  const m = messages.home.hero;
  const tags = [m.tags.free, m.tags.noAccount, m.tags.notLogged, m.tags.failsClosed];
  return (
    <HeroCheck sampleMode={sampleMode} connected={connected}>
      <Ticket />
      <p className="legend m-0 mb-4">{m.kicker}</p>
      <h1 id="hero-title" className="nb-hero nb-shadow-pink m-0">
        <span className="block">{m.lineOne}</span>
        <span className="block">{m.lineTwo}</span>
      </h1>
      <p className="m-0 mt-6 max-w-[52ch] text-base leading-6 text-ink-2 max-sm:mt-3 max-sm:text-sm max-sm:leading-5">{m.lead}</p>
      <ul className="m-0 mt-6 flex list-none flex-wrap gap-2 p-0 max-sm:mt-4">
        {tags.map((tag) => (
          <li key={tag}>
            <Badge variant="outline" className="max-w-full whitespace-normal">
              {tag}
            </Badge>
          </li>
        ))}
      </ul>
    </HeroCheck>
  );
}
