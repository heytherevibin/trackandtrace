import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AppError } from "@/services/errors";
import { FakeSupabase } from "../../helpers/fake-supabase";

const fake = new FakeSupabase();
let mode: "signed-in" | "signed-out" | "unconfigured" = "signed-in";
const user = { id: "user-a", email: "a@b.c", name: "A", avatarUrl: null };

vi.mock("@/services/session", () => ({
  requireUser: async () => {
    if (mode === "unconfigured") throw new AppError("SOURCE_UNAVAILABLE", "Accounts are not configured for this deployment.");
    if (mode === "signed-out") throw new AppError("UNAUTHENTICATED", "Sign in to use your account.");
    return { user, db: fake.asDb() };
  },
}));

const route = await import("@/app/api/watchlist/route");
const merge = await import("@/app/api/watchlist/merge/route");

function json(method: string, body?: unknown) {
  return new NextRequest("http://localhost/api/watchlist", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  mode = "signed-in";
  fake.seed("watchlist_entries", [
    { id: "1", user_id: "user-a", pnr: "2345678901", label: "one", checks: [], created_at: "2026-09-10T00:00:00.000Z", updated_at: "2026-09-10T00:00:00.000Z" },
    { id: "2", user_id: "user-b", pnr: "2345678903", label: "other", checks: [], created_at: "2026-09-11T00:00:00.000Z", updated_at: "2026-09-11T00:00:00.000Z" },
  ]);
});

describe("GET /api/watchlist", () => {
  it("returns 401 when signed out", async () => {
    mode = "signed-out";
    expect((await route.GET()).status).toBe(401);
  });
  it("returns 503 when accounts are not configured", async () => {
    mode = "unconfigured";
    expect((await route.GET()).status).toBe(503);
  });
  it("lists only the user's entries", async () => {
    const res = await route.GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { pnr: string }[] };
    expect(body.data.map((e) => e.pnr)).toEqual(["2345678901"]);
  });
});

describe("POST /api/watchlist", () => {
  it("rejects an invalid pnr with 400", async () => {
    const res = await route.POST(json("POST", { pnr: "12", label: "x" }));
    expect(res.status).toBe(400);
  });
  it("rejects non-array checks with 400", async () => {
    const res = await route.POST(json("POST", { pnr: "2345678905", label: "x", checks: "nope" }));
    expect(res.status).toBe(400);
  });
  it("upserts and returns the entry", async () => {
    const res = await route.POST(json("POST", { pnr: "2345678905", label: "new" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, data: { pnr: "2345678905", label: "new", checks: [] } });
  });
});

describe("DELETE /api/watchlist", () => {
  it("rejects a bad body with 400", async () => {
    expect((await route.DELETE(json("DELETE", { nope: 1 }))).status).toBe(400);
  });
  it("removes the entry", async () => {
    const res = await route.DELETE(json("DELETE", { pnr: "2345678901" }));
    expect(res.status).toBe(200);
    expect(fake.tables.get("watchlist_entries")?.some((r) => r.pnr === "2345678901" && r.user_id === "user-a")).toBe(false);
  });
});

describe("POST /api/watchlist/merge", () => {
  it("upserts every entry and returns the full list", async () => {
    const res = await merge.POST(
      new NextRequest("http://localhost/api/watchlist/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: [{ pnr: "2345678908", label: "a" }, { pnr: "2345678901", label: "renamed" }] }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { pnr: string; label: string }[] };
    expect(body.data).toHaveLength(2);
    expect(body.data.find((e) => e.pnr === "2345678901")?.label).toBe("renamed");
  });
  it("rejects an empty list", async () => {
    const res = await merge.POST(
      new NextRequest("http://localhost/api/watchlist/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries: [] }) }),
    );
    expect(res.status).toBe(400);
  });
});
