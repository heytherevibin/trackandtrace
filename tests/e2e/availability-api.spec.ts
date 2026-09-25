import { expect, test } from "./fixtures";

// The two endpoints the pre-booking form will use, exercised as the form will use them. No page
// reaches them yet, so this is the only thing that proves the handlers are wired at all: the unit
// tests cover the services under them and never the route files themselves.
//
// The property under test is the same one the services keep — a refusal is a refusal, never a
// journey with no days in it — asserted here through the wire, where the page will read it.

test.describe.configure({ mode: "parallel" });

test("the route endpoint answers with the pair's trains", async ({ request }) => {
  const res = await request.get("/api/trains?from=SBC&to=NDLS");
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { ok: boolean; from: string; trains: { trainNo: string }[] };
  expect(body.ok).toBe(true);
  expect(body.from).toBe("SBC");
  expect(body.trains.length).toBeGreaterThan(0);
  expect(body.trains[0]?.trainNo).toMatch(/^\d{5}$/);
});

test("a pair with no trains is an answer, not an error", async ({ request }) => {
  const res = await request.get("/api/trains?from=SBC&to=XXXX");
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { ok: boolean; trains: unknown[] };
  expect(body.ok).toBe(true);
  expect(body.trains).toEqual([]);
});

test("the route endpoint refuses a pair it cannot read", async ({ request }) => {
  const res = await request.get("/api/trains?from=&to=NDLS");
  expect(res.ok()).toBe(false);
  expect((await res.json()) as { ok: boolean }).toMatchObject({ ok: false });
});

const JOURNEY = { trainNo: "12627", from: "SBC", to: "NDLS", journeyDate: "2026-10-15", travelClass: "3A", quota: "GN" };

test("the availability endpoint answers one journey with its days", async ({ request }) => {
  const res = await request.post("/api/availability", { data: JOURNEY });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { ok: boolean; train: { no: string }; days: { status: string }[] };
  expect(body.ok).toBe(true);
  expect(body.train.no).toBe("12627");
  expect(body.days.length).toBeGreaterThan(0);
});

test("a journey the source cannot answer comes back as a refusal, never as no days", async ({ request }) => {
  const res = await request.post("/api/availability", { data: { ...JOURNEY, trainNo: "12345" } });
  expect(res.ok()).toBe(false);
  const body = (await res.json()) as { ok: boolean; days?: unknown };
  expect(body.ok).toBe(false);
  expect(body.days).toBeUndefined();
});

test("the availability endpoint refuses a journey it cannot read, before spending anything", async ({ request }) => {
  for (const bad of [{ ...JOURNEY, trainNo: "126" }, { ...JOURNEY, journeyDate: "15-10-2026" }, { ...JOURNEY, travelClass: "ZZ" }]) {
    const res = await request.post("/api/availability", { data: bad });
    expect(res.ok()).toBe(false);
  }
});

const SEARCH = { from: "SBC", to: "NDLS", journeyDate: "2026-10-15", quota: "GN", classes: ["SL", "3A", "2A"] };

test("the search endpoint answers every chosen class of every train on the pair", async ({ request }) => {
  const res = await request.post("/api/route-availability", { data: SEARCH });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as {
    ok: boolean;
    leadClass: string;
    rows: { train: { trainNo: string }; answers: Record<string, unknown>; pending: string[]; notCarried: string[]; notBookable: boolean }[];
  };
  expect(body.ok).toBe(true);
  // 2A leads because the enum declares it first, not because it was named last. The list is still
  // sorted and filtered by one class, so one of them still has to be named.
  expect(body.leadClass).toBe("2A");
  expect(body.rows.length).toBeGreaterThan(0);
  for (const row of body.rows) {
    expect(row.train.trainNo).toMatch(/^\d{5}$/);
    // A train closed for booking answers for the whole row at once, so it carries no per-class
    // verdicts at all — and must not, because "pending" would offer a retry that can only be
    // refused the same way.
    if (row.notBookable) {
      expect([...Object.keys(row.answers), ...row.notCarried, ...row.pending]).toEqual([]);
      continue;
    }
    // Otherwise every chosen class is accounted for exactly once: answered, not carried by that
    // train, or still askable because the ask did not land. A class in none of the three would be
    // one the page could never explain.
    expect([...Object.keys(row.answers), ...row.notCarried, ...row.pending].sort()).toEqual(["2A", "3A", "SL"]);
  }
  // The sample route carries one of each, so this file would notice if a verdict stopped being
  // reachable rather than merely stopped being produced.
  expect(body.rows.filter((r) => r.notBookable)).toHaveLength(1);
  expect(body.rows.filter((r) => r.notCarried.length > 0)).toHaveLength(1);
});

test("a pair with no trains is an answer here too, with no rows", async ({ request }) => {
  const res = await request.post("/api/route-availability", { data: { ...SEARCH, to: "XXXX" } });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { ok: boolean; rows: unknown[] };
  expect(body.ok).toBe(true);
  expect(body.rows).toEqual([]);
});

test("the search endpoint refuses a body it cannot read, before spending anything", async ({ request }) => {
  for (const bad of [
    { ...SEARCH, classes: [] },
    { ...SEARCH, classes: ["ZZ"] },
    { ...SEARCH, journeyDate: "15-10-2026" },
    { ...SEARCH, trainNo: "12627" },
  ]) {
    const res = await request.post("/api/route-availability", { data: bad });
    expect(res.ok(), JSON.stringify(bad)).toBe(false);
  }
});

test("a repeated class is one class, not a way past the cap", async ({ request }) => {
  const res = await request.post("/api/route-availability", { data: { ...SEARCH, classes: Array.from({ length: 8 }, () => "SL") } });
  expect(res.ok()).toBe(true);
  expect((await res.json()) as { leadClass: string }).toMatchObject({ leadClass: "SL" });
});

test("opening a row asks for several classes at once", async ({ request }) => {
  const res = await request.post("/api/availability", { data: { trainNo: "12627", from: "SBC", to: "NDLS", journeyDate: "2026-10-15", quota: "GN", travelClasses: ["3A", "2A"] } });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { ok: boolean; answers: Record<string, { days: unknown[] }>; failedClasses: string[] };
  expect(body.ok).toBe(true);
  // A class that could not be answered is NAMED, never left out: an absent class on the list reads
  // as "not carried", which is a fact about the train and not about the request.
  for (const cls of Object.keys(body.answers)) expect(body.answers[cls]!.days.length).toBeGreaterThan(0);
  expect([...Object.keys(body.answers), ...body.failedClasses].sort()).toEqual(["2A", "3A"]);
});

test("a journey that names both a class and a class list is refused", async ({ request }) => {
  const res = await request.post("/api/availability", { data: { ...JOURNEY, travelClasses: ["2A"] } });
  expect(res.ok()).toBe(false);
});
