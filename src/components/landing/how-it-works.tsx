import type { ChapterTrace } from "@/components/landing/specimen-data";
import { messages } from "@/messages";
import { ChaptersInstrument } from "./journey/chapters-instrument";
import { TrainGlyph } from "./journey/train-glyph";
import { BODY, H2, H3, SectionKicker } from "./sheet-type";

// The route line: twin rails with sleepers and three stops at origin, midway, and terminus.
const STOPS = ["left-0", "left-[calc(50%-8px)]", "left-[calc(100%-16px)]"] as const;

/**
 * 02 · How it works: the check drawn as a route with three stops. Drawn still it is a plain section; while the
 * journey runs with Motion on, and the stops fit the window, it pins and plays them inside the chapters
 * instrument (journey/chapters.ts, spec §3.A).
 */
export function HowItWorks({ trace }: { readonly trace: ChapterTrace | null }) {
  const m = messages.home.how;
  return (
    <section id="how" aria-labelledby="how-title" className="chapters section-pad">
      <div className="chapters-pin">
        <div className="chapters-copy">
          <SectionKicker rule="mb-3">{m.kicker}</SectionKicker>
          <h2 id="how-title" className={H2}>
            {m.title}
          </h2>
          <div aria-hidden="true" className="chapters-rail relative mt-[44px] h-6">
            <div className="rail absolute inset-x-0 top-1.5 h-3" />
            {STOPS.map((left) => (
              <span key={left} className={`absolute top-1 flex size-4 items-center justify-center rounded-full border border-accent-text ground ${left}`}>
                <span className="size-1.5 rounded-full bg-accent" />
              </span>
            ))}
            <span className="rail-marker">
              <TrainGlyph />
            </span>
          </div>
          <ol className="chapters-steps">
            {m.steps.map((step, i) => (
              <li key={step.num} data-chapter={i} className="min-w-0">
                <span className="font-display text-label font-semibold uppercase leading-normal tracking-caps text-accent-text tnum">{m.stepLabel(step.num, step.kicker)}</span>
                <h3 className={`mt-2 ${H3}`}>{step.title}</h3>
                <p className={`mt-2.5 ${BODY}`}>{step.detail}</p>
              </li>
            ))}
          </ol>
        </div>
        {trace ? <ChaptersInstrument trace={trace} /> : null}
      </div>
    </section>
  );
}
