"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { countdownParts, pad2 } from "@/lib/time";

/* ------------------------------------------------------------------ */
/* Count-up number — resolved value eases into place (transform/opacity
   only; respects reduced motion via CSS). */
/* ------------------------------------------------------------------ */

export function useCountUp(target: number, duration = 1400, start = false) {
  const [value, setValue] = useState(start ? 0 : target);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!start) {
      setValue(target);
      return;
    }
    const from = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, duration, start]);
  return value;
}

/* ------------------------------------------------------------------ */
/* Polar helpers (screen coords: 0° east, positive clockwise) */
/* ------------------------------------------------------------------ */

function pt(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const s = pt(cx, cy, r, a0);
  const e = pt(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

const START = -210; // bottom-left
const SWEEP = 240;

/* ------------------------------------------------------------------ */
/* Reticle — faint optical-instrument crosshair + concentric rings.    */
/* Lives inside instrument faces, where it reads as measurement.       */
/* ------------------------------------------------------------------ */

function Graticule({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g stroke="var(--bone)" strokeOpacity="0.05" fill="none" strokeWidth="0.7">
      <circle cx={cx} cy={cy} r={r - 1} />
      <circle cx={cx} cy={cy} r={r - 14} />
      <line x1={cx - r + 2} y1={cy} x2={cx + r - 2} y2={cy} />
      <line x1={cx} y1={cy - r + 2} x2={cx} y2={cy + r - 2} />
    </g>
  );
}

function angleFor(fraction: number) {
  return START + SWEEP * Math.min(1, Math.max(0, fraction));
}

export function aspectFor(p: number): "go" | "watch" | "stop" {
  return p >= 75 ? "go" : p >= 40 ? "watch" : "stop";
}

/* ------------------------------------------------------------------ */
/* Probability dial — the master odds face.                            */
/* ------------------------------------------------------------------ */

export function ProbabilityDial({
  probability,
  animate = false,
  size = 260,
  tickLabel = true,
}: {
  probability: number;
  animate?: boolean;
  size?: number;
  tickLabel?: boolean;
}) {
  const shown = useCountUp(probability, 1600, animate);
  const frac = shown / 100;
  const cx = 110;
  const cy = 118;
  const R = 84;

  const aspect = aspectFor(probability);
  const aspectColor =
    aspect === "go" ? "var(--go)" : aspect === "watch" ? "var(--watch)" : "var(--stop)";

  const ticks = useMemo(() => {
    const out: { deg: number; major: boolean; label: string }[] = [];
    for (let v = 0; v <= 100; v += 5) {
      const f = v / 100;
      out.push({ deg: angleFor(f), major: v % 25 === 0, label: String(v) });
    }
    return out;
  }, []);

  return (
    <div className="relative inline-flex flex-col items-center" style={{ width: size }}>
      <svg viewBox="0 0 220 214" width="100%" role="img" aria-label={`Confirmation probability ${probability} percent`}>
        <Graticule cx={cx} cy={cy} r={R + 2} />
        {/* Tick ring */}
        {ticks.map((t, i) => {
          const inner = t.major ? R - 10 : R - 5.5;
          const a = pt(cx, cy, inner, t.deg);
          const b = pt(cx, cy, R, t.deg);
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={t.major ? "var(--bone)" : "var(--steel)"}
              strokeOpacity={t.major ? 0.75 : 0.45}
              strokeWidth={t.major ? 1.4 : 0.9}
            />
          );
        })}
        {tickLabel &&
          ticks
            .filter((t) => t.major)
            .map((t, i) => {
              const lp = pt(cx, cy, R - 22, t.deg);
              return (
                <text
                  key={`l${i}`}
                  x={lp.x}
                  y={lp.y + 3}
                  textAnchor="middle"
                  fill="var(--steel)"
                  fontSize="8.5"
                  fontFamily="var(--font-mono), monospace"
                >
                  {t.label}
                </text>
              );
            })}

        {/* Track arc */}
        <path d={arcPath(cx, cy, R - 26, START, angleFor(1))} stroke="var(--line-2)" strokeWidth="7" strokeLinecap="round" fill="none" />
        {/* Value arc */}
        <path
          d={arcPath(cx, cy, R - 26, START, angleFor(frac))}
          stroke={aspectColor}
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
          style={{
            transition: animate
              ? "stroke-dashoffset 1600ms cubic-bezier(0.16,1,0.3,1)"
              : undefined,
          }}
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={animate ? 1 - frac : 0}
        />
        {/* Needle */}
        <g
          className={animate ? "needle-settle" : undefined}
          style={{
            transform: `rotate(${angleFor(frac) + 90}deg)`,
            transformOrigin: `${cx}px ${cy}px`,
          }}
        >
          <line x1={cx} y1={cy} x2={cx} y2={cy - (R - 30)} stroke="var(--bone)" strokeWidth="2.4" strokeLinecap="round" />
        </g>
        <circle cx={cx} cy={cy} r="4.5" fill="var(--ink-1)" stroke="var(--bone)" strokeWidth="1.6" />

        {/* Center readout */}
        <text x={cx} y={cy - 16} textAnchor="middle" fill="var(--bone-dim)" fontSize="8" fontWeight="600" fontFamily="var(--font-mono), monospace" letterSpacing="2.5">
          ODDS
        </text>
        <text
          x={cx}
          y={cy + 22}
          textAnchor="middle"
          fill="var(--bone)"
          fontSize="44"
          fontWeight="700"
          fontFamily="var(--font-mono), monospace"
          aria-hidden={animate}
          style={{ filter: "drop-shadow(0 0 8px rgba(236,228,210,0.15))" }}
        >
          {shown}
        </text>
        <text x={cx + 40} y={cy + 16} textAnchor="start" fill="var(--bone-dim)" fontSize="15" fontWeight="500" fontFamily="var(--font-mono), monospace">
          %
        </text>
      </svg>
      {animate && (
        <span className="sr-only" role="status" aria-live="polite">
          Confirmation probability {shown} percent
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Countdown ring — the other face: time remaining to chart.            */
/* ------------------------------------------------------------------ */

export function CountdownRing({
  chartAt,
  animate = false,
  size = 260,
}: {
  chartAt: string;
  animate?: boolean;
  size?: number;
}) {
  const target = useMemo(() => new Date(chartAt), [chartAt]);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const totalMs = 24 * 3_600_000;
  const remainMs = Math.max(0, target.getTime() - now.getTime());
  const frac = Math.min(1, remainMs / totalMs);
  const hoursLeft = remainMs / 3_600_000;
  const danger = hoursLeft <= 6;
  const warn = hoursLeft <= 12;
  const color = danger ? "var(--stop)" : warn ? "var(--watch)" : "var(--go)";

  const parts = countdownParts(now, target);
  const R = 84;
  const cx = 110;
  const cy = 118;
  const C = 2 * Math.PI * R;

  // Whole ring (steel), then remaining arc on top (colored).
  return (
    <div className="relative inline-flex flex-col items-center" style={{ width: size }}>
      <svg viewBox="0 0 220 214" width="100%" role="img" aria-label={`Time to chart: ${parts.h} hours ${parts.m} minutes`}>
        <Graticule cx={cx} cy={cy} r={R + 2} />
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--line-2)" strokeWidth="7" />
        {/* 6h / 12h markers */}
        {[0.25, 0.5].map((m) => {
          const a = (-Math.PI / 2 + m * Math.PI * 2);
          const x1 = cx + (R - 14) * Math.cos(a);
          const y1 = cy + (R - 14) * Math.sin(a);
          const x2 = cx + (R - 6) * Math.cos(a);
          const y2 = cy + (R - 6) * Math.sin(a);
          return (
            <g key={m}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={m === 0.25 ? "var(--stop)" : "var(--watch)"} strokeOpacity="0.9" strokeWidth="2" />
            </g>
          );
        })}
        <circle
          cx={cx}
          cy={cy}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={animate ? 1 - frac : 0}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{
            transition: animate
              ? "stroke-dashoffset 1800ms cubic-bezier(0.16,1,0.3,1), stroke 600ms ease"
              : undefined,
          }}
        />
        <text x={cx} y={cy - 16} textAnchor="middle" fill="var(--bone-dim)" fontSize="8" fontWeight="600" fontFamily="var(--font-mono), monospace" letterSpacing="2.5">
          TO CHART
        </text>
        <text
          x={cx}
          y={cy + 26}
          textAnchor="middle"
          fill="var(--bone)"
          fontSize="38"
          fontWeight="700"
          fontFamily="var(--font-mono), monospace"
          style={{ filter: "drop-shadow(0 0 8px rgba(236,228,210,0.15))" }}
        >
          {pad2(parts.h)}
          <tspan fill="var(--bone-dim)">:</tspan>
          {pad2(parts.m)}
          <tspan fill="var(--bone-dim)">:</tspan>
          {pad2(parts.s)}
        </text>
        <text x={cx} y={cy + 46} textAnchor="middle" fill={color} fontSize="9" fontWeight="600" fontFamily="var(--font-mono), monospace" letterSpacing="1.5">
          {danger ? "CHART IMMINENT" : warn ? "FINAL WINDOW" : "WINDOW OPEN"}
        </text>
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mini dial — compact odds arc for cards / rows.                       */
/* ------------------------------------------------------------------ */

export function MiniDial({ value, size = 46 }: { value: number; size?: number }) {
  const cx = 24;
  const cy = 24;
  const R = 20;
  const frac = Math.max(0.03, value / 100);
  const aspect = aspectFor(value);
  const color = aspect === "go" ? "var(--go)" : aspect === "watch" ? "var(--watch)" : "var(--stop)";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={`${value} percent`}
      className="shrink-0"
    >
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--line)" strokeWidth="3.5" transform={`rotate(-90 ${cx} ${cy})`} />
      <circle
        cx={cx}
        cy={cy}
        r={R}
        fill="none"
        stroke={color}
        strokeWidth="3.5"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - frac}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dashoffset 1000ms cubic-bezier(0.16,1,0.3,1)" }}
      />
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        fill="var(--bone)"
        fontSize="12"
        fontWeight="600"
        fontFamily="var(--font-mono), monospace"
      >
        {value}
      </text>
    </svg>
  );
}
