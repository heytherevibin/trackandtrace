import { describe, expect, it } from "vitest";
import { caretIndex, factsFor, fieldStatus, hintFor, lampFor, paxRows, statusBigFor, terminalResult } from "@/components/pnr/pnr-terminal-state";
import { buildFixtureResult } from "@/services/sources/fixture";
import type { PnrOutcome, PnrResult } from "@/types/domain";

const NOW = new Date("2026-09-17T06:30:00.000Z"); // 12:00 IST

function okResult(pnr: string): PnrResult {
  const outcome = buildFixtureResult(pnr, NOW);
  if (!outcome.ok) throw new Error(`fixture ${pnr} did not resolve`);
  return outcome.result;
}

describe("fieldStatus", () => {
  it("follows the drawn order: running, invalid, ready, idle, partial", () => {
    expect(fieldStatus({ digits: "", attempted: false, running: false })).toBe("idle");
    expect(fieldStatus({ digits: "234", attempted: false, running: false })).toBe("partial");
    expect(fieldStatus({ digits: "234", attempted: true, running: false })).toBe("invalid");
    expect(fieldStatus({ digits: "2345678901", attempted: true, running: false })).toBe("ready");
    expect(fieldStatus({ digits: "2345678901", attempted: true, running: true })).toBe("running");
  });
});

describe("hintFor", () => {
  it("offers the sample PNR only when the fixture is serving", () => {
    expect(hintFor("idle", "", true)).toBe("The 10 digits printed top-left on your ticket, or in your booking SMS. Try a sample: 2345678909.");
    expect(hintFor("idle", "", false)).toBe("The 10 digits printed top-left on your ticket, or in your booking SMS.");
  });

  it("counts, readies, refuses, and runs with the drawn copy", () => {
    expect(hintFor("partial", "2345", false)).toBe("4 of 10 digits");
    expect(hintFor("ready", "2345678901", false)).toBe("Ready. Press Run — one live request, made the moment you press it.");
    expect(hintFor("invalid", "234", false)).toBe("Enter all 10 digits.");
    expect(hintFor("running", "2345678901", false)).toBe("Running · validate → source → result");
  });
});

describe("lampFor and caretIndex", () => {
  it("lights the lamp steel when ready and light steel while running", () => {
    expect(lampFor("idle")).toEqual({ state: "off", label: "Standing by" });
    expect(lampFor("partial")).toEqual({ state: "off", label: "Standing by" });
    expect(lampFor("ready")).toEqual({ state: "lit", label: "Ready to run" });
    expect(lampFor("running")).toEqual({ state: "busy", label: "Requesting source" });
    expect(lampFor("invalid")).toEqual({ state: "off", label: "Check the digits" });
  });

  it("parks the caret on the next empty cell and hides it when ready or running", () => {
    expect(caretIndex("", "idle")).toBe(0);
    expect(caretIndex("234", "partial")).toBe(3);
    expect(caretIndex("234567890", "partial")).toBe(9);
    expect(caretIndex("2345678901", "ready")).toBeNull();
    expect(caretIndex("2345678901", "running")).toBeNull();
  });
});

