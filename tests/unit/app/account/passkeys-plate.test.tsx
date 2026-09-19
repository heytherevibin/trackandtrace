import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/auth-client", () => ({
  passkeysUsable: vi.fn(() => true),
  listPasskeys: vi.fn(async () => []),
  registerPasskey: vi.fn(),
  deletePasskey: vi.fn(),
}));
vi.mock("@/components/ui/toast", () => ({ notify: { success: vi.fn(), error: vi.fn() } }));

const { PasskeysPlate } = await import("@/app/(site)/account/passkeys-plate");
const auth = await import("@/services/auth-client");
const { notify } = await import("@/components/ui/toast");

const PASSKEY = { id: "p1", name: "iPhone", createdAt: "2026-09-16T06:30:00.000Z", lastUsedAt: "2026-09-17T06:30:00.000Z" };

describe("PasskeysPlate", () => {
  beforeEach(() => {
    vi.mocked(auth.passkeysUsable).mockReturnValue(true);
    vi.mocked(auth.listPasskeys).mockResolvedValue([]);
    vi.mocked(auth.registerPasskey).mockReset();
    vi.mocked(auth.deletePasskey).mockReset();
    vi.mocked(notify.success).mockReset();
    vi.mocked(notify.error).mockReset();
  });

  it("says plainly when the account has no passkey yet, and offers to add one", async () => {
    render(<PasskeysPlate />);
    expect(await screen.findByText("No passkeys on this account yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a passkey" })).toBeEnabled();
  });

  it("lists a registered passkey with when it was added and last used", async () => {
    vi.mocked(auth.listPasskeys).mockResolvedValue([PASSKEY]);
    render(<PasskeysPlate />);
    const row = await screen.findByRole("listitem");
    expect(row).toHaveTextContent("iPhone");
    expect(within(row).getByText(/^Added .* · Last used /)).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Remove iPhone" })).toBeInTheDocument();
  });

  it("adds a passkey and lists it", async () => {
    vi.mocked(auth.registerPasskey).mockResolvedValue({ ok: true });
    render(<PasskeysPlate />);
    await screen.findByText("No passkeys on this account yet.");
    vi.mocked(auth.listPasskeys).mockResolvedValue([PASSKEY]);
    fireEvent.click(screen.getByRole("button", { name: "Add a passkey" }));
    expect(screen.getByRole("button", { name: "Waiting for your device…" })).toBeInTheDocument();
    expect(await screen.findByRole("listitem")).toHaveTextContent("iPhone");
    expect(notify.success).toHaveBeenCalledWith("Passkey added. You can sign in with it next time.");
  });

  it("keeps the list unchanged when the device prompt is dismissed", async () => {
    vi.mocked(auth.registerPasskey).mockResolvedValue({ ok: false, message: null });
    render(<PasskeysPlate />);
    await screen.findByText("No passkeys on this account yet.");
    fireEvent.click(screen.getByRole("button", { name: "Add a passkey" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add a passkey" })).toBeEnabled());
    expect(notify.error).not.toHaveBeenCalled();
    expect(notify.success).not.toHaveBeenCalled();
  });

  it("removes a passkey", async () => {
    vi.mocked(auth.listPasskeys).mockResolvedValue([PASSKEY]);
    vi.mocked(auth.deletePasskey).mockResolvedValue({ ok: true });
    render(<PasskeysPlate />);
    const row = await screen.findByRole("listitem");
    vi.mocked(auth.listPasskeys).mockResolvedValue([]);
    fireEvent.click(within(row).getByRole("button", { name: /Remove/ }));
    await waitFor(() => expect(auth.deletePasskey).toHaveBeenCalledWith("p1"));
    expect(await screen.findByText("No passkeys on this account yet.")).toBeInTheDocument();
    expect(notify.success).toHaveBeenCalledWith("Passkey removed.");
  });

  it("says so where the browser cannot use passkeys, and offers nothing that would fail", async () => {
    vi.mocked(auth.passkeysUsable).mockReturnValue(false);
    render(<PasskeysPlate />);
    expect(await screen.findByText("This browser cannot use passkeys. Open the account on a device that can.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a passkey" })).toBeNull();
  });
});
