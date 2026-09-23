import { describe, expect, it } from "vitest";
import { loadRouteFile, parseRouteFile, preflight } from "../../../scripts/crawl-plan.mjs";
import { bookingClassSchema, quotaSchema } from "@/types/schemas";

// ---------------------------------------------------------------------------
// The route list, and the preflight that must reject a bad one before a single request is spent.
//
// `guarded.ts` counts a request BEFORE the adapter sees it, and the adapter refuses a malformed
// route locally — so a bad list entry spends quota on a call that never leaves the process. A bad
// entry must fail here, before anything is spent.
//
// The list is also the model's bias, which is the other half of what is asserted below. Two of those
// assertions were rewritten after review: `toMatch(/bias/i)` over the whole file passed on the word
// appearing anywhere, including inside a route `note`, and a count of three distinct train numbers
// was satisfied by three different Rajdhanis — verbatim the failure the brief names and the `_bias`
// block spends a paragraph on. A test meant to stop the list drifting back has to assert the axes.
//
// No key, no network and no database is touched by anything below.
// ---------------------------------------------------------------------------

const SETS = { classes: bookingClassSchema.options, quotas: quotaSchema.options } as const;

/** A shape the parser accepts, so each test can spoil exactly one field. */
function route(over: Partial<Record<string, string>> = {}) {
  return { trainNo: "12621", from: "MAS", to: "NDLS", travelClass: "SL", quota: "GN", ...over };
}

describe("parseRouteFile", () => {
  it("reads the shipped list", () => {
    const parsed = parseRouteFile(loadRouteFile());
    expect(parsed.ok).toBe(true);
  });

  it.each([
    ["not an object", "[]"],
    ["no routes", JSON.stringify({ routes: [] })],
    ["routes that are not an array", JSON.stringify({ routes: {} })],
    ["an entry missing a field", JSON.stringify({ routes: [{ trainNo: "12621", from: "MAS" }] })],
    ["a field that is not a string", JSON.stringify({ routes: [{ ...route(), trainNo: 12621 }] })],
  ])("refuses %s, and says so rather than coercing it", (_label, json) => {
    const parsed = parseRouteFile(json);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issues.length).toBeGreaterThan(0);
  });

  it("refuses a file that is not JSON at all", () => {
    expect(parseRouteFile("{").ok).toBe(false);
  });
});

describe("the shipped route list", () => {
  const parsed = parseRouteFile(loadRouteFile());
  if (!parsed.ok) throw new Error(`scripts/routes.json does not parse: ${parsed.issues.join("; ")}`);
  const routes = parsed.routes;

  it("passes its own preflight, so the first run cannot fail on the list we wrote", () => {
    expect(preflight(routes, SETS)).toEqual([]);
  });

  it("carries a comment about its own bias — the list is the model's bias, and that has to be written down", () => {
    // `toMatch(/bias/i)` over the whole file passed on the word appearing inside any route `note`.
    // The comment is a named key with prose in it, so that is what is asserted.
    const body: unknown = JSON.parse(loadRouteFile());
    const bias = body !== null && typeof body === "object" && "_bias" in body ? (body as { _bias: unknown })._bias : undefined;

    expect(Array.isArray(bias)).toBe(true);
    expect((bias as string[]).join(" ")).toMatch(/bias/i);
    expect((bias as string[]).join(" ").length).toBeGreaterThan(200);
  });

  it("is a deliberate spread, not three of the same kind of train", () => {
    // `new Set(trainNo).size >= 3` was satisfied by three different Rajdhanis — verbatim the failure
    // the brief names and the `_bias` block spends a paragraph on. Spread is the axes, not the count:
    // a model that only ever saw one corridor, one class of stock or one quota learns that instead.
    expect(new Set(routes.map((r) => r.trainNo)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(routes.map((r) => `${r.from}-${r.to}`)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(routes.map((r) => r.from)).size).toBeGreaterThanOrEqual(3);
  });

  it("covers a berth AND a seating class, not only overnight berths, and both GN and TQ", () => {
    const classes = new Set(routes.map((r) => r.travelClass));
    expect(classes.size).toBeGreaterThanOrEqual(2);
    // 2S is not a berth at all and clears on a different curve; without one the model has only ever
    // seen overnight berths. AC and sleeper separate premium stock from the largest waitlist there is.
    expect([...classes].some((c) => ["2S", "CC"].includes(c))).toBe(true);
    expect([...classes].some((c) => ["1A", "2A", "3A"].includes(c))).toBe(true);
    expect([...classes].some((c) => c === "SL")).toBe(true);

    const quotas = new Set(routes.map((r) => r.quota));
    expect(quotas).toContain("GN");
    expect(quotas).toContain("TQ");
  });

  it("pairs one train against itself across quotas, which is how the model learns TQ is a process and not a busier GN", () => {
    const byTrain = new Map<string, Set<string>>();
    for (const r of routes) byTrain.set(r.trainNo, new Set([...(byTrain.get(r.trainNo) ?? []), r.quota]));
    expect([...byTrain.values()].some((quotas) => quotas.size > 1)).toBe(true);
  });

  it("does not carry 12951, which answered `Unable to process your request` for every class and date tried", () => {
    expect(routes.map((r) => r.trainNo)).not.toContain("12951");
  });
});

describe("preflight", () => {
  it("passes a list the adapter would accept", () => {
    expect(preflight([route()], SETS)).toEqual([]);
  });

  it.each([
    ["a four-digit train number", route({ trainNo: "1262" })],
    ["a train number with a letter", route({ trainNo: "1262A" })],
    ["a station code that is too long", route({ from: "MADRAS" })],
    ["a lower-case station code", route({ to: "ndls" })],
    ["a class the schema does not know", route({ travelClass: "3AC" })],
    ["a quota the schema does not know", route({ quota: "GENERAL" })],
    ["a leg that starts where it ends", route({ from: "MAS", to: "MAS" })],
  ])("fails the run's preflight on %s, rather than its budget", (_label, bad) => {
    const issues = preflight([bad], SETS);
    expect(issues).toHaveLength(1);
    // Named by position, because a list of forty is read by index.
    expect(issues[0]).toMatch(/\b1\b/);
  });

  it("names the same combo listed twice: it would spend the whole horizon again for nothing", () => {
    expect(preflight([route(), route()], SETS)).toHaveLength(1);
  });

  it("names every bad entry, not just the first — one run of the preflight should fix the whole file", () => {
    expect(preflight([route({ trainNo: "1" }), route({ from: "x" }), route({ quota: "NOPE" })], SETS)).toHaveLength(3);
  });
});
