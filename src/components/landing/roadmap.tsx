import { SheetTag } from "@/components/pnr/pnr-terminal-tags";
import { messages } from "@/messages";
import { RouteMap } from "./journey/route-map";
import { H2, ROW_NUM, SectionKicker } from "./sheet-type";

/** 05 · On the roadmap: seven planned extensions on one hairline-bordered list. */
export function Roadmap() {
  const m = messages.home.roadmap;
  return (
    <section id="roadmap" aria-labelledby="roadmap-title" className="section-pad">
      <SectionKicker rule="mb-6">{m.kicker}</SectionKicker>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 id="roadmap-title" className={H2}>
          {m.title}
        </h2>
        <p className="max-w-[44ch] text-sm leading-normal text-ink-1/70">{m.lead}</p>
      </div>
      <RouteMap count={m.items.length} />
      <ul className="mt-[28px] list-none border border-line p-0">
        {m.items.map((item, i) => (
          <li key={item.num} className={`flex flex-wrap items-baseline gap-x-4 gap-y-2 px-6 py-3.5 ${i > 0 ? "border-t border-line" : ""}`}>
            <span className={`min-w-8 ${ROW_NUM}`}>{item.num}</span>
            <span className="min-w-[min(200px,100%)] font-display text-lg font-semibold uppercase leading-normal tracking-head">{item.title}</span>
            <span className="min-w-[min(220px,100%)] flex-1 text-sm leading-normal text-ink-1/74">{item.note}</span>
            {/* Accent for what a reader can go and use today, outline for what is still to come:
                the difference is visible down the column without reading each chip. */}
            <SheetTag variant={item.status === "live" ? "accent" : "outline"}>{m.status[item.status]}</SheetTag>
          </li>
        ))}
      </ul>
    </section>
  );
}
