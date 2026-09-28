import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Layered as the Team dialogs' tests are: the real ConfirmItsYou (TC-01) renders, `runTap` is
// mocked at the ceremony boundary and the save at the network one, so what is under test is this
// plate's wiring rather than WebAuthn or fetch.
const { runTap } = vi.hoisted(() => ({ runTap: vi.fn() }));
vi.mock("@/console/keys/tap-client", () => ({ runTap }));
vi.mock("@/components/ui/toast", () => ({ notify: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { LimitsPlate } from "@/console/settings/limits-plate";
import type { SaveResult } from "@/console/settings/limits-plate";
import type { Limits } from "@/console/settings/settings";

const REASON = "Lowering the daily budget while the provider is flaky.";

beforeEach(() => {
  runTap.mockReset();
  runTap.mockResolvedValue({ kind: "done" });
});

/** TC-01's own two steps, as the sheet draws them: a typed reason, then the tap. */
async function tap(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText("Reason"), REASON);
  await user.click(screen.getByRole("button", { name: "Tap your key" }));
}

// ---------------------------------------------------------------------------
// PLATE "Limits" (Console Switches.dc.html).
//
// The sheet's PROPS list the states this pins: ready, saving, saved, failed. It
// also says every row shows who changed it last and when, and that a change goes
// through Confirm it's you showing before → after.
//
// One row is drawn, and that is a decision rather than an omission: of the eight
// switches the sheet draws, `live_checks_per_day` is the only one anything reads.
// A control that writes an audit row and changes nothing tells an operator the
// site is doing something it is not.
// ---------------------------------------------------------------------------

function limits(over: Partial<Limits> = {}): Limits {
  return {
    liveChecks: { value: 300, fromConsole: false },
    used: 157,
    version: 4,
    changedAt: "2026-09-27T10:30:00.000Z",
    changedBy: "Asha Rao",
    ...over,
  };
}

type Save = (value: number, version: number, reason: string) => Promise<SaveResult>;

function draw(over: Partial<Limits> = {}, save: Save = vi.fn(async () => ({ ok: true as const }))) {
  render(<LimitsPlate limits={limits(over)} environment="production" save={save} />);
  return save;
}

describe("the Limits plate", () => {
  it("draws the number in force and the meter beside it", () => {
    draw();
    expect(screen.getByText("157 used today")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: /live checks per day/i })).toHaveValue(300);
  });

  it("says when the number is the deployment's rather than the console's", () => {
    draw({ liveChecks: { value: 300, fromConsole: false } });
    expect(screen.getByText(/from the deployment/i)).toBeInTheDocument();
  });

  it("does not say so once the console owns it", () => {
    draw({ liveChecks: { value: 900, fromConsole: true } });
    expect(screen.queryByText(/from the deployment/i)).not.toBeInTheDocument();
  });

  it("names who changed it last, and admits when nobody has", () => {
    draw();
    expect(screen.getByText(/Asha Rao/)).toBeInTheDocument();
    render(<LimitsPlate limits={limits({ changedBy: null, changedAt: null })} environment="production" save={vi.fn()} />);
    expect(screen.getAllByText(/Never changed from this console/).length).toBeGreaterThan(0);
  });

  it("keeps an unreadable meter blank rather than drawing a zero", () => {
    // "0 used today" is a claim about a quiet day. An unread counter is an absence.
    draw({ used: null });
    expect(screen.queryByText(/used today/)).not.toBeInTheDocument();
  });

  it("refuses a number outside the field's range without asking for a tap", async () => {
    const save = draw();
    const field = screen.getByRole("spinbutton", { name: /live checks per day/i });
    await userEvent.clear(field);
    await userEvent.type(field, "0");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(screen.getByText(/between 1 and 1,000,000/i)).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("refuses a number that is already in force, rather than spending a tap on nothing", async () => {
    const save = draw();
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(screen.getByText(/already the number in force/i)).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("asks Confirm it's you before saving, showing before → after", async () => {
    const save = draw();
    const field = screen.getByRole("spinbutton", { name: /live checks per day/i });
    await userEvent.clear(field);
    await userEvent.type(field, "900");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    // The sheet: "Every change goes through Confirm it's you, showing before → after."
    expect(screen.getByText("Live checks per day: 300 → 900")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("says what it saved once the tap goes through", async () => {
    const save = vi.fn(async () => ({ ok: true as const }));
    draw({}, save);
    const field = screen.getByRole("spinbutton", { name: /live checks per day/i });
    await userEvent.clear(field);
    await userEvent.type(field, "900");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await tap(userEvent.setup());

    expect(save).toHaveBeenCalledWith(900, 4, REASON);
    expect(await screen.findByText(/logged/i)).toBeInTheDocument();
  });

  // The regression. console_save_settings spends use_tap('settings.save', p_environment,
  // p_changes::text, p_reason); a tap minted over anything else is refused — and until this, the
  // plate minted ("Change the live-check limit", "Switches & settings", "900"), so every save failed.
  it("mints the tap over exactly the four fields console_save_settings spends", async () => {
    draw();
    const field = screen.getByRole("spinbutton", { name: /live checks per day/i });
    await userEvent.clear(field);
    await userEvent.type(field, "900");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await tap(userEvent.setup());

    expect(runTap).toHaveBeenCalledWith({ action: "settings.save", target: "production", value: '{"live_checks_per_day": 900}', reason: REASON });
  });

  it("draws the sheet's own words when the save does not reach the store", async () => {
    const save = vi.fn(async () => ({ ok: false as const, stale: false }));
    draw({}, save);
    const field = screen.getByRole("spinbutton", { name: /live checks per day/i });
    await userEvent.clear(field);
    await userEvent.type(field, "900");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await tap(userEvent.setup());

    expect(await screen.findByText("Not saved: the change didn't reach the store. Nothing changed.")).toBeInTheDocument();
  });

  it("tells a lost version race apart from a store that could not be reached", async () => {
    // Both leave the setting unchanged, and an operator told "it didn't reach the
    // store" about a change that DID reach it — made by somebody else — goes
    // looking for a broken database.
    const save = vi.fn(async () => ({ ok: false as const, stale: true }));
    draw({}, save);
    const field = screen.getByRole("spinbutton", { name: /live checks per day/i });
    await userEvent.clear(field);
    await userEvent.type(field, "900");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await tap(userEvent.setup());

    expect(await screen.findByText(/someone else changed this/i)).toBeInTheDocument();
    expect(screen.queryByText(/didn't reach the store/i)).not.toBeInTheDocument();
  });
});
