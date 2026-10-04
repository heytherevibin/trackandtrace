import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { consoleMessages } from "@/console/messages";

const { refresh, requestStop, success, error } = vi.hoisted(() => ({ refresh: vi.fn(), requestStop: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/console/announcements/letters-client", () => ({ requestStop }));
vi.mock("@/components/ui/toast", () => ({ notify: { success, error } }));

import { StopButton } from "@/console/announcements/stop-button";

// "Stop sending?" (both boards). It says how many already have the letter, which cannot be
// recalled, how many will not get it, and that a stopped letter cannot be resumed — before anything
// is stopped.
const m = consoleMessages.announcements;
const ID = "a0000000-0000-4000-8000-000000000001";
const button = () => render(<StopButton id={ID} subject="Trakline news: a clearer chart view" sent={262} waiting={165} />);

beforeEach(() => {
  for (const fn of [refresh, requestStop, success, error]) fn.mockReset();
});

describe("StopButton", () => {
  it("asks first, with the letter's subject and what stopping costs", async () => {
    button();
    await userEvent.click(screen.getByRole("button", { name: m.detail.stop }));
    const dialog = screen.getByRole("alertdialog", { name: m.stopDialog.title });
    expect(within(dialog).getByText("Trakline news: a clearer chart view")).toBeInTheDocument();
    expect(within(dialog).getByText(m.stopDialog.detail("262", "165"))).toBeInTheDocument();
    expect(requestStop).not.toHaveBeenCalled();
  });

  it("stops on confirm, says so, and redraws the page", async () => {
    requestStop.mockResolvedValue({ kind: "done" });
    button();
    await userEvent.click(screen.getByRole("button", { name: m.detail.stop }));
    await userEvent.click(screen.getByRole("button", { name: m.stopDialog.confirm }));
    expect(requestStop).toHaveBeenCalledWith(ID);
    expect(success).toHaveBeenCalledWith(m.stopDialog.done);
    expect(refresh).toHaveBeenCalled();
  });

  it("changes nothing on Cancel", async () => {
    button();
    await userEvent.click(screen.getByRole("button", { name: m.detail.stop }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(requestStop).not.toHaveBeenCalled();
  });

  it("shows why a stop failed, and still redraws: the letter may have finished meanwhile", async () => {
    requestStop.mockResolvedValue({ kind: "failed", message: m.errors.notOpen });
    button();
    await userEvent.click(screen.getByRole("button", { name: m.detail.stop }));
    await userEvent.click(screen.getByRole("button", { name: m.stopDialog.confirm }));
    expect(error).toHaveBeenCalledWith(m.errors.notOpen);
    expect(refresh).toHaveBeenCalled();
  });
});
