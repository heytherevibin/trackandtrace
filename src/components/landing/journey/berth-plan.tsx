import { Corners } from "@/components/ui/corners";
import { messages } from "@/messages";
import type { SpecimenSeats } from "../specimen-data";
import { BAY_WIDTH, berthNumber, berthSeat, coachPlan } from "./geometry/berths";

const listFormat = new Intl.ListFormat("en-IN", { style: "long", type: "conjunction" });

/** 03 · the specimen passenger's coach in plan, their berth lit. Sample data, from the same fixture as the record beside it. */
export function BerthPlan({ seats }: { readonly seats: SpecimenSeats | null }) {
  const number = seats ? berthNumber(seats.berth) : null;
  const seat = number === null ? null : berthSeat(number);
  if (!seats || !seat) return null;
  const m = messages.journey.berths;
  const plan = coachPlan(seat);
  const who = listFormat.format(seats.waiting.map((w) => String(w.index)));
  const statuses = seats.waiting.map((w) => w.label).join(", ");
  return (
    <figure className="berth-plan blueprint" aria-labelledby="berth-cap">
      <Corners />
      <div className="flex flex-wrap items-stretch border-b border-line">
        <span className="legend flex-1 px-4 py-2 leading-6 text-ink-1">{m.title(seats.coach, seats.cls)}</span>
        <span className="legend whitespace-nowrap border-l border-line px-4 py-2 leading-6">{m.sample}</span>
      </div>
      <svg viewBox="0 0 640 142" aria-hidden="true" focusable="false">
        <rect x={8} y={16} width={624} height={118} className="plan-line" />
        <line x1={8} y1={100} x2={632} y2={100} className="plan-line is-faint" />
        {[8, 578].map((x) => (
          <g key={x}>
            <rect x={x + 4} y={20} width={20} height={34} className="plan-line" />
            <rect x={x + 28} y={20} width={20} height={34} className="plan-line" />
          </g>
        ))}
        {plan.bays.map((bay) => (
          <g key={bay.x0}>
            <line x1={bay.x0} y1={16} x2={bay.x0} y2={96} className="plan-line is-faint" />
            {bay.stacks.map((stack) => (
              <g key={stack.label}>
                <rect x={stack.x} y={22} width={22} height={70} className={stack.lit ? "plan-line plan-berth is-lit" : "plan-line plan-berth"} />
                <text x={stack.x + 11} y={60} className="plan-num" textAnchor="middle" transform={`rotate(-90 ${stack.x + 11} 60)`}>
                  {stack.label}
                </text>
              </g>
            ))}
            <rect x={bay.side.x} y={106} width={bay.side.width} height={22} className={bay.side.lit ? "plan-line plan-berth is-lit" : "plan-line"} />
            <text x={bay.x0 + BAY_WIDTH / 2} y={121} className="plan-num" textAnchor="middle">
              {bay.side.label}
            </text>
          </g>
        ))}
        {plan.tagX === null ? null : (
          <text x={plan.tagX} y={12} className="plan-tag is-lit" textAnchor="middle">
            {seats.berth}
          </text>
        )}
      </svg>
      <figcaption id="berth-cap" className="berth-cap">
        {m.litLead(seats.status)}
        <b>{m.seat(seats.coach, seats.berth)}</b>
        {seats.waiting.length ? m.waiting(who, statuses) : m.litOnly}
      </figcaption>
    </figure>
  );
}
