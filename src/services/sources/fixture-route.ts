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
  /**
   * The stations THIS train calls at on the pair — usually not the pair itself.
   *
   * Until 2026-09-25 every sample train borrowed the asked-for codes, so a reader of the fixture
   * could not tell the two apart and neither could a test. Production answered SBC → NDLS with
   * eight trains of which seven call at neither station, and the route fan-out asked all of them
   * about SBC → NDLS and was refused seven times.
   */
  readonly fromCode: string;
  readonly toCode: string;
  readonly departs: string;
  readonly arrives: string;
  readonly travelTime: string;
  readonly runningDays: string;
  readonly halts: number;
  readonly distanceKm: number;
}

const SBC_NDLS: readonly SampleTrain[] = [
  { trainNo: "12627", trainName: "KARNATAKA EXP", fromCode: "SBC", toCode: "NDLS", departs: "20:00", arrives: "06:10", travelTime: "34:10 hrs", runningDays: "1111111", halts: 31, distanceKm: 2444 },
  // Boards at SBC and arrives at NZM, as the real 22691 does: the sample pair is not its pair.
  { trainNo: "22691", trainName: "RAJDHANI EXP", fromCode: "SBC", toCode: "NZM", departs: "20:20", arrives: "05:30", travelTime: "33:10 hrs", runningDays: "1011010", halts: 9, distanceKm: 2365 },
  // A special, listed on the pair and closed for booking — the third answer a row can carry, beside
  // a berth count and a class the train does not run. Production answers exactly this for 00629
  // YPR → TKD, measured 2026-09-26, and without a sample that does it no test could see the row.
  { trainNo: "00629", trainName: "YPR TKD SPECIAL", fromCode: "SBC", toCode: "TKD", departs: "23:45", arrives: "08:15", travelTime: "32:30 hrs", runningDays: "0000100", halts: 12, distanceKm: 2401 },
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
          fromCode: train.fromCode,
          fromName: train.fromCode,
          toCode: train.toCode,
          toName: train.toCode,
          originCode: train.fromCode,
          originName: train.fromCode,
          destinationCode: train.toCode,
          destinationName: train.toCode,
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
