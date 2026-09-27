import { messages } from "@/messages";
import { arcPath, bezelTicks, digitArcs, groupLabelPoints } from "./geometry/dial";
import { dayTicks } from "./chart-countdown";

const ARCS = digitArcs({ start: -60, sweep: 300 });
const TICKS = bezelTicks();
const LABELS = groupLabelPoints(ARCS, 326);
const DAY_TICKS = dayTicks();

/** The living dial behind the hero's check plate, drawn at rest. While the journey runs, a segment lights per
 *  digit typed, a sweep rides the ring during a check, and a result turns it into a 24-hour face. Decoration only. */
export function HeroDial() {
  return (
    <div className="hero-dial" aria-hidden="true">
      <svg viewBox="-430 -430 860 860" focusable="false">
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
        <g className="dial-face">
          {DAY_TICKS.map((t, i) => (
            <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} className={t.major ? "dial-hour-tick is-major" : "dial-hour-tick"} />
          ))}
          <path d="" className="dial-arc" />
          <circle cx={0} cy={-352} r={7} className="dial-chart-mark" />
        </g>
        <g className="dial-needle">
          <line x1={0} y1={-300} x2={0} y2={-438} className="dial-needle-line" />
          <circle cx={0} cy={-444} r={5} className="dial-needle-cap" />
        </g>
      </svg>
    </div>
  );
}
