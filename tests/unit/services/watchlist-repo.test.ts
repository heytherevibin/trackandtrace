import { describe, expect, it } from "vitest";
import { deleteEntry, fromPostgrestError, listEntries, rowToEntry, upsertEntry } from "@/services/watchlist-repo";
import { FakeSupabase } from "../../helpers/fake-supabase";

const A = "user-a";
const B = "user-b";
const point = { at: "2026-09-16T04:30:00.000Z", status: "WL" as const, position: 14 };

function seeded(): FakeSupabase {
  const fake = new FakeSupabase();
  fake.seed("watchlist_entries", [
    { id: "1", user_id: A, pnr: "2345678901", label: "first", checks: [point], created_at: "2026-09-10T00:00:00.000Z", updated_at: "2026-09-10T00:00:00.000Z" },
    { id: "2", user_id: A, pnr: "2345678905", label: "second", checks: "not-an-array", created_at: "2026-09-12T00:00:00.000Z", updated_at: "2026-09-12T00:00:00.000Z" },
    { id: "3", user_id: B, pnr: "2345678903", label: "other", checks: [], created_at: "2026-09-13T00:00:00.000Z", updated_at: "2026-09-13T00:00:00.000Z" },
  ]);
  return fake;
}

describe("listEntries", () => {
  it("returns only the user's rows, newest first", async () => {
    const entries = await listEntries(seeded().asDb(), A);
    expect(entries.map((e) => e.pnr)).toEqual(["2345678905", "2345678901"]);
  });
  it("throws a mapped AppError when the query fails", async () => {
    const fake = seeded();
    fake.nextError = { code: "42501", message: "denied" };
    await expect(listEntries(fake.asDb(), A)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("rowToEntry", () => {
  it("drops malformed checks instead of throwing", () => {
    const entry = rowToEntry({ id: "x", user_id: A, pnr: "2345678905", label: "l", checks: "junk", created_at: "2026-09-12T00:00:00.000Z", updated_at: "2026-09-12T00:00:00.000Z" });
    expect(entry.checks).toEqual([]);
    expect(entry.addedAt).toBe("2026-09-12T00:00:00.000Z");
  });
});

describe("upsertEntry", () => {
  it("inserts a new row and returns the entry", async () => {
    const fake = seeded();
    const entry = await upsertEntry(fake.asDb(), A, { pnr: "2345678908", label: "new", checks: [] });
    expect(entry.pnr).toBe("2345678908");
    expect(fake.tables.get("watchlist_entries")).toHaveLength(4);
  });
  it("replaces the row on (user_id, pnr) conflict", async () => {
    const fake = seeded();
    const entry = await upsertEntry(fake.asDb(), A, { pnr: "2345678901", label: "renamed", checks: [point, point] });
    expect(entry.label).toBe("renamed");
    expect(fake.tables.get("watchlist_entries")).toHaveLength(3);
  });
});

describe("deleteEntry", () => {
  it("removes only the caller's row for that pnr", async () => {
    const fake = seeded();
    await deleteEntry(fake.asDb(), B, "2345678901");
    expect(fake.tables.get("watchlist_entries")).toHaveLength(3);
    await deleteEntry(fake.asDb(), A, "2345678901");
    expect(fake.tables.get("watchlist_entries")).toHaveLength(2);
  });
});

describe("fromPostgrestError", () => {
  it("maps known codes and falls back to INTERNAL", () => {
    expect(fromPostgrestError({ code: "23505", message: "" }).code).toBe("INVALID_INPUT");
    expect(fromPostgrestError({ code: "PGRST116", message: "" }).code).toBe("NOT_FOUND");
    expect(fromPostgrestError({ code: "42501", message: "" }).code).toBe("UNAUTHENTICATED");
    expect(fromPostgrestError({ message: "weird" }).code).toBe("INTERNAL");
  });
});
