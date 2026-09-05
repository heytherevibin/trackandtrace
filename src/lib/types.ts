// Shared domain model — pure types, no runtime deps.

export type Quota = "GN" | "PQWL" | "RLWL" | "TQWL" | "LD" | "TQ";
export type BookingClass =
  | "1A"
  | "2A"
  | "3A"
  | "SL"
  | "CC"
  | "EC"
  | "2S";

export type TicketStatus =
  | "CNF"
  | "RAC"
  | "WL"
  | "CANCELLED"
  | "NOT_FOUND";

export type Confidence = "high" | "medium" | "low";

export type Recommendation =
  | "Confirmed"
  | "Likely to confirm"
  | "Watch — improving"
  | "Watch — risky"
  | "High risk";

export interface Station {
  code: string;
  city: string;
  state: string;
}

export interface TrainProfile {
  number: string;
  name: string;
  from: Station;
  to: Station;
  /** Scheduled departure, IST "HH:MM" */
  depTime: string;
  durationHours: number;
  /** Typical distance, km */
  distanceKm: number;
  /** Trains run weekly — bitmask, 1 = Mon */
  runsOn: number;
}

export interface PassengerSeat {
  index: number;
  name?: string;
  bookingStatus: TicketStatus;
  currentStatus: TicketStatus;
  /** WL or RAC number when applicable */
  position?: number;
  coach?: string;
  berth?: string;
  quota: Quota;
}

export interface HistoryPoint {
  /** ISO instant */
  at: string;
  status: TicketStatus;
  /** WL/RAC number at that check */
  position: number | null;
  probability: number;
}

export interface TrendDay {
  /** ISO date (IST) */
  date: string;
  dayLabel: string;
  confirmed: number;
  total: number;
}

export interface Factor {
  id: string;
  label: string;
  /** Contribution in percentage points, signed */
  points: number;
  note: string;
  kind: "positive" | "negative" | "neutral";
}

export interface Prediction {
  probability: number;
  confidence: Confidence;
  recommendation: Recommendation;
  /** One-sentence human read of the recommendation. */
  note: string;
  factors: Factor[];
}

export interface PnrSnapshot {
  pnr: string;
  train: TrainProfile;
  cls: BookingClass;
  journeyDate: string;
  journeyDateLabel: string;
  /** IST "HH:MM" */
  chartTime: string;
  /** ISO instant */
  chartAt: string;
  passengerCount: number;
  pax: PassengerSeat[];
  source: "live" | "demo";
}

export interface PnrResult {
  snapshot: PnrSnapshot;
  prediction: Prediction;
  /** Per-passenger current state for the lead passenger (first pax) */
  lead: {
    status: TicketStatus;
    position: number | null;
    coach?: string;
    berth?: string;
    quota: Quota;
  };
  trend: TrendDay[];
  /** Time remaining to chart at check time */
  hoursToChart: number;
  checkedAt: string;
}

export type SourceErrorCode =
  | "INVALID"
  | "NOT_FOUND"
  | "SOURCE_UNAVAILABLE"
  | "RATE_LIMITED";

export type PnrOutcome =
  | { ok: true; result: PnrResult }
  | { ok: false; code: SourceErrorCode; message: string };

export interface WatchlistEntry {
  pnr: string;
  label: string;
  addedAt: string;
  checks: HistoryPoint[];
}