describe("result view", () => {
  it("frames a single confirmed passenger with the drawn facts", () => {
    const result = okResult("2345678901");
    expect(statusBigFor(result)).toBe("Confirmed");
    const facts = factsFor(result);
    expect(facts.map((f) => f.label)).toEqual(["Train", "Route", "Journey", "Class · quota", "Departs", "Coach · berth", "Chart"]);
    expect(facts.find((f) => f.label === "Route")?.value).toBe("SBC → NDLS");
    expect(facts.find((f) => f.label === "Departs")?.value).toBe("19:20 IST");
    expect(facts.find((f) => f.label === "Coach · berth")?.value).toBe("B2 · 19 UB");
    expect(facts.find((f) => f.label === "Chart")?.value).toBe("~15:20 IST");
  });

  it("omits coach and berth when the lead has none", () => {
    const facts = factsFor(okResult("2345678903"));
    expect(facts.map((f) => f.label)).not.toContain("Coach · berth");
  });

  it("derives the party line and rows from the passengers, never inventing one", () => {
    const result = okResult("2345678909");
    expect(statusBigFor(result)).toBe("CNF · RAC · WL — party of three");
    expect(paxRows(result.snapshot.pax)).toEqual([
      { key: "1", name: "Passenger 1", booked: "WL", current: "CNF", alloc: "B1 · 12 LB" },
      { key: "2", name: "Passenger 2", booked: "WL", current: "RAC 4", alloc: "Not allocated" },
      { key: "3", name: "Passenger 3", booked: "WL", current: "WL 9", alloc: "Not allocated" },
    ]);
  });

  it("keeps a same-status party on the lead label", () => {
    const result = okResult("2345678915"); // prev digit 1: two waitlisted passengers
    expect(result.snapshot.pax).toHaveLength(2);
    expect(statusBigFor(result)).toBe("WL 8");
  });

  it("builds an ok result with sample tag, provenance, and the recent entry", () => {
    const view = terminalResult({ ok: true, result: okResult("2345678909") }, { pnr: "2345678909", attemptedAt: NOW, sampleMode: true });
    expect(view.kind).toBe("ok");
    expect(view.sample).toBe(true);
    expect(view.statusShort).toBe("Confirmed");
    expect(view.statusLong).toBe("Confirmed: a berth is allotted.");
    expect(view.pnrLabel).toBe("PNR 234 567 8909");
    expect(view.provenance).toBe("Retrieved 12:00 IST from the development fixture · every field as returned, none invented");
    expect(view.pax).toHaveLength(3);
    expect(view.recent).toMatchObject({ pnr: "2345678909", status: "CNF", position: null, label: "12627 · SBC→NDLS · Sat, 19 Sept" });
  });

  it("names the railway source for a live result", () => {
    const live = okResult("2345678901");
    const view = terminalResult({ ok: true, result: { ...live, snapshot: { ...live.snapshot, source: "live" } } }, { pnr: "2345678901", attemptedAt: NOW, sampleMode: false });
    expect(view.sample).toBe(false);
    expect(view.provenance).toBe("Retrieved 12:00 IST from the railway source · every field as returned, none invented");
  });

  it("labels a RapidAPI result third-party and names it in the provenance", () => {
    const base = okResult("2345678901");
    const view = terminalResult({ ok: true, result: { ...base, snapshot: { ...base.snapshot, source: "rapidapi" } } }, { pnr: "2345678901", attemptedAt: NOW, sampleMode: false, thirdPartyMode: true });
    expect(view.sample).toBe(false);
    expect(view.thirdParty).toBe(true);
    expect(view.provenance).toBe("Retrieved 12:00 IST from RapidAPI · IRCTC (third-party) · every field as returned, none invented");
  });

  it("says Not returned for a departure or chart the source did not send, and the chart state when it did", () => {
    const base = okResult("2345678901");
    const bare: PnrResult = {
      ...base,
      snapshot: { ...base.snapshot, source: "rapidapi", train: { number: "12658", from: { code: "SBC" }, to: { code: "MAS" } }, chartTime: undefined, chartAt: undefined },
    };
    const facts = Object.fromEntries(factsFor(bare).map((f) => [f.label, f.value]));
    expect(facts["Departs"]).toBe("Not returned");
    expect(facts["Chart"]).toBe("Not returned");
    const prepared = Object.fromEntries(factsFor({ ...bare, snapshot: { ...bare.snapshot, chartPrepared: true } }).map((f) => [f.label, f.value]));
    expect(prepared["Chart"]).toBe("Prepared");
  });

  it("names RapidAPI, not a missing connection, when the third-party source fails", () => {
    const view = terminalResult({ ok: false, code: "SOURCE_UNAVAILABLE", message: "The third-party provider did not answer in time. Nothing was shown in its place." }, { pnr: "1234567890", attemptedAt: NOW, sampleMode: false, thirdPartyMode: true });
    expect(view).toMatchObject({ kind: "unavailable", thirdParty: true, statusBig: "Source did not answer" });
    expect(view.statusLong).toBe("The third-party provider did not answer in time. Nothing was shown in its place.");
    expect(view.provenance).toBe("Attempted 12:00 IST · RapidAPI · IRCTC (third-party) did not answer");
  });

  it("labels a RapidAPI no-record answer by its source", () => {
    const view = terminalResult({ ok: false, code: "NOT_FOUND", message: "none" }, { pnr: "4949608635", attemptedAt: NOW, sampleMode: false, thirdPartyMode: true });
    expect(view).toMatchObject({ kind: "notfound", sample: false, thirdParty: true, provenance: "Retrieved 12:00 IST from RapidAPI · IRCTC (third-party)" });
  });

  it("reads a missing record as not found, labelled by where it came from", () => {
    const outcome: PnrOutcome = { ok: false, code: "NOT_FOUND", message: "none" };
    const view = terminalResult(outcome, { pnr: "2345678900", attemptedAt: NOW, sampleMode: true });
    expect(view).toMatchObject({ kind: "notfound", sample: true, statusShort: "Not found", statusBig: "No record at the source", provenance: "Retrieved 12:00 IST from the development fixture" });
    expect(view.statusLong).toBe("The source returned no reservation record for this PNR. Check the digits against your ticket or booking SMS.");
    expect(view.facts).toEqual([]);
    expect(view.recent).toMatchObject({ pnr: "2345678900", status: "NOT_FOUND" });
  });

  it("fails closed when the source is silent", () => {
    const view = terminalResult({ ok: false, code: "SOURCE_UNAVAILABLE", message: "x" }, { pnr: "1234567890", attemptedAt: NOW, sampleMode: false });
    expect(view).toMatchObject({ kind: "unavailable", sample: false, statusShort: "Source silent", statusBig: "Source not connected", provenance: "Attempted 12:00 IST · no verified source answered" });
    expect(view.statusLong).toBe("No verified railway source is connected right now, so this product makes no claim about this PNR. It fails closed: no source, no invented result.");
    expect(view.recent.status).toBeUndefined();
    expect(view.recent.label).toBe("Source silent");
  });

  it("says plainly when the request was held back by the rate limit", () => {
    const view = terminalResult({ ok: false, code: "RATE_LIMITED", message: "x", retryAfter: 42 }, { pnr: "2345678901", attemptedAt: NOW, sampleMode: true });
    expect(view.kind).toBe("limited");
    expect(view.statusBig).toBe("Too many checks");
    expect(view.statusLong).toContain("Retry in 42 s.");
    expect(view.provenance).toBe("Attempted 12:00 IST · held back, nothing sent to the source");
  });
});
