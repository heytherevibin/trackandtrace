import { messages } from "@/messages";
import { arcPath, bezelTicks, digitArcs, groupLabelPoints } from "./geometry/dial";

const ARCS = digitArcs({ start: -60, sweep: 300 });
const TICKS = bezelTicks();
const LABELS = groupLabelPoints(ARCS, 326);

/** The living dial behind the hero's check plate, drawn at rest: J3 lights a segment per digit typed. Decoration only. */
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
      </svg>
    </div>
  );
}
