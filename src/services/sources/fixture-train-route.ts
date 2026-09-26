import { messages } from "@/messages";
import type { TrainRouteOutcome, TrainRouteRequest, TrainRouteSource, TrainStop } from "@/services/train-route-source";
import { unavailable } from "./outcome";

// Sample runs, so the route popover can be driven end to end without the provider.
//
// Long enough to MATTER: the list collapses its middle above a handful of stops, and a fixture with
// three stations could never show that, nor the expand that undoes it. 12627 therefore carries
// fourteen, which is the shape a real run has.

/** Builds a run from tuples, so the interesting fields stay readable. */
function run(stops: readonly (readonly [string, string, string | null, string | null, number, number])[]): readonly TrainStop[] {
  return stops.map(([code, name, arrival, departure, distanceKm, day]) => ({
    code,
    name,
    arrival,
    departure,
    haltMinutes: arrival === null || departure === null ? 0 : 2,
    distanceKm,
    day,
    platform: null,
  }));
}

const KARNATAKA = run([
  ["MYS", "Mysuru Jn", null, "14:15", 0, 1],
  ["MYA", "Mandya", "14:52", "14:54", 44, 1],
  ["SBC", "KSR Bengaluru", "16:20", "16:30", 139, 1],
  ["TK", "Tumakuru", "17:28", "17:30", 209, 1],
  ["DVG", "Davangere", "20:05", "20:07", 405, 1],
  ["UBL", "Hubballi Jn", "22:35", "22:45", 552, 1],
  ["BGM", "Belagavi", "01:05", "01:07", 725, 2],
  ["MRJ", "Miraj Jn", "03:30", "03:35", 862, 2],
  ["PUNE", "Pune Jn", "07:10", "07:20", 1105, 2],
  ["KYN", "Kalyan Jn", "10:45", "10:47", 1268, 2],
  ["BSL", "Bhusaval Jn", "15:20", "15:30", 1550, 2],
  ["BPL", "Bhopal Jn", "21:40", "21:50", 1877, 2],
  ["JHS", "Jhansi Jn", "01:25", "01:35", 2168, 3],
  ["NDLS", "New Delhi", "06:10", null, 2444, 3],
]);

const RAJDHANI = run([
  ["SBC", "KSR Bengaluru", null, "20:20", 0, 1],
  ["SC", "Secunderabad Jn", "05:45", "05:55", 612, 2],
  ["NGP", "Nagpur", "12:30", "12:35", 1187, 2],
  ["BPL", "Bhopal Jn", "17:05", "17:10", 1577, 2],
  ["NZM", "Hazrat Nizamuddin", "05:30", "05:40", 2365, 3],
  ["JAT", "Jammu Tawi", "16:40", null, 2960, 3],
]);

const RUNS: Readonly<Record<string, { readonly name: string; readonly stops: readonly TrainStop[] }>> = {
  "12627": { name: "KARNATAKA EXP", stops: KARNATAKA },
  "22691": { name: "RAJDHANI EXP", stops: RAJDHANI },
};

export const fixtureTrainRouteSource: TrainRouteSource = {
  async check(request: TrainRouteRequest): Promise<TrainRouteOutcome> {
    const found = RUNS[request.trainNo.trim()];
    // Not a sample train: the sample provider could not answer. Never an empty run, which is the
    // one shape that would read as a train calling nowhere. 00629 is deliberately absent, so the
    // page's "could not answer" path has cover too.
    if (!found) return unavailable(messages.source.route.couldNotAnswer, "server");
    return { ok: true, answer: { trainNo: request.trainNo.trim(), trainName: found.name, stops: found.stops, retrievedAt: new Date().toISOString() } };
  },
};
