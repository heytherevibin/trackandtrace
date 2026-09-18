// Shared domain model for verified railway responses.

/** IRCTC quota and waitlist-quota codes a reservation record can carry. */
export type Quota =
  | "GN" | "TQ" | "PT" | "LD" | "SS" | "HP" | "DF" | "DP" | "FT" | "YU" | "PH" | "RS" | "CK" | "RC" | "OS"
  | "PQWL" | "RLWL" | "TQWL" | "RSWL" | "RQWL" | "CKWL";
/** IRCTC travel classes a reservation record can carry. */
export type BookingClass = "1A" | "2A" | "3A" | "3E" | "SL" | "CC" | "EC" | "EA" | "EV" | "FC" | "2S" | "VS";

export type TicketStatus = "CNF" | "RAC" | "WL" | "CANCELLED" | "NOT_FOUND";
export type Confidence = "high" | "medium" | "low";
export type Recommendation = "Confirmed" | "Likely to confirm" | "Watch — improving" | "Watch — risky" | "High risk";

export interface Station {
  code: string;
  /** Station or city name, when the source sends one. */
  city?: string;
  state?: string;
}

// Optional fields are ones a source may not return; the UI says "Not returned" and never estimates them.
export interface TrainProfile {
  number: string;
  name?: string;
  from: Station;
  to: Station;
  depTime?: string;
  durationHours?: number;
  distanceKm?: number;
  runsOn?: number;
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

/**
 * live: a verified railway provider · railkit: the third-party RailKit API (railkit.in) · rapidapi: the
 * third-party RapidAPI "IRCTC" API · fixture: labelled sample data.
 */
export type PnrSource = "live" | "fixture" | "rapidapi" | "railkit";

export interface PnrSnapshot {
  pnr: string;
  train: TrainProfile;
  cls: BookingClass;
  journeyDate: string;
  journeyDateLabel: string;
  chartTime?: string;
  chartAt?: string;
  /** Whether the reservation chart is prepared, as the source reports it. */
  chartPrepared?: boolean;
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
  hoursToChart?: number;
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
