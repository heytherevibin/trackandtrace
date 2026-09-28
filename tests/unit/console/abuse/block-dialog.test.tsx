import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { runTap, hashAddress, requestBlock, requestUnblock, refresh, notify } = vi.hoisted(() => ({
  runTap: vi.fn(),
  hashAddress: vi.fn(),
  requestBlock: vi.fn(),
  requestUnblock: vi.fn(),
  refresh: vi.fn(),
  notify: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/console/keys/tap-client", () => ({ runTap }));
vi.mock("@/console/abuse/abuse-client", () => ({ hashAddress, requestBlock, requestUnblock }));
vi.mock("@/components/ui/toast", () => ({ notify }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { BLOCK_ACTION, UNBLOCK_ACTION, blockTapValue, unblockTapValue } from "@/console/abuse/abuse";
import { BlockDialog } from "@/console/abuse/block-dialog";
import { UnblockButton } from "@/console/abuse/unblock-button";
import { consoleMessages } from "@/console/messages";

// ---------------------------------------------------------------------------
// TC-06, "Block an address", and Unblock. The address is hashed on entry: the tap
// is minted over the HASH, and after Continue the address is shown nowhere.
// runTap is mocked at the ceremony edge and the three calls at the network edge.
// ---------------------------------------------------------------------------

const m = consoleMessages.abuse;
const MEMBER = `4.${"a".repeat(43)}`;
const REASON = "Scripted checks from one address all morning";

beforeEach(() => {
  for (const f of [runTap, hashAddress, requestBlock, requestUnblock, refresh, notify.success, notify.error]) f.mockReset();
  runTap.mockResolvedValue({ kind: "done" });
  hashAddress.mockResolvedValue({ kind: "done", member: MEMBER });
  requestBlock.mockResolvedValue({ kind: "done" });
  requestUnblock.mockResolvedValue({ kind: "done" });
});

async function tap(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText("Reason"), REASON);
  await user.click(screen.getByRole("button", { name: "Tap your key" }));
}

describe("BlockDialog, from the page's primary", () => {
  it("hashes the address, mints the tap over the hash, and blocks", async () => {
    const user = userEvent.setup();
    render(<BlockDialog environment="production" />);
    await user.click(screen.getByRole("button", { name: m.block.trigger }));
    await user.type(screen.getByLabelText(m.block.addressLabel), "203.0.113.9");
    await user.click(screen.getByRole("radio", { name: m.block.durations["7d"] }));
    await user.type(screen.getByLabelText(m.block.noteLabel), "Scripted checks");
    await user.click(screen.getByRole("button", { name: m.block.continue }));

    expect(hashAddress).toHaveBeenCalledWith("203.0.113.9");
    // After Continue the address is gone from the screen: only its hash is shown.
    expect(screen.queryByText(/203\.0\.113\.9/)).not.toBeInTheDocument();
    expect(screen.getByText(m.block.summary("aaaa…aaaa"))).toBeInTheDocument();

    await tap(user);

    expect(runTap).toHaveBeenCalledWith({ action: BLOCK_ACTION, target: MEMBER, value: blockTapValue("production", "7d", "Scripted checks"), reason: REASON });
    expect(requestBlock).toHaveBeenCalledWith({ member: MEMBER, duration: "7d", note: "Scripted checks", reason: REASON });
    expect(notify.success).toHaveBeenCalledWith(m.block.doneToast);
    expect(refresh).toHaveBeenCalled();
  });

  it("says so, in the dialog, when the address is not one address", async () => {
    hashAddress.mockResolvedValue({ kind: "failed", message: m.errors.invalid });
    const user = userEvent.setup();
    render(<BlockDialog environment="production" />);
    await user.click(screen.getByRole("button", { name: m.block.trigger }));
    await user.type(screen.getByLabelText(m.block.addressLabel), "nonsense");
    await user.click(screen.getByRole("button", { name: m.block.continue }));
    expect(screen.getByRole("alert")).toHaveTextContent(m.errors.invalid);
    expect(runTap).not.toHaveBeenCalled();
  });

  it("defaults to 24 hours, and offers the four durations the sheet draws", async () => {
    const user = userEvent.setup();
    render(<BlockDialog environment="production" />);
    await user.click(screen.getByRole("button", { name: m.block.trigger }));
    const radios = within(screen.getByRole("radiogroup", { name: m.block.durationLabel })).getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-label") ?? r.closest("label")?.textContent)).toEqual([m.block.durations["1h"], m.block.durations["24h"], m.block.durations["7d"], m.block.durations.removed]);
    expect(screen.getByRole("radio", { name: m.block.durations["24h"] })).toBeChecked();
  });

  it("shows the console's refusal when the block does not go through", async () => {
    requestBlock.mockResolvedValue({ kind: "failed", message: m.errors.notBlocked });
    const user = userEvent.setup();
    render(<BlockDialog environment="production" />);
    await user.click(screen.getByRole("button", { name: m.block.trigger }));
    await user.type(screen.getByLabelText(m.block.addressLabel), "203.0.113.9");
    await user.click(screen.getByRole("button", { name: m.block.continue }));
    await tap(user);
    expect(notify.error).toHaveBeenCalledWith(m.errors.notBlocked);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("BlockDialog, from a Most limited row", () => {
  it("has the hash already, so there is no address field and nothing to hash", async () => {
    const user = userEvent.setup();
    render(<BlockDialog environment="production" member={MEMBER} />);
    await user.click(screen.getByRole("button", { name: m.block.rowTrigger("aaaa…aaaa") }));
    expect(screen.queryByLabelText(m.block.addressLabel)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: m.block.continue }));
    expect(hashAddress).not.toHaveBeenCalled();
    await tap(user);
    expect(requestBlock).toHaveBeenCalledWith(expect.objectContaining({ member: MEMBER, duration: "24h" }));
  });
});

describe("UnblockButton", () => {
  it("lifts a block through a tap minted for this environment", async () => {
    const user = userEvent.setup();
    render(<UnblockButton environment="production" member={MEMBER} />);
    await user.click(screen.getByRole("button", { name: m.blocked.unblock("aaaa…aaaa") }));
    await tap(user);
    expect(runTap).toHaveBeenCalledWith({ action: UNBLOCK_ACTION, target: MEMBER, value: unblockTapValue("production"), reason: REASON });
    expect(requestUnblock).toHaveBeenCalledWith({ member: MEMBER, reason: REASON });
    expect(notify.success).toHaveBeenCalledWith(m.blocked.doneToast);
    expect(refresh).toHaveBeenCalled();
  });
});
