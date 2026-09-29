import { Corners } from "@/components/ui/corners";
import { messages } from "@/messages";
import { BODY, H2, SectionKicker } from "../sheet-type";
import { PinPaper } from "./pin-paper";
import { StillDrawing } from "./still-drawing";
import { StillNoscript } from "./still-svg";
import { partSide } from "./train-parts";

const num = (i: number) => String(i + 1).padStart(2, "0");

/**
 * GA · the drawn train (spec §3.A): the locomotive apart into its ten parts, each labelled with the job it does.
 * Drawn still, the page reads words, then the drawing, then the parts list (journey.css); while the journey runs,
 * still.ts stands the labels beside the drawing with leaders to their parts when they fit (J4-7). While the drawing is
 * live, drawing.ts pins this section and scene/live.ts draws into its stage (J5).
 */
export function DrawingChapter() {
  const m = messages.home.drawing;
  const t = m.titleBlock;
  return (
    <section id="anatomy" aria-labelledby="anatomy-title" className="anatomy section-pad">
      <div className="anatomy-pin">
        <div className="anatomy-stage" aria-hidden="true" />
        <div className="anatomy-copy">
          <SectionKicker rule="mb-3">{m.kicker}</SectionKicker>
          <h2 id="anatomy-title" className={H2}>
            {m.title}
          </h2>
          <p className={`mt-3.5 ${BODY}`}>{m.lead}</p>
        </div>
        <StillDrawing kind="anatomy" className="anatomy-still" />
        <StillNoscript kind="anatomy" className="anatomy-still" />
        <svg className="callout-lines" aria-hidden="true" focusable="false" />
        <ol className="callouts" aria-label={m.listLabel}>
          {m.parts.map((part, i) => (
            <li key={part.id} className="callout" data-part={part.id} data-side={partSide(part.id)}>
              <span className="callout-num tnum">{num(i)}</span>
              <span className="callout-title">{part.title}</span>
              <span className="callout-detail">
                <b>{part.promise}</b> · {part.detail}
              </span>
            </li>
          ))}
        </ol>
        <ol className="anatomy-legend" aria-hidden="true">
          {m.parts.map((part, i) => (
            <li key={part.id}>
              <b className="tnum">{num(i)}</b>
              <span>
                {part.title} · {part.promise}
              </span>
            </li>
          ))}
        </ol>
        <div className="title-block blueprint" aria-hidden="true">
          <Corners />
          <span className="tb-cell tb-wide">
            <b>{t.drawing}</b> · {t.drawingName}
          </span>
          <span className="tb-cell">{t.sheet}</span>
          <span className="tb-cell tb-wide">{t.subject}</span>
          <span className="tb-cell">{t.scale}</span>
          <span className="tb-cell tb-wide">{t.gauge}</span>
          <span className="tb-cell">{t.maker}</span>
        </div>
        <span className="dim-label tnum" data-dim="length" aria-hidden="true">
          {m.dims.length}
        </span>
        <span className="dim-label tnum" data-dim="height" aria-hidden="true">
          {m.dims.height}
        </span>
        <p className="anatomy-caption legend-sm">{m.caption}</p>
      </div>
      <PinPaper />
    </section>
  );
}
