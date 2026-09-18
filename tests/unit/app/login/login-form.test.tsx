import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/services/auth-client", () => ({ sendMagicLink: vi.fn(), signInWithGoogle: vi.fn(), signInWithPasskey: vi.fn(), passkeysUsable: vi.fn(() => true) }));

const { LoginForm } = await import("@/app/login/login-form");
const auth = await import("@/services/auth-client");

beforeEach(() => {
  vi.mocked(auth.sendMagicLink).mockReset();
  vi.mocked(auth.signInWithGoogle).mockReset();
  vi.mocked(auth.signInWithPasskey).mockReset();
  vi.mocked(auth.passkeysUsable).mockReturnValue(true);
  router.push.mockReset();
  router.refresh.mockReset();
}); 

describe("LoginForm", () => {
  it("draws the sign-in sheet with the email well and both routes in", () => {
    render(<LoginForm configured google passkey={false} error={null} />);
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByText("Keeps your watchlist across devices. No password: a link to your inbox, or Google.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("placeholder", "you@example.com");
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.getByText("Checking a PNR never needs an account.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue without an account" })).toHaveAttribute("href", "/");
  });

  it("refuses an invalid email with the error line and sends nothing", () => {
    render(<LoginForm configured google={false} passkey={false} error={null} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(auth.sendMagicLink).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "not-an-email2" } });
    expect(screen.queryByText("Enter a valid email address.")).toBeNull();
  });

  it("sends the link, shows sending, then the inbox state, and returns to the form", async () => {
    let resolve: (value: Awaited<ReturnType<typeof auth.sendMagicLink>>) => void = () => undefined;
    vi.mocked(auth.sendMagicLink).mockReturnValue(new Promise((r) => (resolve = r)));
    render(<LoginForm configured google={false} passkey={false} error={null} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "asha@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    expect(auth.sendMagicLink).toHaveBeenCalledWith("asha@example.com");
    expect(screen.getByRole("button", { name: "Sending…" })).toBeInTheDocument();

    resolve({ ok: true });
    expect(await screen.findByRole("heading", { level: 2, name: "Check your inbox" })).toBeInTheDocument();
    expect(screen.getByText("We sent a sign-in link to asha@example.com. It expires in an hour.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send it again" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Use a different email" }));
    expect(screen.getByLabelText("Email")).toHaveValue("asha@example.com");
  });

  it("shows the service's refusal on the error line", async () => {
    vi.mocked(auth.sendMagicLink).mockResolvedValue({ ok: false, message: "Email rate limit exceeded" });
    render(<LoginForm configured google={false} passkey={false} error={null} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "asha@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    expect(await screen.findByText("Email rate limit exceeded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeInTheDocument();
  });

  it("starts Google sign-in", () => {
    vi.mocked(auth.signInWithGoogle).mockResolvedValue({ ok: true });
    render(<LoginForm configured google passkey={false} error={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(auth.signInWithGoogle).toHaveBeenCalled();
  });

  it("offers only the email link while Google sign-in is switched off", () => {
    render(<LoginForm configured google={false} passkey={false} error={null} />);
    expect(screen.getByText("Keeps your watchlist across devices. No password: a link to your inbox.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
  });

  it("offers a passkey where the deployment and the browser both have them, and signs in with it", async () => {
    vi.mocked(auth.signInWithPasskey).mockResolvedValue({ ok: true });
    render(<LoginForm configured google={false} passkey error={null} />);
    expect(screen.getByText("Keeps your watchlist across devices. No password: your device's passkey, or a link to your inbox.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue with a passkey" }));
    expect(screen.getByRole("button", { name: "Waiting for your device…" })).toBeInTheDocument();
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/account"));
    expect(router.refresh).toHaveBeenCalled();
  });

  it("hides the passkey route where the browser has no passkeys", () => {
    vi.mocked(auth.passkeysUsable).mockReturnValue(false);
    render(<LoginForm configured google={false} passkey error={null} />);
    expect(screen.queryByRole("button", { name: "Continue with a passkey" })).toBeNull();
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeEnabled();
  });

  it("shows a refused passkey on the error line, and says nothing when the prompt was dismissed", async () => {
    vi.mocked(auth.signInWithPasskey).mockResolvedValue({ ok: false, message: "No passkey found" });
    render(<LoginForm configured google={false} passkey error={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with a passkey" }));
    expect(await screen.findByText("No passkey found")).toBeInTheDocument();

    vi.mocked(auth.signInWithPasskey).mockResolvedValue({ ok: false, message: null });
    fireEvent.click(screen.getByRole("button", { name: "Continue with a passkey" }));
    await waitFor(() => expect(screen.queryByText("No passkey found")).toBeNull());
    expect(router.push).not.toHaveBeenCalled();
  });

  it("shows the expired-link error inside the plate", () => {
    render(<LoginForm configured google={false} passkey={false} error="link" />);
    expect(screen.getByText("That sign-in link did not work. Request a new one.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("says plainly when sign-in is not connected", () => {
    render(<LoginForm configured={false} google={false} passkey={false} error={null} />);
    expect(screen.getByRole("heading", { level: 2, name: "Sign-in is not connected" })).toBeInTheDocument();
    expect(screen.getByText("This deployment has no account service configured. Checking a PNR still works without an account.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.getByRole("link", { name: "Continue without an account" })).toBeInTheDocument();
  });
});
