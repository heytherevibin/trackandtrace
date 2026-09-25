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
