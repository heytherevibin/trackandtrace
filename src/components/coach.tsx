"use client";

import { useMemo } from "react";

/** A 3A coach, side-elevation: 8 bays × 8 berths (64). Simplified
    occupancy visual for the demo engine — deterministic per PNR. */

function seededFill(pnr: string): Set<number> {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < pnr.length; i++) {
    h ^= pnr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const set = new Set<number>();
  for (let n = 1; n <= 64; n++) {
    if (rand() < 0.66) set.add(n);
  }
  return set;
}

function berthType(n: number): string {
  const inBay = (n - 1) % 8;
  if (inBay < 3) return ["LB", "MB", "UB"][inBay];
  return inBay === 3 ? "SU" : "SL";
}

export function CoachMap({
  pnr,
  yourBerth,
  coach,
  settled,
}: {
  pnr: string;
  yourBerth?: string;
  coach?: string;
  settled: boolean;
}) {
  const filled = useMemo(() => seededFill(pnr), [pnr]);
  const yourNum = yourBerth ? Number.parseInt(yourBerth, 10) : NaN;
  const bays = Array.from({ length: 8 }, (_, b) => b);
  const berths = Array.from({ length: 8 }, (_, i) => i);

  return (
    <div>
      <div className="flex items-center justify-between pb-3">
        <span className="font-data text-[12px] text-steel">
          COACH <span className="text-bone">{coach ?? "B3"}</span> · 3A · 64 BERTHS
        </span>
        <span className="inline-flex items-center gap-2 font-data text-[10px] tracking-[0.12em] text-steel">
          <span className="size-2 rounded-[2px] bg-ink-4" /> FREE
          <span className="size-2 rounded-[2px] bg-bone/25" /> OCCUPIED
          <span className="size-2 rounded-[2px] bg-go shadow-[0_0_8px_rgba(47,191,113,0.7)]" /> YOU
        </span>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-[540px] items-center gap-2 rounded-panel border border-(--line) bg-ink-2 p-2">
          {bays.map((b) => (
            <div key={b} className="flex flex-1 flex-col items-center gap-1">
              <span className="font-data text-[10px] text-steel/70">BAY {b + 1}</span>
              <div className="grid w-full grid-cols-2 gap-1" style={{ aspectRatio: "auto" }}>
                {berths.map((r) => {
                  const n = b * 8 + r + 1;
                  const isYou = n === yourNum;
                  const occ = filled.has(n);
                  const type = berthType(n);
                  return (
                    <div
                      key={n}
                      title={`${type} · berth ${n}`}
                      className={`flex items-center justify-center rounded-[3px] py-[5px] font-data text-[10px] transition-colors duration-300 ${
                        isYou
                          ? "bg-go text-ink-1 font-semibold shadow-[0_0_10px_rgba(47,191,113,0.65)]"
                          : occ
                            ? "bg-bone/25 text-bone-dim"
                            : "bg-ink-4 text-steel"
                      }`}
                    >
                      {n}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="pt-3 text-[11px] leading-relaxed text-steel">
        Occupancy shown is a demo reconstruction from this PNR's booking context — coach position and seat
        layout are indicative, settled by the actual chart.
      </p>
    </div>
  );
}
