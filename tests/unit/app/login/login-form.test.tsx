import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/auth-client", () => ({ sendMagicLink: vi.fn(), signInWithGoogle: vi.fn() }));

const { LoginForm } = await import("@/app/login/login-form");
const auth = await import("@/services/auth-client");

beforeEach(() => {
  vi.mocked(auth.sendMagicLink).mockReset();
  vi.mocked(auth.signInWithGoogle).mockReset();
});

describe("LoginForm", () => {
  it("draws the sign-in sheet with the email well and both routes in", () => {
    render(<LoginForm configured error={null} />);
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByText("Keeps your watchlist across devices. No password: a link to your inbox, or Google.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("placeholder", "you@example.com");
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.getByText("Checking a PNR never needs an account.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue without an account" })).toHaveAttribute("href", "/");
  });

  it("refuses an invalid email with the error line and sends nothing", () => {
    render(<LoginForm configured error={null} />);
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
    render(<LoginForm configured error={null} />);
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
    render(<LoginForm configured error={null} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "asha@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    expect(await screen.findByText("Email rate limit exceeded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeInTheDocument();
  });

  it("starts Google sign-in", () => {
    vi.mocked(auth.signInWithGoogle).mockResolvedValue({ ok: true });
    render(<LoginForm configured error={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(auth.signInWithGoogle).toHaveBeenCalled();
  });

  it("shows the expired-link error inside the plate", () => {
    render(<LoginForm configured error="link" />);
    expect(screen.getByText("That sign-in link did not work. Request a new one.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("says plainly when sign-in is not connected", () => {
    render(<LoginForm configured={false} error={null} />);
    expect(screen.getByRole("heading", { level: 2, name: "Sign-in is not connected" })).toBeInTheDocument();
    expect(screen.getByText("This deployment has no account service configured. Checking a PNR still works without an account.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.getByRole("link", { name: "Continue without an account" })).toBeInTheDocument();
  });
});
