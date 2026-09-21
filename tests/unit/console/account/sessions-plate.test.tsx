import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MySessionRow } from "@/console/account/my-sessions";

// Same layering as tests/unit/console/account/keys-plate.test.tsx: the network calls
// (fetchMySessions/signOutOthers) and the toast host are mocked; ConfirmDialog is the real thing
// (unlike ConfirmItsYou, this action takes no tap -- task-9-brief.md).
const { fetchMySessions, signOutOthers } = vi.hoisted(() => ({ fetchMySessions: vi.fn(), signOutOthers: vi.fn() }));
const { notifySuccess } = vi.hoisted(() => ({ notifySuccess: vi.fn() }));
vi.mock("@/console/account/my-keys-client", () => ({ fetchMySessions, signOutOthers }));
vi.mock("@/components/ui/toast", () => ({ notify: { success: notifySuccess, error: vi.fn() } }));

import { SessionsPlate } from "@/console/account/sessions-plate";

// createdAt values chosen so formatTime's IST conversion (UTC+5:30) lands on a round number: easy
// to eyeball in the assertions below rather than trusting a conversion done twice.
const CURRENT: MySessionRow = {
  id: "cccccccc-0000-0000-0000-000000000001",
  deviceLabel: "Chrome on macOS",
  lastSeenAt: "2026-09-21T03:50:00Z",
  createdAt: "2026-09-21T03:42:00Z", // 09:12 IST
  isCurrent: true,
};
const OTHER: MySessionRow = {
  id: "cccccccc-0000-0000-0000-000000000002",
  deviceLabel: "Safari on iPhone",
  lastSeenAt: "2026-09-20T17:10:00Z", // 22:40 IST, the day before NOW below
  createdAt: "2026-09-18T17:10:00Z", // 22:40 IST
  isCurrent: false,
};
const OTHER_2: MySessionRow = {
  id: "cccccccc-0000-0000-0000-000000000003",
  deviceLabel: "Firefox on Windows",
  lastSeenAt: "2026-09-19T02:35:00Z",
  createdAt: "2026-09-17T02:30:00Z", // 08:00 IST
  isCurrent: false,
};

// The other row says how long ago the session was last seen, and formatRelative measures that
// against "now" -- so without pinning the clock this file would read "yesterday" today and
// something else tomorrow.
const NOW = new Date("2026-09-21T18:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fetchMySessions.mockReset();
  signOutOthers.mockReset();
  notifySuccess.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SessionsPlate", () => {
  it("titles the plate Sessions", () => {
    render(<SessionsPlate sessions={[CURRENT]} />);
    expect(screen.getByRole("heading", { name: "Sessions" })).toBeInTheDocument();
  });

  it("marks the current session This device, and marks no other row that way", () => {
    render(<SessionsPlate sessions={[CURRENT, OTHER]} />);
    expect(screen.getAllByText("This device")).toHaveLength(1);
  });

  it("draws this device by when it signed in, and another by when it was last seen -- as the sheet does", () => {
    render(<SessionsPlate sessions={[CURRENT, OTHER]} />);
    expect(screen.getByText("Chrome on macOS · signed in 09:12 IST")).toBeInTheDocument();
    expect(screen.getByText("Safari on iPhone · last seen yesterday, 22:40 IST")).toBeInTheDocument();
  });

  it("hides Sign out other sessions and any other row when there is nothing but the current device", () => {
    render(<SessionsPlate sessions={[CURRENT]} />);
    expect(screen.queryByRole("button", { name: "Sign out other sessions" })).not.toBeInTheDocument();
  });

  it("shows Sign out other sessions once another session exists", () => {
    render(<SessionsPlate sessions={[CURRENT, OTHER]} />);
    expect(screen.getByRole("button", { name: "Sign out other sessions" })).toBeInTheDocument();
  });

  it("opens a confirm dialog that names the actual other session, not a hardcoded one", async () => {
    render(<SessionsPlate sessions={[CURRENT, OTHER]} />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out other sessions" }));
    expect(screen.getByRole("heading", { name: "Sign out other sessions?" })).toBeVisible();
    expect(screen.getByText("Safari on iPhone is signed out at once. This device stays signed in.")).toBeVisible();
  });

  it("names every other session when there is more than one", async () => {
    render(<SessionsPlate sessions={[CURRENT, OTHER, OTHER_2]} />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out other sessions" }));
    expect(screen.getByText("Safari on iPhone and Firefox on Windows are signed out at once. This device stays signed in.")).toBeVisible();
  });

  it("cancelling calls neither signOutOthers nor a refresh", async () => {
    render(<SessionsPlate sessions={[CURRENT, OTHER]} />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out other sessions" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(signOutOthers).not.toHaveBeenCalled();
    expect(fetchMySessions).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Sign out other sessions?" })).not.toBeInTheDocument();
  });

  it("confirming calls the route, refreshes the list, and shows the sheet's own toast", async () => {
    signOutOthers.mockResolvedValue({ kind: "done", count: 1 });
    fetchMySessions.mockResolvedValue([CURRENT]);
    render(<SessionsPlate sessions={[CURRENT, OTHER]} />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out other sessions" }));
    await userEvent.click(screen.getByRole("button", { name: "Sign out others" }));
    await waitFor(() => expect(signOutOthers).toHaveBeenCalledOnce());
    expect(await screen.findByText("Chrome on macOS · signed in 09:12 IST")).toBeInTheDocument();
    expect(screen.queryByText("Safari on iPhone · last seen yesterday, 22:40 IST")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out other sessions" })).not.toBeInTheDocument();
    expect(notifySuccess).toHaveBeenCalledExactlyOnceWith("Other sessions signed out · logged");
  });

  // The write landed and the re-read did not: the addendum's own §5 case. Showing the stale rows
  // with nothing said would let the member believe the sign-out never happened.
  it("says so when signing out lands but the re-read fails, rather than going quiet", async () => {
    signOutOthers.mockResolvedValue({ kind: "done", count: 1 });
    fetchMySessions.mockResolvedValue(null);
    render(<SessionsPlate sessions={[CURRENT, OTHER]} />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out other sessions" }));
    await userEvent.click(screen.getByRole("button", { name: "Sign out others" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The console could not be reached. Try again.");
  });

  it("a DELETE refusal leaves the sessions in place and shows the console's own message, without refreshing", async () => {
    signOutOthers.mockResolvedValue({ kind: "failed", message: "The console could not be reached. Try again." });
    render(<SessionsPlate sessions={[CURRENT, OTHER]} />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out other sessions" }));
    await userEvent.click(screen.getByRole("button", { name: "Sign out others" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The console could not be reached. Try again.");
    expect(fetchMySessions).not.toHaveBeenCalled();
    expect(screen.getByText("Safari on iPhone · last seen yesterday, 22:40 IST")).toBeInTheDocument();
  });
});
