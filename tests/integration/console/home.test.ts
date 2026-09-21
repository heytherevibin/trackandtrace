import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleMember } from "@/console/auth/member";

// vi.mock's factory is hoisted above every import and above any ordinary top-level `const` in this
// file, so the mocks it returns must be declared with vi.hoisted (same note as
// tests/integration/console/keys.test.ts). vi.fn(() => …) infers a zero-argument signature that
// later fails tsc --noEmit when the mock reads an argument (task-5-addendum.md §6), so both mocks
// are typed explicitly instead.
const { requireConsoleMember, redirect } = vi.hoisted(() => ({
  requireConsoleMember: vi.fn<() => Promise<ConsoleMember>>(),
  // Not next/navigation's own redirect: this only needs to stop execution the way the real one does
  // (it throws) and say where it was headed, without depending on that module's internal error shape.
  redirect: vi.fn<(url: string) => never>((url) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/console/auth/guard", () => ({ requireConsoleMember }));
vi.mock("next/navigation", () => ({ redirect }));

import ConsoleMissing from "@/app/console/[...missing]/page";
import ConsoleHome from "@/app/console/page";
import { ConsoleFrame } from "@/console/components/console-frame";

const MEMBER: ConsoleMember = {
  userId: "11111111-1111-1111-1111-111111111111",
  email: "asha@trakline.in",
  name: "Asha Rao",
  role: "owner",
  status: "active",
};

beforeEach(() => {
  requireConsoleMember.mockReset();
  redirect.mockClear();
});

describe("/ (console home)", () => {
  it("redirects to /keys -- the one destination that is right until Overview exists (2f)", () => {
    expect(() => ConsoleHome()).toThrow("REDIRECT:/keys");
  });
});

describe("the console catch-all", () => {
  it("still sends a signed-out visitor to sign in", async () => {
    requireConsoleMember.mockRejectedValue(new Error("no session"));
    await expect(ConsoleMissing()).rejects.toThrow("REDIRECT:/login");
  });

  it("shows a signed-in member the not-found state inside their own frame, not a redirect", async () => {
    requireConsoleMember.mockResolvedValue(MEMBER);
    const element = await ConsoleMissing();
    expect(element.type).toBe(ConsoleFrame);
    expect(element.props.member).toBe(MEMBER);
    expect(redirect).not.toHaveBeenCalled();
  });
});
