import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { runTap, refresh } = vi.hoisted(() => ({ runTap: vi.fn(), refresh: vi.fn() }));
vi.mock("@/console/keys/tap-client", () => ({ runTap }));
vi.mock("@/components/ui/toast", () => ({ notify: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { consoleMessages } from "@/console/messages";
import { noticeChanges } from "@/console/settings/notice";
import { NoticePlate, type NoticeSave } from "@/console/settings/notice-plate";
import { settingsTap } from "@/console/settings/settings-tap";

// ---------------------------------------------------------------------------
// PLATE "Switches", ROW "Site notice" (Console Switches.dc.html): a name and its
// state as a tag, a one-line effect, "Last changed … by …", the text (160) with a
// preview of the strip travellers see, and an Off · On control. Every change goes
// through Confirm it's you, showing before → after.
// ---------------------------------------------------------------------------

const m = consoleMessages.settings;
const REASON = "Maintenance window tonight, warning travellers";
const TEXT = "Planned maintenance on 21 Sep, 02:00–03:00 IST. Checks may be slow.";

beforeEach(() => {
  runTap.mockReset().mockResolvedValue({ kind: "done" });
  refresh.mockReset();
});

function draw(over: { on?: boolean; text?: string; version?: number | null } = {}, save: NoticeSave = vi.fn(async () => ({ ok: true as const }))) {
  render(
    <NoticePlate
      notice={{ on: over.on ?? false, text: over.text ?? TEXT, version: over.version === undefined ? 3 : over.version }}
      rowVersion={7}
      environment="production"
      lastChanged={{ at: "2026-09-28T10:15:00+05:30", by: "Rohan Iyer" }}
      save={save}
    />,
  );
  return save;
}

async function tap(): Promise<void> {
  const dialog = screen.getByRole("dialog", { name: "Confirm it's you" });
  await userEvent.type(within(dialog).getByLabelText("Reason"), REASON);
  await userEvent.click(within(dialog).getByRole("button", { name: "Tap your key" }));
}

describe("NoticePlate", () => {
  it("draws the row: name, state, effect, who changed it last, the text and its preview", () => {
    draw();
    const plate = screen.getByRole("region", { name: m.switches.title });
    expect(plate).toHaveTextContent(m.switches.notice.name);
    expect(plate).toHaveTextContent(m.switches.notice.effect);
    expect(plate).toHaveTextContent("Last changed 28 Sept 2026, 10:15 IST by Rohan Iyer");
    expect(within(plate).getByLabelText(m.switches.notice.textLabel)).toHaveValue(TEXT);
    expect(within(plate).getByRole("img", { name: m.switches.notice.preview(TEXT) })).toBeInTheDocument();
    expect(within(plate).getByRole("button", { name: m.switches.off, pressed: true })).toBeInTheDocument();
  });

  it("turns it on through a tap minted over exactly what will be saved", async () => {
    const save = draw();
    await userEvent.click(screen.getByRole("button", { name: m.switches.on }));
    await userEvent.click(screen.getByRole("button", { name: m.switches.save }));
    expect(screen.getByText(`${m.switches.notice.name}: ${m.switches.off} → ${m.switches.on}`)).toBeInTheDocument();
    await tap();

    expect(runTap).toHaveBeenCalledWith({ ...settingsTap("production", noticeChanges({ on: true, text: TEXT, current: 3 })), reason: REASON });
    expect(save).toHaveBeenCalledWith({ on: true, text: TEXT, noticeVersion: 3, version: 7, reason: REASON });
    expect(await screen.findByText(m.state.saved(`${m.switches.notice.name} ${m.switches.on}`))).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("saves new text on a notice that is already on — which is a new notice to every device", async () => {
    const save = draw({ on: true });
    const field = screen.getByLabelText(m.switches.notice.textLabel);
    await userEvent.clear(field);
    await userEvent.type(field, "Checks are back.");
    expect(screen.getByRole("img", { name: m.switches.notice.preview("Checks are back.") })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: m.switches.save }));
    await tap();
    expect(save).toHaveBeenCalledWith({ on: true, text: "Checks are back.", noticeVersion: 3, version: 7, reason: REASON });
  });

  it("offers no save until something changed, and refuses to turn on an empty notice", async () => {
    draw({ text: "" });
    expect(screen.getByRole("button", { name: m.switches.save })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: m.switches.on }));
    await userEvent.click(screen.getByRole("button", { name: m.switches.save }));
    expect(screen.getByText(m.switches.notice.empty)).toBeInTheDocument();
    expect(runTap).not.toHaveBeenCalled();
  });

  it("stops the text at 160 characters, as the sheet does", () => {
    draw();
    expect(screen.getByLabelText(m.switches.notice.textLabel)).toHaveAttribute("maxLength", "160");
  });

  it("says the sheet's own words when the save does not reach the store", async () => {
    draw({}, vi.fn(async () => ({ ok: false as const, stale: false })));
    await userEvent.click(screen.getByRole("button", { name: m.switches.on }));
    await userEvent.click(screen.getByRole("button", { name: m.switches.save }));
    await tap();
    expect(await screen.findByText(m.state.failed)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("says never changed when the audit log has no change for it", () => {
    render(<NoticePlate notice={{ on: false, text: "", version: null }} rowVersion={7} environment="production" lastChanged={null} save={vi.fn()} />);
    expect(screen.getByText(m.neverChanged)).toBeInTheDocument();
  });
});
