"use client";

import { useEffect, useState } from "react";
import { messages } from "@/messages";
import { formatTime } from "@/utils/datetime";
import { clockTicks, handAngles, istTime } from "./geometry/clock";

const TICKS = clockTicks();
const NUMERALS = [
  { text: "12", x: 0, y: -60 },
  { text: "3", x: 62, y: 0 },
  { text: "6", x: 0, y: 62 },
  { text: "9", x: -62, y: 0 },
] as const;

/**
 * 04 · the station clock, in Indian Standard Time. It reads the time on the client every 15 seconds; until then it
 * draws the face without hands, so the server's HTML matches (as IstClock shows "--:--"). J3 adds the sweeping
 * second hand.
 */
export function StationClock() {
  const m = messages.journey.clock;
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const read = () => setNow(new Date());
    read();
    const timer = window.setInterval(read, 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const angles = now ? handAngles(istTime(now)) : null;
  return (
    <figure className="station-clock" role="img" aria-label={now ? m.at(formatTime(now)) : m.label}>
      <svg viewBox="-100 -100 200 200" aria-hidden="true" focusable="false">
        <circle r={96} className="clock-ring" />
        <circle r={90} className="clock-ring is-faint" />
        {TICKS.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} className={t.major ? "clock-tick is-major" : "clock-tick"} />
        ))}
        {NUMERALS.map((n) => (
          <text key={n.text} x={n.x} y={n.y} className="clock-num" textAnchor="middle" dominantBaseline="central">
            {n.text}
          </text>
        ))}
        <text x={0} y={-28} className="clock-label" textAnchor="middle">
          {m.brand}
        </text>
        <text x={0} y={36} className="clock-label" textAnchor="middle">
          {m.ist}
        </text>
        {angles ? (
          <>
            <line x1={0} y1={10} x2={0} y2={-46} className="clock-hand is-hour" transform={`rotate(${angles.hour})`} />
            <line x1={0} y1={12} x2={0} y2={-70} className="clock-hand is-minute" transform={`rotate(${angles.minute})`} />
          </>
        ) : null}
        <circle r={3.6} className="clock-cap" />
      </svg>
    </figure>
  );
}
