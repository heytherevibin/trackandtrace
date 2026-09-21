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
import { AppError } from "@/services/errors";

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
  it("still sends a visitor with no session to sign in", async () => {
    requireConsoleMember.mockRejectedValue(new AppError("UNAUTHENTICATED", "Your session ended. Sign in again.", { status: 401 }));
    await expect(ConsoleMissing()).rejects.toThrow("REDIRECT:/login");
  });

  // The blanket catch this page used to carry was removed from /keys first, on the principle that a
  // console with wrong grants or a database that is down must not look like an ordinary sign-out.
  // This page is the last one that still swallowed everything, and the old version of this very test
  // was what pinned it there -- a generic Error required to redirect. A fault has to reach
  // src/app/console/error.tsx, where someone will see it.
  it("lets a real fault through to the error boundary instead of dressing it as a sign-out", async () => {
    requireConsoleMember.mockRejectedValue(new AppError("SOURCE_UNAVAILABLE", "The console could not be reached.", { status: 503 }));
    await expect(ConsoleMissing()).rejects.toThrow("The console could not be reached.");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("and lets a plain Error through too, not only an AppError", async () => {
    requireConsoleMember.mockRejectedValue(new Error("permission denied for function console_me"));
    await expect(ConsoleMissing()).rejects.toThrow("permission denied for function console_me");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("shows a signed-in member the not-found state inside their own frame, not a redirect", async () => {
    requireConsoleMember.mockResolvedValue(MEMBER);
    const element = await ConsoleMissing();
    expect(element.type).toBe(ConsoleFrame);
    expect(element.props.member).toBe(MEMBER);
    expect(redirect).not.toHaveBeenCalled();
  });
});
