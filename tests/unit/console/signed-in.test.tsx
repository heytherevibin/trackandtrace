import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Same hoisting trap as tests/unit/console/keys/key-step.test.tsx: vi.mock's factory is hoisted
// above a plain top-level const, so the mocks it closes over come from vi.hoisted instead.
const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("@/services/api-client", () => ({ apiRequest }));

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));

import { SignedIn } from "@/app/console/signed-in";

beforeEach(() => {
  apiRequest.mockReset().mockResolvedValue({ ok: true, data: { ok: true } });
  replace.mockReset();
});

describe("the signed-in seat", () => {
  it("says who is signed in, and offers the way out", () => {
    render(<SignedIn name="Asha Rao" role="owner" />);
    expect(screen.getByText("Asha Rao")).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
  });

  it("signs out: posts to /api/sign-out, then leaves for /login", async () => {
    render(<SignedIn name="Asha Rao" role="owner" />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(apiRequest).toHaveBeenCalledWith("/api/sign-out", { method: "POST" }, expect.anything());
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("shows the server's own refusal and stays put", async () => {
    apiRequest.mockResolvedValue({ ok: false, error: { ok: false, code: "INVALID_INPUT", message: "You don't have access to this." } });
    render(<SignedIn name="Asha Rao" role="owner" />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You don't have access to this.");
    expect(replace).not.toHaveBeenCalled();
  });

  it("maps SOURCE_UNAVAILABLE to the console's own line, not apiRequest's raw text", async () => {
    apiRequest.mockResolvedValue({
      ok: false,
      error: { ok: false, code: "SOURCE_UNAVAILABLE", message: "The service could not be reached. No result was generated." },
    });
    render(<SignedIn name="Asha Rao" role="owner" />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The console could not be reached. Try again.");
    expect(replace).not.toHaveBeenCalled();
  });

  it("maps INTERNAL to the console's own line, not apiRequest's raw text", async () => {
    apiRequest.mockResolvedValue({ ok: false, error: { ok: false, code: "INTERNAL", message: "The service returned a malformed response." } });
    render(<SignedIn name="Asha Rao" role="owner" />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The console could not be reached. Try again.");
    expect(replace).not.toHaveBeenCalled();
  });
});
