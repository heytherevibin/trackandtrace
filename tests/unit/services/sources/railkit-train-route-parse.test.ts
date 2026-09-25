import { describe, expect, it } from "vitest";
import { parseRailkitTrainRouteResponse } from "@/services/sources/railkit-train-route-parse";

// The train-info shape, measured live 2026-09-26 on 12601 MAS–MAQ (31 stops).
//
// The two arms worth the most here are the ones where a wrong reading looks like data: a "--" that
// becomes 00:00 is a departure in the middle of the night printed as a fact, and an empty stop list
// drawn as a run is a train that calls nowhere.

const NOW = new Date("2026-09-26T04:00:00.000Z");

const ORIGIN = {
  stnCode: "MAS",
  stnName: "Mgr Chennai Ctr",
  arrival: "--",
  departure: "20:10",
  halt: "0 min",
  haltMinutes: 0,
  distance: "0",
  day: "1",
  platform: 5,
  coordinates: { latitude: 13.08, longitude: 80.28 },
};
const MIDDLE = { stnCode: "srr", stnName: "Shoranur Jn", arrival: "05:35", departure: "05:40", haltMinutes: 5, distance: "595", day: "2", platform: 3 };
const TERMINUS = { stnCode: "MAQ", stnName: "Mangalore Central", arrival: "12:06", departure: "--", haltMinutes: 0, distance: "889", day: "2", platform: 4 };

const body = (route: readonly unknown[], trainNo = "12601") => ({
  success: true,
  data: { trainInfo: { train_no: trainNo, train_name: "MAS MAQ SF MAIL" }, route },
});

function parse(value: unknown, trainNo = "12601") {
  return parseRailkitTrainRouteResponse(value, trainNo, NOW);
}

describe("reading a train's run", () => {
  it("reads every stop in order, with the name, the times and the distance", () => {
    const out = parse(body([ORIGIN, MIDDLE, TERMINUS]));
    if (!out.ok) throw new Error("expected an answer");
    expect(out.answer.trainNo).toBe("12601");
    expect(out.answer.trainName).toBe("MAS MAQ SF MAIL");
    expect(out.answer.stops.map((s) => s.code)).toEqual(["MAS", "SRR", "MAQ"]);
    expect(out.answer.stops[1]).toMatchObject({ code: "SRR", name: "Shoranur Jn", arrival: "05:35", departure: "05:40", haltMinutes: 5, distanceKm: 595, day: 2, platform: 3 });
  });

  it("leaves the origin's arrival and the terminus's departure NULL, never a time", () => {
    const out = parse(body([ORIGIN, MIDDLE, TERMINUS]));
    if (!out.ok) throw new Error("expected an answer");
    // "--" is the provider saying there is no such time. Rendered as 00:00 it would be a departure
    // in the middle of the night, printed as a fact a traveller could act on.
    expect(out.answer.stops[0]?.arrival).toBeNull();
    expect(out.answer.stops[0]?.departure).toBe("20:10");
    expect(out.answer.stops[2]?.arrival).toBe("12:06");
    expect(out.answer.stops[2]?.departure).toBeNull();
  });

  it("reads the string numbers the provider actually sends", () => {
    const out = parse(body([{ ...MIDDLE, distance: "595", day: "2" }]));
    if (!out.ok) throw new Error("expected an answer");
    expect(out.answer.stops[0]).toMatchObject({ distanceKm: 595, day: 2 });
  });

  it("calls an unreadable distance null rather than zero", () => {
    const out = parse(body([{ ...MIDDLE, distance: "n/a", day: "" }]));
    if (!out.ok) throw new Error("expected an answer");
    // "0 km" at the last stop would say the train went nowhere.
    expect(out.answer.stops[0]?.distanceKm).toBeNull();
    expect(out.answer.stops[0]?.day).toBeNull();
  });

  it("treats platform 0 as unknown, because there is no platform zero", () => {
    const out = parse(body([{ ...MIDDLE, platform: 0 }]));
    if (!out.ok) throw new Error("expected an answer");
    expect(out.answer.stops[0]?.platform).toBeNull();
  });

  it("refuses an empty run rather than drawing a train that calls nowhere", () => {
    expect(parse(body([]))).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
  });

  it("refuses a record for a different train", () => {
    // An echo that DISAGREES is an answer to a question we did not ask.
    expect(parse(body([ORIGIN], "12345"), "12601")).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
  });

  it("keeps a run whose echo the provider simply stopped sending", () => {
    const out = parse({ success: true, data: { trainInfo: {}, route: [ORIGIN] } });
    expect(out.ok).toBe(true);
  });

  it("drops a stop with no station code, which could never be drawn or matched", () => {
    const out = parse(body([ORIGIN, { stnName: "Nowhere" }, TERMINUS]));
    if (!out.ok) throw new Error("expected an answer");
    expect(out.answer.stops.map((s) => s.code)).toEqual(["MAS", "MAQ"]);
  });

  it.each([null, undefined, 42, "text", {}, { data: {} }])("refuses %s rather than inventing a run", (value) => {
    expect(parse(value)).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
  });
});
