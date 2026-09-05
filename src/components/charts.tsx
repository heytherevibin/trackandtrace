"use client";

import type { HistoryPoint, TrendDay } from "@/lib/types";
import { PlateLabel } from "./ui";

/* ------------------------------------------------------------------ */
/* Modelled 5-day confirmation trend — bar chart in the plate grammar.  */
/* ------------------------------------------------------------------ */

export function TrendBars({ trend, settled }: { trend: TrendDay[]; settled: boolean }) {
  const max = Math.max(...trend.map((d) => d.total));
  return (
    <div className="flex h-full flex-col justify-end gap-2.5">
      <div className="flex h-40 items-end gap-3 sm:gap-4">
        {trend.map((d, i) => {
          const rate = Math.round((d.confirmed / d.total) * 100);
          const h = Math.max(8, (d.confirmed / max) * 100);
          return (
            <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <span className="font-data text-[11px] text-steel-2">{rate}%</span>
              <div
                className="flex h-full w-full items-end"
                role="img"
                aria-label={`${d.dayLabel}: ${d.confirmed} of ${d.total} confirmed`}
              >
                <div
                  className="w-full origin-bottom rounded-t-[3px] bg-go/70"
                  style={{
                    height: `${h}%`,
                    transform: settled ? "scaleY(1)" : "scaleY(0.02)",
                    transformOrigin: "bottom",
                    transition: `transform 900ms cubic-bezier(0.16,1,0.3,1) ${250 + i * 90}ms`,
                    boxShadow: "0 0 18px -6px rgba(47,191,113,0.55)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 sm:gap-4">
        {trend.map((d) => (
          <span key={d.date} className="flex-1 text-center font-data text-[10px] tracking-[0.14em] text-steel uppercase">
            {d.dayLabel}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Movement panel — your recorded checks overlaid on the modeled path  */
/* the ticket is expected to travel to chart time. Labeled honestly:   */
/* the projection is demo-modeled, your checks are real.               */
/* ------------------------------------------------------------------ */

function modelPositions(
  pos: number,
  probability: number,
  hoursToChart: number,
  count = 24
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const settle = probability >= 62 ? 0 : pos * 0.55;
  const spread = Math.max(0.05, probability / 100);
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const eased = 1 - Math.pow(1 - t, 1.6);
    // declines fastest mid-window; risk of stall near the end if low prob
    const stall = probability < 45 ? Math.max(0, t - 0.7) * 0.5 : 0;
    const y = pos - (pos - settle) * eased * spread - pos * stall * 0.15;
    pts.push({ x: t, y: Math.max(0, y) });
  }
  return pts;
}

export function MovementPanel({
  points,
  currentPos,
  hoursToChart,
  probability,
  unit,
  settled,
}: {
  points: HistoryPoint[];
  currentPos: number;
  hoursToChart: number;
  probability: number;
  unit: "WL" | "RAC";
  settled: boolean;
}) {
  const W = 640;
  const H = 210;
  const padL = 46;
  const padR = 16;
  const padT = 14;
  const padB = 26;
  const iw = W - padL - padR;
  const ih = H - padT - padB;

  const floor = Math.max(6, Math.ceil(currentPos * 1.35));
  const xFor = (t: number) => padL + t * iw;
  const yFor = (v: number) => padT + (1 - v / floor) * ih;

  const model = modelPositions(currentPos, probability, hoursToChart);
  const haveReal = points.length >= 1;

  // Real check points: x by time before chart (proportional to 72h window).
  const real = points.map((p) => {
    const msLeft = Math.max(0, new Date(p.at).getTime() - (points[0] ? 0 : 0));
    void msLeft;
    const hoursAgo = (Date.now() - new Date(p.at).getTime()) / 3_600_000;
    const t = Math.max(0, Math.min(1, hoursAgo / Math.max(8, hoursToChart)));
    return { ...p, x: xFor(1 - t), y: yFor(p.position ?? 0) };
  });

  const gridVals = [0, Math.round(floor / 3), Math.round((floor * 2) / 3), floor].filter(
    (v, i, a) => a.indexOf(v) === i
  );

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Waitlist position over time to chart">
        {/* Grid */}
        {gridVals.map((v) => (
          <g key={v}>
            <line x1={padL} y1={yFor(v)} x2={W - padR} y2={yFor(v)} stroke="var(--line)" strokeWidth="1" strokeDasharray={v === 0 ? "0" : "2 5"} />
            <text x={padL - 8} y={yFor(v) + 3} textAnchor="end" fill="var(--steel)" fontSize="9.5" fontFamily="var(--font-plex-mono), monospace">
              {v === 0 ? "0" : `${unit} ${v}`}
            </text>
          </g>
        ))}
        <text x={padL} y={H - 6} fill="var(--steel)" fontSize="8.5" fontFamily="var(--font-plex-mono), monospace" letterSpacing="1">
          {Math.max(1, Math.round(hoursToChart))}H TO CHART
        </text>
        <text x={W - padR} y={H - 6} textAnchor="end" fill="var(--steel)" fontSize="8.5" fontFamily="var(--font-plex-mono), monospace" letterSpacing="1">
          CHART
        </text>

        {/* Modeled path band */}
        <path
          d={`M ${xFor(0)} ${yFor(model[0].y)} ${model.map((m, i) => `L ${xFor(m.x)} ${yFor(m.y)}`).join(" ")}`}
          fill="none"
          stroke="var(--steel)"
          strokeWidth="1.4"
          strokeDasharray="3 5"
          opacity="0.85"
          pathLength={1}
          style={{
            strokeDashoffset: settled ? 0 : 1,
            transition: "stroke-dashoffset 1400ms cubic-bezier(0.16,1,0.3,1)",
          }}
        />

        {/* Real checks line */}
        {real.length >= 2 && (
          <polyline
            points={real.map((r) => `${r.x},${r.y}`).join(" ")}
            fill="none"
            stroke="var(--bone)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            style={{
              strokeDashoffset: settled ? 0 : 1,
              transition: "stroke-dashoffset 900ms cubic-bezier(0.16,1,0.3,1)",
            }}
          />
        )}
        {real.map((r, i) => (
          <circle key={i} cx={r.x} cy={r.y} r="4" fill="var(--ink-1)" stroke="var(--bone)" strokeWidth="1.8" />
        ))}

        {/* Current marker */}
        <circle cx={xFor(0)} cy={yFor(model[0].y)} r="5" fill="var(--watch)" stroke="var(--ink-1)" strokeWidth="2" />
      </svg>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
        <span className="inline-flex items-center gap-2">
          <span className="h-[2px] w-6 bg-steel" aria-hidden="true" />
          <PlateLabel>Modeled path · demo</PlateLabel>
        </span>
        {haveReal && (
          <span className="inline-flex items-center gap-2">
            <span className="h-[2.5px] w-6 bg-bone" aria-hidden="true" />
            <PlateLabel>Your checks</PlateLabel>
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-2">
          <span className="size-2 rounded-full bg-watch" aria-hidden="true" />
          <PlateLabel>Today</PlateLabel>
        </span>
      </div>
    </div>
  );
}
