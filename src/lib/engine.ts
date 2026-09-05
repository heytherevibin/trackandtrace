import {
  CLASS_PROFILES,
  DAY_FACTOR,
  QUOTA_PROFILES,
  pickTrain,
} from "./catalog";
import {
  addDaysIST,
  fmtDayShort,
  hoursBetween,
  istDateKey,
  istFromWall,
  istNow,
  istWeekday,
} from "./time";
import type {
  BookingClass,
  Confidence,
  Factor,
  HistoryPoint,
  PnrOutcome,
  PnrResult,
  PnrSnapshot,
  Quota,
  Recommendation,
  TicketStatus,
  TrainProfile,
  TrendDay,
} from "./types";

// ---------------------------------------------------------------------------
// Deterministic seeded PRNG — the same PNR always yields the same demo world.
// ---------------------------------------------------------------------------

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Public validators / formatters
// ---------------------------------------------------------------------------

export function normalizePnr(input: string): string {
  return input.replace(/\D/g, "").slice(0, 10);
}

export function isValidPnr(input: string): boolean {
  return /^[2-9]\d{9}$/.test(input);
}

export function formatPnr(pnr: string): string {
  const p = pnr.replace(/\D/g, "");
  if (p.length <= 3) return p;
  if (p.length <= 6) return `${p.slice(0, 3)} ${p.slice(3)}`;
  return `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`;
}

export const DEMO_PNRS: Record<string, string> = {
  "2345678901": "Confirmed · 3A · Rajdhani corridor",
  "8765432109": "RAC 6 · improving, watch the window",
  "4567890123": "WL 46 · beyond the horizon, high risk",
  "7890123456": "RAC 3 · 2A · momentum in play",
};

// ---------------------------------------------------------------------------
// Pinned demo stories (override the pure hash world so the showcase PNRs tell
// coherent, instructive stories)
// ---------------------------------------------------------------------------

interface Archetype {
  trainIdx: number;
  cls: BookingClass;
  quota: Quota;
  daysAhead: number;
  status: TicketStatus;
  position: number | null;
  pax: number;
}

const PINNED: Record<string, Archetype> = {
  "2345678901": {
    trainIdx: 0,
    cls: "3A",
    quota: "GN",
    daysAhead: 2,
    status: "CNF",
    position: null,
    pax: 2,
  },
  "8765432109": {
    trainIdx: 1,
    cls: "3A",
    quota: "PQWL",
    daysAhead: 4,
    status: "RAC",
    position: 6,
    pax: 1,
  },
  "4567890123": {
    trainIdx: 3,
    cls: "SL",
    quota: "GN",
    daysAhead: 3,
    status: "WL",
    position: 46,
    pax: 1,
  },
  "7890123456": {
    trainIdx: 0,
    cls: "2A",
    quota: "GN",
    daysAhead: 2,
    status: "RAC",
    position: 3,
    pax: 2,
  },
};

// ---------------------------------------------------------------------------
// World builder
// ---------------------------------------------------------------------------

function pickArchetype(pnr: string, rng: () => number): Archetype {
  const pinned = PINNED[pnr];
  if (pinned) return pinned;
  const trainIdx = Math.floor(rng() * 8);
  const classRoll = rng();
  const cls: BookingClass =
    classRoll < 0.32 ? "3A" : classRoll < 0.52 ? "SL" : classRoll < 0.7 ? "2A" : classRoll < 0.82 ? "CC" : classRoll < 0.92 ? "1A" : "2S";
  const quotaRoll = rng();
  const quota: Quota =
    quotaRoll < 0.58
      ? "GN"
      : quotaRoll < 0.72
        ? "PQWL"
        : quotaRoll < 0.84
          ? "RLWL"
          : quotaRoll < 0.92
            ? "TQWL"
            : quotaRoll < 0.97
              ? "LD"
              : "TQ";
  const statusRoll = rng();
  const status: TicketStatus = statusRoll < 0.34 ? "CNF" : statusRoll < 0.6 ? "RAC" : "WL";
  const horizon = CLASS_PROFILES[cls].horizon;
  let position: number | null = null;
  if (status === "WL") {
    position = 1 + Math.floor(rng() * horizon * 1.35);
  } else if (status === "RAC") {
    position = 1 + Math.floor(rng() * Math.max(6, Math.floor(horizon * 0.35)));
  }
  return {
    trainIdx,
    cls,
    quota,
    daysAhead: 1 + Math.floor(rng() * 6),
    status,
    position,
    pax: status === "CNF" ? 1 + Math.floor(rng() * 3) : 1 + Math.floor(rng() * 2),
  };
}

