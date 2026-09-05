import type { BookingClass, Quota, TrainProfile } from "./types";

// ---------------------------------------------------------------------------
// DEMO CATALOG — modelled priors for the labeled synthetic engine.
// Train names/routes are plausible placeholders on real intercity corridors;
// nothing here is a factual claim about any real train's behaviour. Every
// surface that renders this data carries the "Demo prediction" provenance.
// ---------------------------------------------------------------------------

export interface ClassProfile {
  /** Confirmation horizon — WL positions beyond this historically rarely confirm */
  horizon: number;
  /** Base occupancy 0..1 (higher = tougher) */
  occupancy: number;
}

export interface QuotaProfile {
  /** Base advantage in pp vs GN */
  baseOffset: number;
  label: string;
}

export const CLASS_PROFILES: Record<BookingClass, ClassProfile> = {
  "1A": { horizon: 6, occupancy: 0.55 },
  "2A": { horizon: 14, occupancy: 0.72 },
  "3A": { horizon: 26, occupancy: 0.81 },
  SL: { horizon: 40, occupancy: 0.9 },
  CC: { horizon: 12, occupancy: 0.78 },
  EC: { horizon: 4, occupancy: 0.5 },
  "2S": { horizon: 60, occupancy: 0.93 },
};

export const QUOTA_PROFILES: Record<Quota, QuotaProfile> = {
  GN: { baseOffset: 0, label: "General" },
  PQWL: { baseOffset: 4, label: "Pooled quota" },
  RLWL: { baseOffset: 3, label: "Remote location" },
  TQWL: { baseOffset: -5, label: "Tatkal" },
  LD: { baseOffset: 2, label: "Ladies" },
  TQ: { baseOffset: -5, label: "Tatkal" },
};

/** Demand multiplier by IST weekday (0 Sun … 6 Sat). */
export const DAY_FACTOR: Record<number, number> = {
  0: 1.04, // Sunday return rush
  1: 0.98,
  2: 0.96,
  3: 0.95,
  4: 1.0,
  5: 1.07, // weekend start
  6: 1.02,
};

export const TRAIN_CATALOG: TrainProfile[] = [
  {
    number: "12952",
    name: "MUMBAI RAJDHANI",
    from: { code: "MMCT", city: "Mumbai Central", state: "MH" },
    to: { code: "NDLS", city: "New Delhi", state: "DL" },
    depTime: "17:10",
    durationHours: 15.6,
    distanceKm: 1384,
    runsOn: 0b1111111,
  },
  {
    number: "12625",
    name: "KERALA EXPRESS",
    from: { code: "TVC", city: "Thiruvananthapuram", state: "KL" },
    to: { code: "NDLS", city: "New Delhi", state: "DL" },
    depTime: "11:15",
    durationHours: 61.5,
    distanceKm: 2950,
    runsOn: 0b1111111,
  },
  {
    number: "12903",
    name: "GOLDEN TEMPLE MAIL",
    from: { code: "MMCT", city: "Mumbai Central", state: "MH" },
    to: { code: "ASR", city: "Amritsar", state: "PB" },
    depTime: "21:40",
    durationHours: 31.5,
    distanceKm: 1933,
    runsOn: 0b1111111,
  },
  {
    number: "12839",
    name: "CHENNAI MAIL",
    from: { code: "HWH", city: "Howrah", state: "WB" },
    to: { code: "MAS", city: "Chennai Central", state: "TN" },
    depTime: "19:05",
    durationHours: 26.5,
    distanceKm: 1659,
    runsOn: 0b1111111,
  },
  {
    number: "12009",
    name: "SHATABDI EXPRESS",
    from: { code: "MMCT", city: "Mumbai Central", state: "MH" },
    to: { code: "ADI", city: "Ahmedabad", state: "GJ" },
    depTime: "06:25",
    durationHours: 7.2,
    distanceKm: 493,
    runsOn: 0b1100011,
  },
  {
    number: "12301",
    name: "HOWRAH RAJDHANI",
    from: { code: "HWH", city: "Howrah", state: "WB" },
    to: { code: "NDLS", city: "New Delhi", state: "DL" },
    depTime: "16:50",
    durationHours: 17.2,
    distanceKm: 1451,
    runsOn: 0b1111111,
  },
  {
    number: "11019",
    name: "KONARK EXPRESS",
    from: { code: "CSMT", city: "Mumbai CST", state: "MH" },
    to: { code: "BBS", city: "Bhubaneswar", state: "OD" },
    depTime: "15:35",
    durationHours: 34.0,
    distanceKm: 1968,
    runsOn: 0b1111111,
  },
  {
    number: "22691",
    name: "RAJDHANI EXPRESS",
    from: { code: "SBC", city: "Bengaluru", state: "KA" },
    to: { code: "NDLS", city: "New Delhi", state: "DL" },
    depTime: "20:00",
    durationHours: 33.0,
    distanceKm: 2366,
    runsOn: 0b1111111,
  },
];

export function pickTrain(index: number): TrainProfile {
  return TRAIN_CATALOG[index % TRAIN_CATALOG.length];
}
