import type { BookingClass, TrainProfile } from "@/types/domain";

// Public timetable entries used only by the labelled sample source. Distances
// and durations are approximate sample values, not an authority.

const NDLS = { code: "NDLS", city: "New Delhi", state: "Delhi" } as const;
const BCT = { code: "BCT", city: "Mumbai Central", state: "Maharashtra" } as const;

export const FIXTURE_TRAINS: readonly TrainProfile[] = [
  { number: "12951", name: "Mumbai Rajdhani", from: BCT, to: NDLS, depTime: "17:00", durationHours: 15.5, distanceKm: 1384, runsOn: 127 },
  { number: "12301", name: "Howrah Rajdhani", from: { code: "HWH", city: "Howrah", state: "West Bengal" }, to: NDLS, depTime: "16:55", durationHours: 17.2, distanceKm: 1447, runsOn: 127 },
  { number: "12621", name: "Tamil Nadu Express", from: { code: "MAS", city: "Chennai Central", state: "Tamil Nadu" }, to: NDLS, depTime: "22:00", durationHours: 33, distanceKm: 2180, runsOn: 127 },
  { number: "12627", name: "Karnataka Express", from: { code: "SBC", city: "Bengaluru", state: "Karnataka" }, to: NDLS, depTime: "19:20", durationHours: 39.5, distanceKm: 2444, runsOn: 127 },
  { number: "12009", name: "Shatabdi Express", from: BCT, to: { code: "ADI", city: "Ahmedabad", state: "Gujarat" }, depTime: "06:25", durationHours: 6.5, distanceKm: 491, runsOn: 63 },
];

/** Classes each sample train actually carries, so a sample never shows a sleeper on a day train. */
export const FIXTURE_CLASSES: readonly (readonly BookingClass[])[] = [
  ["3A", "2A", "1A"],
  ["3A", "2A", "1A"],
  ["SL", "3A", "2A", "1A", "2S"],
  ["SL", "3A", "2A", "1A", "2S"],
  ["CC", "EC"],
];
