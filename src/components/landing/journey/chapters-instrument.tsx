import type { ChapterTrace } from "@/components/landing/specimen-data";
import { Corners } from "@/components/ui/corners";
import { messages } from "@/messages";
import { arcPath, bezelTicks, digitArcs, groupLabelPoints } from "./geometry/dial";

const ARCS = digitArcs();
const TICKS = bezelTicks();
const LABELS = groupLabelPoints(ARCS, 326);
const CHAPTERS = [0, 1, 2].map((i) => ({ from: -150 + i * 102, to: -150 + i * 102 + 94 }));
const BARS = Array.from({ length: 17 }, (_, i) => -118 + i * 14);
const STEP_X = [-190, 0, 190] as const;

/**
 * 02's instrument (spec §3.A): the three stops of a check inside one dial, with each stop's name on the bezel,
 * a demo per stop in its middle, and a request-trace card. It prints the specimen's own record (ruling J3-11).
 * Decoration: the section's list says every word. Drawn at stop 01; the journey (chapters.ts) pins it and plays
 * the stops as the page scrolls.
 */
export function ChaptersInstrument({ trace }: { readonly trace: ChapterTrace }) {
  const m = messages.journey.chapters;
  const how = messages.home.how;
  const c = m.cards;
  return (
    <div className="chapters-instrument" aria-hidden="true">
      <div className="chapters-dial">
        <svg viewBox="-480 -480 960 960" focusable="false" data-pnr={trace.digits}>
          <g className="dial-bezel">
            {TICKS.map((t, i) => (
              <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} className={t.major ? "dial-tick is-major" : "dial-tick"} />
            ))}
          </g>
          <circle r={382} className="dial-ring" />
          <circle r={370} className="dial-ring is-dashed" />
          {ARCS.map((arc) => (
            <path key={arc.from} d={arcPath(352, arc.from, arc.to)} className="dial-seg" />
          ))}
          {messages.journey.dial.groups.map((group, i) => (
            <text key={group.label} x={LABELS[i]![0]} y={LABELS[i]![1]} className="dial-label" textAnchor="middle" dominantBaseline="middle">
              {group.label}
            </text>
          ))}
          <circle r={306} className="dial-ring" />
          <path d={arcPath(352, -8, 22)} className="dial-sweep" />
          {CHAPTERS.map((a) => (
            <path key={a.from} d={arcPath(424, a.from, a.to)} className="chapter-arc" />
          ))}
          <defs>
            {CHAPTERS.map((a, i) => (
              <path key={a.from} id={`chapter-arc-${i}`} d={arcPath(446, a.from, a.to)} />
            ))}
          </defs>
          {how.steps.map((step, i) => (
            <text key={step.num} className="dial-label chapter-label">
              <textPath href={`#chapter-arc-${i}`} startOffset="50%" textAnchor="middle">
                {how.stepLabel(step.num, step.kicker)}
              </textPath>
            </text>
          ))}
          <g data-layer="0" className="chapter-layer is-current">
            <text x={0} y={-10} className="dial-label is-steel chapter-digits" textAnchor="middle">
              {m.noDigits}
            </text>
            <text x={0} y={58} className="dial-label" textAnchor="middle">
              {m.pnrGroups}
            </text>
          </g>
          <g data-layer="1" className="chapter-layer">
            {BARS.map((y) => (
              <rect key={y} x={-120} y={y} width={240} height={2} className="dial-dot chapter-bar" />
            ))}
            <line x1={-190} y1={150} x2={190} y2={150} className="dial-ring chapter-rail" />
            {m.steps.map((s, i) => (
              <g key={s.label}>
                <circle cx={STEP_X[i]} cy={150} r={7} className="dial-ring" />
                <circle cx={STEP_X[i]} cy={150} r={4} className="dial-dot chapter-step" />
                <text x={STEP_X[i]} y={180} className="dial-label" textAnchor="middle">
                  {s.label}
                </text>
              </g>
            ))}
            <circle cx={-190} cy={150} r={9} className="chapter-pulse" />
          </g>
          <g data-layer="2" className="chapter-layer">
            <text x={0} y={-40} className="dial-label is-steel chapter-status" textAnchor="middle">
              {trace.statuses}
            </text>
            {trace.party.map((line, i) => (
              <text key={line} x={0} y={22 + i * 30} className="dial-label chapter-party" textAnchor="middle">
                {line}
              </text>
            ))}
            <text x={0} y={132} className="dial-label" textAnchor="middle">
              {m.stamp(trace.retrieved)}
            </text>
          </g>
        </svg>
      </div>
      <div className="chapter-card blueprint bg-surface-0">
        <Corners />
        <div className="flex border-b border-line">
          <span className="legend flex-1 px-4 py-2">{m.trace}</span>
          <span className="legend chapter-step-count tnum border-l border-line px-4 py-2">{m.step(1, 3)}</span>
        </div>
        <pre data-card="0" className="is-current">
          {`${c.pnr}  `}
          <b>{trace.pnr}</b>
          {`\n${c.digits}  `}
          <b>{c.tenOfTen}</b>
          {`\n${c.groups}  ${c.groupsValue}`}
        </pre>
        <pre data-card="1">
          {`${c.validate}  `}
          <b>{c.ok}</b>
          {`\n${c.source}    `}
          <b>{c.askedOnce}</b>
          {`\n${c.result}    `}
          <b>{c.asReturned}</b>
        </pre>
        <pre data-card="2">
          {`${c.status}  `}
          <b>{trace.statuses}</b>
          {`\n${c.party}   ${m.partyOf(trace.count)}\n${c.retrieved}  `}
          <b>{m.time(trace.retrieved)}</b>
        </pre>
      </div>
    </div>
  );
}
