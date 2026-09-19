import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AppError } from "@/services/errors";
import { FakeSupabase } from "../../helpers/fake-supabase";

const fake = new FakeSupabase();
const admin = new FakeSupabase();
let signedIn = true;
const user = { id: "user-a", email: "a@b.c", name: "A", avatarUrl: null };

vi.mock("@/services/session", () => ({
  requireUser: async () => {
    if (!signedIn) throw new AppError("UNAUTHENTICATED", "Sign in.");
    return { user, db: fake.asDb() };
  },
}));
vi.mock("@/services/supabase/admin", () => ({ createAdminSupabase: () => admin.asDb() }));

const account = await import("@/app/api/account/route");
const exportRoute = await import("@/app/api/account/export/route");

function del(body: unknown) {
  return new NextRequest("http://localhost/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

beforeEach(() => {
  signedIn = true;
  admin.auth.admin.deleteUser.mockReset().mockResolvedValue({ error: null });
  fake.auth.signOut.mockClear();
  fake.seed("watchlist_entries", [
    { id: "1", user_id: "user-a", pnr: "2345678901", label: "one", checks: [], created_at: "2026-09-10T00:00:00.000Z", updated_at: "2026-09-10T00:00:00.000Z" },
  ]);
});

describe("DELETE /api/account", () => {
  it("returns 401 when signed out", async () => {
    signedIn = false;
    expect((await account.DELETE(del({ confirm: true }))).status).toBe(401);
  });
  it("requires confirm:true", async () => {
    expect((await account.DELETE(del({ confirm: false }))).status).toBe(400);
  });
  it("deletes rows, the auth user, and the session", async () => {
    const res = await account.DELETE(del({ confirm: true }));
    expect(res.status).toBe(200);
    expect(fake.tables.get("watchlist_entries")).toHaveLength(0);
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith("user-a");
    expect(fake.auth.signOut).toHaveBeenCalled();
  });
  it("returns 500 when the auth user cannot be deleted", async () => {
    admin.auth.admin.deleteUser.mockResolvedValueOnce({ error: { message: "nope" } });
    expect((await account.DELETE(del({ confirm: true }))).status).toBe(500);
  });
});

describe("GET /api/account/export", () => {
  it("returns 401 when signed out", async () => {
    signedIn = false;
    expect((await exportRoute.GET()).status).toBe(401);
  });
  it("returns an attachment with the profile and watchlist and no analyses", async () => {
    const res = await exportRoute.GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("watchlist");
    expect(body).not.toHaveProperty("analyses");
    expect((body.profile as { email: string }).email).toBe("a@b.c");
  });
  it("names the attachment trakline-export.json", async () => {
    const res = await exportRoute.GET();
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="trakline-export.json"');
  });
});
