import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock's factory is hoisted above a plain top-level const, so apiRequest needs vi.hoisted
// (same trap as tests/integration/console/setup.test.ts's startConsoleSession mock).
const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("@/services/api-client", () => ({ apiRequest }));

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));

import { RedeemToken } from "@/app/console/setup/redeem-token";
import type { InviteTokenLookup } from "@/console/setup/redeem";

const EXPIRED = "This invite has expired. Ask an Owner to send a new one.";
const WITHDRAWN = "This invite was withdrawn.";
const ACCEPT = "Accept and email me a sign-in link";
const SENT = "Check your inbox. Open the link on the device you'll set up.";
// email/role travel on a live entry (lookupInviteToken's real shape). `role` now feeds the
// role-specific sub-line (task-3-addendum.md §2); `email` still goes unread here -- see
// redeem-token.tsx and setup.ts's own comment on why the head names no inviter yet.
const LIVE_INVITE: InviteTokenLookup = { kind: "invite", state: "live", email: "kiran.das@trakline.in", role: "support" };
const ROLE_LEAD = "Support: Overview, Leads, Privacy requests and Wrong-status reports.";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RedeemToken — a first-Owner link (kind: owner), unchanged", () => {
  it("redeems on mount with no button, and hands off to /setup once done", async () => {
    apiRequest.mockResolvedValue({ ok: true, data: { ok: true, kind: "owner" } });
    render(<RedeemToken token="abc" entry={{ kind: "owner" }} />);
    expect(screen.queryByRole("button")).toBeNull();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/setup"));
  });

  it("shows the translated refusal when redemption fails, and never redirects", async () => {
    apiRequest.mockResolvedValue({ ok: false, error: { ok: false, code: "INVALID_INPUT", message: EXPIRED } });
    render(<RedeemToken token="abc" entry={{ kind: "owner" }} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(EXPIRED);
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("RedeemToken — a live invite (kind: invite, state: live)", () => {
  it("draws the sheet's one action, and makes no request until it is pressed", () => {
    render(<RedeemToken token="abc" entry={LIVE_INVITE} />);
    expect(screen.getByRole("button", { name: ACCEPT })).toBeEnabled();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  // task-3-addendum.md §2: the role half of the sheet's personalised head lead, composed from the
  // same words the Roles plate carries (consoleMessages.team.roleDescription) rather than a second
  // copy grown here. The inviter's name stays unwired -- see setup.ts's own comment.
  it("names the invited role and what it can reach, even though the inviter itself stays unnamed", () => {
    render(<RedeemToken token="abc" entry={LIVE_INVITE} />);
    expect(screen.getByText(ROLE_LEAD)).toBeInTheDocument();
  });

  it("accepts on click, and then draws the sheet's own inbox line -- not a redirect", async () => {
    apiRequest.mockResolvedValue({ ok: true, data: { ok: true, kind: "invite" } });
    render(<RedeemToken token="a-real-token" entry={LIVE_INVITE} />);
    await userEvent.click(screen.getByRole("button", { name: ACCEPT }));
    expect(await screen.findByText(SENT)).toBeVisible();
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/setup",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ token: "a-real-token" }) }),
      expect.anything(),
      expect.anything(),
    );
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: ACCEPT })).toBeNull();
  });

  it("shows the translated refusal and lets the member press it again when accepting fails", async () => {
    apiRequest.mockResolvedValue({ ok: false, error: { ok: false, code: "INVALID_INPUT", message: WITHDRAWN } });
    render(<RedeemToken token="abc" entry={LIVE_INVITE} />);
    await userEvent.click(screen.getByRole("button", { name: ACCEPT }));
    expect(await screen.findByRole("alert")).toHaveTextContent(WITHDRAWN);
    expect(screen.getByRole("button", { name: ACCEPT })).toBeEnabled();
  });

  it("disables the button while the request is in flight", async () => {
    let resolveRequest: ((value: unknown) => void) | undefined;
    apiRequest.mockImplementation(() => new Promise((resolve) => (resolveRequest = resolve)));
    render(<RedeemToken token="abc" entry={LIVE_INVITE} />);
    await userEvent.click(screen.getByRole("button", { name: ACCEPT }));
    expect(screen.getByRole("button", { name: ACCEPT })).toBeDisabled();
    resolveRequest?.({ ok: true, data: { ok: true, kind: "invite" } });
    await screen.findByText(SENT);
  });
});

describe("RedeemToken — a closed invite", () => {
  it("draws the sheet's expired state directly: no button, no request", () => {
    render(<RedeemToken token="abc" entry={{ kind: "invite", state: "expired" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent(EXPIRED);
    expect(screen.queryByRole("button")).toBeNull();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("draws the sheet's withdrawn state directly, distinct from expired", () => {
    render(<RedeemToken token="abc" entry={{ kind: "invite", state: "withdrawn" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent(WITHDRAWN);
    expect(screen.queryByRole("button")).toBeNull();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
