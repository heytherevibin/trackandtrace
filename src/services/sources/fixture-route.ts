import type { RouteOutcome, RouteRequest, RouteSource } from "@/services/route-source";
import { readRunningDays } from "./railkit-route-parse";

// ---------------------------------------------------------------------------
// Sample trains for a route, so the pre-booking form can be driven end to end
// with no provider and no network — the sibling of `fixture.ts`, under the same
// rule: served only when the fixture source is explicitly chosen, never in
// production, and always behind the app's "Sample data" label.
//
// These rows are SAMPLE DATA. One pair answers, everything else answers with an
// empty list, because "no trains run that pair" is a state the form has to show
// and a fixture that always finds something can never exercise it.
// ---------------------------------------------------------------------------

interface SampleTrain {
  readonly trainNo: string;
  readonly trainName: string;
  readonly departs: string;
  readonly arrives: string;
  readonly travelTime: string;
  readonly runningDays: string;
  readonly halts: number;
  readonly distanceKm: number;
}

const SBC_NDLS: readonly SampleTrain[] = [
  { trainNo: "12627", trainName: "KARNATAKA EXP", departs: "20:00", arrives: "06:10", travelTime: "34:10 hrs", runningDays: "1111111", halts: 31, distanceKm: 2444 },
  { trainNo: "22691", trainName: "RAJDHANI EXP", departs: "20:20", arrives: "05:30", travelTime: "33:10 hrs", runningDays: "1011010", halts: 9, distanceKm: 2365 },
];

const ROUTES: Readonly<Record<string, readonly SampleTrain[]>> = { "SBC-NDLS": SBC_NDLS };

export const fixtureRouteSource: RouteSource = {
  async check(request: RouteRequest): Promise<RouteOutcome> {
    const from = request.from.trim().toUpperCase();
    const to = request.to.trim().toUpperCase();
    const sample = ROUTES[`${from}-${to}`] ?? [];
    return {
      ok: true,
      answer: {
        from,
        to,
        retrievedAt: new Date().toISOString(),
        trains: sample.map((train) => ({
          trainNo: train.trainNo,
          trainName: train.trainName,
          fromCode: from,
          fromName: from,
          toCode: to,
          toName: to,
          originCode: from,
          originName: from,
          destinationCode: to,
          destinationName: to,
          departs: train.departs,
          arrives: train.arrives,
          travelTime: train.travelTime,
          runningDays: train.runningDays,
          runsOn: readRunningDays(train.runningDays),
          halts: train.halts,
          distanceKm: train.distanceKm,
        })),
      },
    };
  },
};