function buildSnapshot(pnr: string, arch: Archetype, now: Date): PnrSnapshot {
  const train: TrainProfile = pickTrain(arch.trainIdx);
  const journey = addDaysIST(now, arch.daysAhead);
  const [dh, dm] = train.depTime.split(":").map(Number);
  const dep = istFromWall(journey.getUTCFullYear(), journey.getUTCMonth() + 1, journey.getUTCDate(), dh, dm);
  const chart = new Date(dep.getTime() - 4 * 3_600_000);

  const coaches = ["A1", "A2", "B1", "B2", "B3", "S1", "S2", "S3", "S4", "S5", "S6"];

  const rng = mulberry32(hashString(pnr + ":pax"));

  const pax = Array.from({ length: arch.pax }, (_, i) => {
    const coach =
      arch.status === "CANCELLED" ? undefined : coaches[Math.floor(rng() * coaches.length)];
    const berth = arch.status === "CANCELLED" ? undefined : String(1 + Math.floor(rng() * 64));
    const extra = i === 0 ? 0 : arch.status === "WL" ? 1 + Math.floor(rng() * 3) : arch.status === "RAC" ? 1 : 0;
    return {
      index: i + 1,
      bookingStatus: arch.status,
      currentStatus: arch.status,
      position: arch.position !== null && arch.status !== "CNF" ? arch.position + extra : undefined,
      coach,
      berth,
      quota: arch.quota,
    };
  });

  const chartP = istPartsOf(chart);
  return {
    pnr,
    train,
    cls: arch.cls,
    journeyDate: istDateKey(journey),
    journeyDateLabel: fmtDayShort(journey),
    chartTime: `${chartP.h}:${chartP.m}`,
    chartAt: chart.toISOString(),
    passengerCount: arch.pax,
    pax,
    source: "demo",
  };
}

function istPartsOf(d: Date) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of f.formatToParts(d)) if (p.type !== "literal") parts[p.type] = p.value;
  return { h: parts.hour, m: parts.minute };
}

// ---------------------------------------------------------------------------
// The prediction pipeline
// ---------------------------------------------------------------------------

export function predict(
  status: TicketStatus,
  position: number | null,
  cls: BookingClass,
  quota: Quota,
  hoursToChart: number,
  weekday: number,
  history: HistoryPoint[]
): { probability: number; confidence: Confidence; recommendation: Recommendation; note: string; factors: Factor[] } {
  const cp = CLASS_PROFILES[cls];
  const qp = QUOTA_PROFILES[quota];
  const factors: Factor[] = [];

  const addFactor = (id: string, label: string, points: number, note: string) => {
    if (Math.abs(points) < 0.5) return;
    factors.push({
      id,
      label,
      points: Math.round(points),
      note,
      kind: points > 0 ? "positive" : points < 0 ? "negative" : "neutral",
    });
  };

  if (status === "CNF") {
    factors.push({ id: "cnf", label: "Seat confirmed", points: 46, note: "Chart-locked berth already allotted.", kind: "positive" });
    factors.push({ id: "quota", label: `${quota} quota`, points: 0, note: qp.label, kind: "neutral" });
    factors.push({ id: "wl-pos", label: "Waitlist position", points: 0, note: "—", kind: "neutral" });
    factors.push({ id: "time", label: "Time to chart", points: 0, note: "Confirmed before chart — unaffected.", kind: "neutral" });
    return {
      probability: 97,
      confidence: "high",
      recommendation: "Confirmed",
      note: "Your berth is allotted. Chart preparation will not change this seat.",
      factors,
    };
  }

  const positionEff = position ?? cp.horizon + 1;
  let sum = 50 + qp.baseOffset;

  // Waitlist position vs this train/class confirmation horizon.
  // RAC and WL score differently: RAC already holds a berth-side claim, so
  // position matters less and the RAC base does the work.
  const inside = Math.max(0, 1 - positionEff / (cp.horizon + 1));
  let ppPosition: number;
  if (status === "RAC") {
    ppPosition = inside * 22 * 0.2;
    addFactor(
      "wl-pos",
      "RAC position",
      ppPosition,
      `${cls} RAC ${positionEff} — side berth at chart, position feeds the queue.`
    );
  } else if (positionEff <= cp.horizon) {
    ppPosition = inside * 22;
    addFactor(
      "wl-pos",
      "Position within horizon",
      ppPosition,
      `${cls} on this corridor clears to about WL ${cp.horizon} at chart.`
    );
  } else {
    const over = positionEff - cp.horizon;
    ppPosition = -Math.min(26, 6 + over * 3);
    addFactor(
      "wl-pos",
      "Beyond confirmation horizon",
      ppPosition,
      `History on this ${cls} rarely clears past WL ${cp.horizon}; you are ${over} beyond.`
    );
  }

  // Demand day-of-week.
  const ppDay = (DAY_FACTOR[weekday] - 1) * 120;
  addFactor(
    "day",
    "Departure-day demand",
    ppDay,
    DAY_FACTOR[weekday] >= 1
      ? `This is a heavy travel day on the corridor.`
      : `Light demand day — slightly more room to move.`
  );

  // Time window to chart — the dominant clock.
  let ppTime: number;
  if (hoursToChart > 96) {
    ppTime = -6;
    addFactor("time", "Far from chart", ppTime, "Movement concentrates in the last 72h — too early to call.");
  } else if (hoursToChart > 24) {
    ppTime = Math.min(12, (hoursToChart - 10) * 0.35);
    addFactor("time", "Movement window open", ppTime, `${Math.round(hoursToChart)}h remain; WL/RAC churn is at its most active.`);
  } else if (hoursToChart > 6) {
    ppTime = status === "RAC" ? 8 : 2;
    addFactor("time", "Final approach", ppTime, "Inside the last hours — decisions are being made against the chart right now.");
  } else {
    ppTime = status === "RAC" ? -2 : -14;
    addFactor("time", "Chart imminent", ppTime, "Chart closes shortly; un-cleared positions settle as-is.");
  }

  // Class occupancy pressure.
  const ppOcc = (0.82 - cp.occupancy) * 60;
  addFactor("class", `${cls} occupancy`, ppOcc, cp.occupancy > 0.85 ? "Berth pressure is high in this class." : "This class has comparative slack.");

  // Momentum from the watchlist history.
  if (history.length >= 2) {
    const prev = history[history.length - 2];
    const last = history[history.length - 1];
    const improve =
      prev.position !== null && last.position !== null && last.position < prev.position;
    const worsen =
      prev.position !== null && last.position !== null && last.position > prev.position;
    if (improve) {
      addFactor("momentum", "Moving up between checks", 7, `WL ${prev.position} → ${last.position} since your last check.`);
    } else if (worsen) {
      addFactor("momentum", "Slipped since last check", -6, `WL ${prev.position} → ${last.position}. Demand is ahead of you.`);
    } else {
      addFactor("momentum", "Holding position", 1, "No movement since the last check — typical between polling windows.");
    }
  } else if (status === "RAC") {
    addFactor("rac-base", "RAC berth standing", 2, "RAC holds a side-berth claim at chart; only cancellation pushes it to WL.");
  }

  const raw = sum + ppPosition + ppDay + ppTime + ppOcc;
  const clamped = Math.min(97, Math.max(3, raw));
  const probability = Math.round(clamped);

  // status cannot be CNF here (handled above); confidence follows the clock.
  const confidence: Confidence = hoursToChart < 18 ? "high" : hoursToChart < 72 ? "medium" : "low";

  let recommendation: Recommendation;
  let note: string;
  if (probability >= 82) {
    recommendation = "Likely to confirm";
    note = "Strong position — expect confirmation as the chart window works.";
  } else if (probability >= 62) {
    recommendation = "Watch — improving";
    note = "Decent odds, still moving. Keep an eye on the final 48 hours.";
  } else if (probability >= 40) {
    recommendation = "Watch — risky";
    note = "A coin-flip at best. Have a plan B for this journey.";
  } else {
    recommendation = "High risk";
    note = "History and position are against this ticket. Book an alternate if the journey is critical.";
  }

  return { probability, confidence, recommendation, note, factors };
}

