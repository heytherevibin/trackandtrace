import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MyKeys } from "@/console/account/my-keys";
import type { ConsoleMember } from "@/console/auth/member";
import { AppError } from "@/services/errors";

// vi.mock's factory is hoisted above every import and above any ordinary top-level `const` in this
// file, so the mocks it returns must be declared with vi.hoisted (same note as
// tests/integration/console/keys.test.ts and tests/integration/console/home.test.ts). Both mocks are
// typed explicitly -- vi.fn(() => …) infers a zero-argument signature (task-6-addendum.md §9).
const { requireConsoleMember, getMyKeys } = vi.hoisted(() => ({
  requireConsoleMember: vi.fn<() => Promise<ConsoleMember>>(),
  getMyKeys: vi.fn<() => Promise<MyKeys>>(),
}));

vi.mock("@/console/auth/guard", () => ({ requireConsoleMember }));
vi.mock("@/console/account/my-keys", () => ({ getMyKeys }));

import { GET } from "@/app/console/api/keys/mine/route";

const MEMBER: ConsoleMember = {
  userId: "11111111-1111-1111-1111-111111111111",
  email: "asha@trakline.in",
  name: "Asha Rao",
  role: "owner",
  status: "active",
};

const DATA: MyKeys = {
  keys: [{ id: "aaaaaaaa-0000-0000-0000-000000000001", name: "YubiKey 5C", type: "security_key", createdAt: "2026-09-02T10:00:00Z", lastUsedAt: null }],
  member: { name: "Asha Rao", email: "asha@trakline.in", role: "owner", createdAt: "2026-09-02T09:00:00Z" },
};

beforeEach(() => {
  requireConsoleMember.mockReset();
  getMyKeys.mockReset();
});

describe("GET /api/keys/mine", () => {
  it("returns the signed-in member's keys and profile in one round trip", async () => {
    requireConsoleMember.mockResolvedValue(MEMBER);
    getMyKeys.mockResolvedValue(DATA);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, keys: DATA.keys, member: DATA.member });
    expect(getMyKeys).toHaveBeenCalledOnce();
  });

  it("never reaches console_my_keys when there is no session", async () => {
    requireConsoleMember.mockRejectedValue(new AppError("UNAUTHENTICATED", "Your session ended. Sign in again.", { status: 401 }));
    const response = await GET();
    expect(response.status).toBe(401);
    expect(getMyKeys).not.toHaveBeenCalled();
  });

  it("answers a database fault with the shared unavailable shape, not a raw error", async () => {
    requireConsoleMember.mockResolvedValue(MEMBER);
    getMyKeys.mockRejectedValue(new AppError("SOURCE_UNAVAILABLE", "The console could not be reached. Try again.", { status: 503 }));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, code: "SOURCE_UNAVAILABLE" });
  });
});
