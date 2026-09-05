"use client";

import type { Factor } from "@/lib/types";
import { PlateLabel } from "./ui";

const maxAbs = (f: Factor[]) => Math.max(1, ...f.map((x) => Math.abs(x.points)));

export function FactorRows({ factors, settled }: { factors: Factor[]; settled: boolean }) {
  const m = maxAbs(factors);
  return (
    <ul className="divide-y divide-(--line)">
      {factors.map((f, i) => {
        const isPos = f.points > 0;
        const isNeg = f.points < 0;
        const color = isPos ? "var(--go)" : isNeg ? "var(--stop)" : "var(--steel)";
        const width = (Math.abs(f.points) / m) * 100;
        return (
          <li
            key={f.id}
            className="stagger-item py-3.5 first:pt-1 last:pb-1"
            style={{ transitionDelay: settled ? `${220 + i * 70}ms` : "0ms", ...(settled ? { opacity: 1, transform: "none" } : {}) }}
          >
            <div className="flex items-baseline justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-data text-[10px] text-steel">{f.id.toUpperCase()}</span>
                  <h3 className="truncate text-[13px] font-medium text-bone">{f.label}</h3>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-steel">{f.note}</p>
              </div>
              <span
                className="font-data text-[14px] font-semibold tabular-nums"
                style={{ color }}
                aria-label={`${f.points > 0 ? "adds" : f.points < 0 ? "costs" : "no effect"} ${Math.abs(f.points)} points`}
              >
                {f.points > 0 ? `+${f.points}` : f.points < 0 ? f.points : "±0"}
              </span>
            </div>
            <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-ink-4">
              <div
                className="h-full origin-left rounded-full"
                style={{
                  width: `${width}%`,
                  transform: settled ? "scaleX(1)" : "scaleX(0)",
                  transformOrigin: "left",
                  background: color,
                  transition: `transform 800ms cubic-bezier(0.16,1,0.3,1) ${260 + i * 70}ms`,
                  opacity: f.points === 0 ? 0.25 : 0.9,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function FactorLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <PlateLabel>Reading: each factor moves the odds</PlateLabel>
      <span className="inline-flex items-center gap-1.5 font-data text-[10px] text-go">+ adds</span>
      <span className="inline-flex items-center gap-1.5 font-data text-[10px] text-stop">− costs</span>
    </div>
  );
}