// ---------------------------------------------------------------------------
// Modelled 5-day trend (train/class prior — labeled "modelled trend", never
// claimed as tracked real-world counts until the community ledger ships)
// ---------------------------------------------------------------------------

function buildTrend(pnr: string, cls: BookingClass, daysAhead: number): TrendDay[] {
  const rng = mulberry32(hashString(pnr + ":trend"));
  const cp = CLASS_PROFILES[cls];
  const baseRate = Math.max(0.32, Math.min(0.94, 1.06 - cp.occupancy));
  const days: TrendDay[] = [];
  for (let i = daysAhead + 4; i >= daysAhead; i--) {
    const d = addDaysIST(istNow(), -i);
    const total = 12 + Math.floor(rng() * 10);
    const wobble = (rng() - 0.5) * 0.16;
    const confirmed = Math.round(total * Math.max(0.1, baseRate + wobble));
    days.push({
      date: istDateKey(d),
      dayLabel: new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", weekday: "short" }).format(d),
      confirmed,
      total,
    });
  }
  return days;
}

// ---------------------------------------------------------------------------
// The check — public entry point
// ---------------------------------------------------------------------------

export function checkPnr(pnrInput: string, history: HistoryPoint[] = []): PnrOutcome {
  const pnr = normalizePnr(pnrInput);
  if (!isValidPnr(pnr)) {
    return {
      ok: false,
      code: "INVALID",
      message: "A PNR is 10 digits and never starts with 0 or 1.",
    };
  }
  if (pnr === "9999999999") {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "No reservation found for this number.",
    };
  }

  const now = istNow();
  const rng = mulberry32(hashString(pnr));
  const arch = pickArchetype(pnr, rng);
  const snapshot = buildSnapshot(pnr, arch, now);

  const chartAt = new Date(snapshot.chartAt);
  const hoursToChart = hoursBetween(now, chartAt);
  const weekday = istWeekday(now);

  const lead = snapshot.pax[0];
  const pred = predict(
    lead.currentStatus,
    lead.position ?? null,
    arch.cls,
    lead.quota,
    hoursToChart,
    weekday,
    history
  );

  const result: PnrResult = {
    snapshot,
    prediction: pred,
    lead: {
      status: lead.currentStatus,
      position: lead.position ?? null,
      coach: lead.coach,
      berth: lead.berth,
      quota: lead.quota,
    },
    trend: buildTrend(pnr, arch.cls, arch.daysAhead),
    hoursToChart,
    checkedAt: now.toISOString(),
  };
  return { ok: true, result };
}

