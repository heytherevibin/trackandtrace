// Shared domain model for verified railway responses.

export type Quota = "GN" | "PQWL" | "RLWL" | "TQWL" | "LD" | "TQ";
export type BookingClass = "1A" | "2A" | "3A" | "SL" | "CC" | "EC" | "2S";

export type TicketStatus = "CNF" | "RAC" | "WL" | "CANCELLED" | "NOT_FOUND";
export type Confidence = "high" | "medium" | "low";
export type Recommendation = "Confirmed" | "Likely to confirm" | "Watch — improving" | "Watch — risky" | "High risk";

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
  depTime: string;
  durationHours: number;
  distanceKm: number;
  runsOn: number;
}

export interface PassengerSeat {
  index: number;
  name?: string;
  bookingStatus: TicketStatus;
  currentStatus: TicketStatus;
  position?: number;
  coach?: string;
  berth?: string;
  quota: Quota;
}

export interface HistoryPoint {
  at: string;
  status: TicketStatus;
  position: number | null;
  probability?: number;
}

export interface TrendDay {
  date: string;
  dayLabel: string;
  confirmed: number;
  total: number;
}

export interface Factor {
  id: string;
  label: string;
  points: number;
  note: string;
  kind: "positive" | "negative" | "neutral";
}

export interface Prediction {
  probability: number;
  confidence: Confidence;
  recommendation: Recommendation;
  note: string;
  factors: Factor[];
}

export type PnrSource = "live" | "fixture";

export interface PnrSnapshot {
  pnr: string;
  train: TrainProfile;
  cls: BookingClass;
  journeyDate: string;
  journeyDateLabel: string;
  chartTime: string;
  chartAt: string;
  passengerCount: number;
  pax: PassengerSeat[];
  source: PnrSource;
}

export interface PnrResult {
  snapshot: PnrSnapshot;
  prediction?: Prediction;
  lead: {
    status: TicketStatus;
    position: number | null;
    coach?: string;
    berth?: string;
    quota: Quota;
  };
  trend?: TrendDay[];
  hoursToChart: number;
  checkedAt: string;
}

export type SourceErrorCode = "INVALID" | "NOT_FOUND" | "SOURCE_UNAVAILABLE" | "RATE_LIMITED";

export type PnrOutcome =
  | { ok: true; result: PnrResult }
  | { ok: false; code: SourceErrorCode; message: string; retryAfter?: number };

export interface WatchlistEntry {
  pnr: string;
  label: string;
  addedAt: string;
  checks: HistoryPoint[];
}
