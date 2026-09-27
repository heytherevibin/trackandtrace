import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleMember } from "@/console/auth/member";

const { requireConsoleMember, redirect, today } = vi.hoisted(() => ({
  requireConsoleMember: vi.fn<() => Promise<ConsoleMember>>(),
  redirect: vi.fn<(url: string) => never>((url) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  today: vi.fn<(n: number, at: number) => Promise<{ readonly total: number; readonly top: readonly never[] }>>(async () => ({ total: 0, top: [] })),
}));
vi.mock("@/console/auth/guard", () => ({ requireConsoleMember }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/console/overview/pings", () => ({ pingStore: async () => "local" }));
vi.mock("@/services/runtime-settings", () => ({ liveChecksPerDay: async () => 300 }));
vi.mock("@/services/shared-store", async (original) => ({
  ...(await original<typeof import("@/services/shared-store")>()),
  limitedLogForReading: () => ({ today, record: vi.fn() }),
}));

import AbusePage from "@/app/console/abuse/page";
import { ConsoleFrame } from "@/console/components/console-frame";
import { NoAccessState } from "@/console/components/frame-states";
import { AppError } from "@/services/errors";

const MEMBER: ConsoleMember = { userId: "11111111-1111-1111-1111-111111111111", email: "asha@trakline.in", name: "Asha Rao", role: "owner", status: "active" };

beforeEach(() => {
  requireConsoleMember.mockReset();
  today.mockClear();
});

// Module 04 is Owner and Admin. Its log holds address hashes, not IPs — but a hash and a count is
// still more than Support or a Viewer is given, so for them the page does not read it at all.
describe("/abuse", () => {
  it("sends a visitor with no session to sign in", async () => {
    requireConsoleMember.mockRejectedValue(new AppError("UNAUTHENTICATED", "Your session ended. Sign in again.", { status: 401 }));
    await expect(AbusePage()).rejects.toThrow("REDIRECT:/login");
  });

  it("reads the day's refusals for an Owner", async () => {
    requireConsoleMember.mockResolvedValue(MEMBER);
    const element = await AbusePage();
    expect(element.type).toBe(ConsoleFrame);
    expect(today).toHaveBeenCalled();
  });

  it.each(["support", "viewer"] as const)("shows a %s the no-access state and reads nothing", async (role) => {
    requireConsoleMember.mockResolvedValue({ ...MEMBER, role });
    const element = await AbusePage();
    expect(element.props.children.type).toBe(NoAccessState);
    expect(today).not.toHaveBeenCalled();
  });
});
