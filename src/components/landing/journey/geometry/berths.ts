// A 3A coach drawn in plan, from prototype v3's berths.js: nine bays between the end corridors, each bay two stacks
// of three berths across the aisle and a side pair along it. Drawing units match the plan's viewBox (0 0 640 142).

export const BAYS = 9;
const BAY_X0 = 58;
const BAY_X1 = 578;
export const BAY_WIDTH = (BAY_X1 - BAY_X0) / BAYS;

export interface BerthSeat {
  readonly bay: number;
  readonly place: "stack" | "side";
  readonly stack: 0 | 1;
}

/** "12 LB" → 12. A label without a leading number has none. */
export function berthNumber(label: string): number | null {
  const match = /^(\d+)\b/.exec(label.trim());
  return match ? Number(match[1]) : null;
}

/** Where berth n sits: bay ⌊(n−1)/8⌋; offsets 0–2 and 3–5 are the two stacks, 6–7 the side pair. */
export function berthSeat(n: number): BerthSeat | null {
  if (!Number.isInteger(n) || n < 1 || n > BAYS * 8) return null;
  const bay = Math.floor((n - 1) / 8);
  const offset = (n - 1) % 8;
  if (offset >= 6) return { bay, place: "side", stack: 0 };
  return { bay, place: "stack", stack: offset < 3 ? 0 : 1 };
}

export interface PlanPart {
  readonly x: number;
  readonly label: string;
  readonly lit: boolean;
}

export interface PlanBay {
  readonly x0: number;
  readonly stacks: readonly [PlanPart, PlanPart];
  readonly side: PlanPart & { readonly width: number };
}

export interface CoachPlan {
  readonly bays: readonly PlanBay[];
  /** Where the lit berth's tag is centred, or null when nothing is lit. */
  readonly tagX: number | null;
}

export function coachPlan(lit: BerthSeat | null): CoachPlan {
  const bays = Array.from({ length: BAYS }, (_, b): PlanBay => {
    const x0 = BAY_X0 + b * BAY_WIDTH;
    const first = 8 * b + 1;
    const here = lit?.bay === b;
    return {
      x0,
      stacks: [
        { x: x0 + 4, label: `${first}·${first + 1}·${first + 2}`, lit: here && lit.place === "stack" && lit.stack === 0 },
        { x: x0 + BAY_WIDTH - 26, label: `${first + 3}·${first + 4}·${first + 5}`, lit: here && lit.place === "stack" && lit.stack === 1 },
      ],
      side: { x: x0 + 6, width: BAY_WIDTH - 12, label: `${first + 6}·${first + 7}`, lit: here && lit.place === "side" },
    };
  });
  const litBay = lit ? bays[lit.bay] : undefined;
  const tagX = !lit || !litBay ? null : lit.place === "side" ? litBay.side.x + litBay.side.width / 2 : litBay.stacks[lit.stack].x + 11;
  return { bays, tagX };
}
