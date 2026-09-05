import { CLASS_PROFILES, DAY_FACTOR, QUOTA_PROFILES, TRAIN_CATALOG } from "./catalog";
import { addDaysIST, fmtDayShort, hoursBetween, istFromWall, istWeekday, istDateKey } from "./time";
import type { BookingClass, Factor, Prediction, Quota, Recommendation, TrainProfile } from "./types";

export interface BookingContext {
  train: TrainProfile;
  cls: BookingClass;
  quota: Quota;
  daysAhead: number;
}

export interface ContextAnalysis {
  context: BookingContext;
  journeyDateLabel: string;
  hoursToChart: number;
  /** modelled lead position (WL/RAC) for this context */
  position: number;
  probability: number;
  recommendation: Recommendation;
  note: string;
  confidence: "high" | "medium" | "low";
  factors: Factor[];
}

function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rngOf(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function analyzeContext(ctx: BookingContext): ContextAnalysis {
  const { train, cls, quota, daysAhead } = ctx;
  const rng = rngOf(hash(`${train.number}|${cls}|${quota}|${daysAhead}`));
  const now = new Date();
  const journey = addDaysIST(now, daysAhead);
  const [dh, dm] = train.depTime.split(":").map(Number);
  const dep = istFromWall(journey.getUTCFullYear(), journey.getUTCMonth() + 1, journey.getUTCDate(), dh, dm);
  const chart = new Date(dep.getTime() - 4 * 3_600_000);
  const hoursToChart = hoursBetween(now, chart);
  const weekday = istWeekday(now);
  const cp = CLASS_PROFILES[cls];
  const qp = QUOTA_PROFILES[quota];

  // Modelled status at booking time for this context: mostly WL/RAC around the
  // horizon, occasionally confirmed, occasionally far beyond.
  const roll = rng();
  const isCnf = roll < 0.12;
  const isBeyond = roll > 0.9;
  const status = isCnf ? "CNF" : "WL";
  const basePos = isCnf
    ? 0
    : isBeyond
      ? Math.round(cp.horizon * (1.05 + rng() * 0.4))
      : Math.max(1, Math.round(cp.horizon * (0.18 + rng() * 0.62)));
  const position = isCnf ? 0 : basePos;

  const factors: Factor[] = [];
  const push = (id: string, label: string, points: number, note: string) => {
    if (Math.abs(points) < 0.5) return;
    factors.push({ id, label, points: Math.round(points), note, kind: points > 0 ? "positive" : points < 0 ? "negative" : "neutral" });
  };

  let prob: number;
  let recommendation: Recommendation;
  let note: string;

  if (isCnf) {
    prob = 96;
    recommendation = "Confirmed";
    note = "This context is confirming readily at booking — berths are available.";
    push("cnf", "Seat confirmed", 46, "Berth allotted at booking in this context.");
    push("quota", `${quota} quota`, 0, qp.label);
  } else {
    const inside = Math.max(0, 1 - position / (cp.horizon + 1));
    let sum = 50 + qp.baseOffset + inside * 26 + (DAY_FACTOR[weekday] - 1) * 120;
    if (position > cp.horizon) sum -= Math.min(28, 6 + (position - cp.horizon) * 3);
    push(
      position <= cp.horizon ? "wl-pos" : "wl-beyond",
      position <= cp.horizon ? "Starts inside the horizon" : "Starts beyond the horizon",
      position <= cp.horizon ? inside * 26 : -Math.min(28, 6 + (position - cp.horizon) * 3),
      position <= cp.horizon
        ? `At booking, this context typically opens around ${position}/${cp.horizon + 1} and history clears to ${cp.horizon}.`
        : `${position} vs a ${cp.horizon} horizon — this context books heavy.`
    );
    push(
      "time",
      hoursToChart > 96 ? "Early window" : hoursToChart > 24 ? "Movement window ahead" : "Final approach",
      hoursToChart > 96 ? -6 : Math.min(16, (hoursToChart - 10) * 0.5),
      `You have ${Math.max(1, Math.round(hoursToChart))}h to chart from the moment you book.`
    );
    push(
      "class",
      `${cls} pressure`,
      (0.82 - cp.occupancy) * 60,
      cp.occupancy > 0.85 ? "Berth pressure is high in this class." : "This class has comparative slack."
    );
    prob = Math.max(3, Math.min(97, Math.round(sum)));
    recommendation =
      prob >= 80
        ? "Likely to confirm"
        : prob >= 58
          ? "Watch — improving"
          : prob >= 40
            ? "Watch — risky"
            : "High risk";
    note =
      prob >= 80
        ? "A strong booking context — expect the waitlist to clear inside the window."
        : prob >= 58
          ? "Decent odds. Book if flexible; monitor after booking."
          : prob >= 40
            ? "Marginal. Only book if you can absorb a waitlist outcome."
            : "Weak context — prefer an alternate train, class, or date.";
  }

  const confidence = isCnf ? "high" : hoursToChart < 18 ? "high" : hoursToChart < 72 ? "medium" : "low";

  return {
    context: ctx,
    journeyDateLabel: fmtDayShort(journey),
    hoursToChart,
    position,
    probability: prob,
    recommendation,
    note,
    confidence,
    factors,
  };
}

export const TRAIN_OPTIONS = TRAIN_CATALOG.map((t) => ({
  value: t.number,
  label: `${t.number} · ${t.name} · ${t.from.code}→${t.to.code}`,
}));

export const CLASS_OPTIONS: { value: BookingClass; label: string }[] = [
  { value: "3A", label: "3A · AC 3-tier" },
  { value: "2A", label: "2A · AC 2-tier" },
  { value: "1A", label: "1A · AC First" },
  { value: "SL", label: "SL · Sleeper" },
  { value: "CC", label: "CC · AC Chair car" },
];

export const QUOTA_OPTIONS: { value: Quota; label: string }[] = [
  { value: "GN", label: "GN · General" },
  { value: "PQWL", label: "PQWL · Pooled" },
  { value: "RLWL", label: "RLWL · Remote location" },
  { value: "LD", label: "LD · Ladies" },
  { value: "TQWL", label: "TQWL · Tatkal" },
];
