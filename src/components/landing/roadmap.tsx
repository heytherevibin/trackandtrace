import { Badge } from "@/components/ui/badge";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";
import { BODY, H2, SECTION, SectionKicker } from "./sheet-type";

/** 05 · On the roadmap: seven extensions, each Live or Planned, in one plate (v4). */
export function Roadmap() {
  const m = messages.home.roadmap;
  return (
    <section id="roadmap" aria-labelledby="roadmap-title" className={SECTION}>
      <SectionKicker>{m.kicker}</SectionKicker>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <h2 id="roadmap-title" className={H2}>
          {m.title}
        </h2>
        <p className={`m-0 max-w-[44ch] ${BODY}`}>{m.lead}</p>
      </div>
      <ul className="blueprint @container m-0 mt-8 list-none p-0">
        {m.items.map((item, i) => (
          <li key={item.num} className={cn("grid grid-cols-[40px_minmax(160px,1fr)_minmax(0,2fr)_auto] items-center gap-x-4 gap-y-2 p-4 max-sm:grid-cols-[32px_minmax(0,1fr)_auto] @max-[20rem]:grid-cols-[32px_minmax(0,1fr)]", i > 0 && "border-t-2 border-edge")}>
            <span className="font-figure text-xs leading-4 text-ink-3">{item.num}</span>
            <span className="min-w-0 font-display text-base uppercase leading-6 wrap-anywhere">{item.title}</span>
            <span className={`${BODY} min-w-0 wrap-anywhere max-sm:col-[2/-1] max-sm:row-start-2`}>{item.note}</span>
            <Badge variant={item.status === "live" ? "accent" : "neutral"} className={cn("max-w-full whitespace-normal wrap-anywhere @max-[20rem]:col-start-2 @max-[20rem]:justify-self-start", item.status === "live" && "nb:bg-lime nb:text-on-fill")}>
              {m.status[item.status]}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}
