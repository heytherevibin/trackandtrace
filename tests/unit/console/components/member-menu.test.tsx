import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Same hoisting trap as the signed-in placeholder test this replaced: vi.mock's factory is hoisted above
// a plain top-level const, so the mocks it closes over come from vi.hoisted instead.
const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("@/services/api-client", () => ({ apiRequest }));

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));

import type { ConsoleMember } from "@/console/auth/member";
import { MemberMenu } from "@/console/components/member-menu";

const MEMBER: ConsoleMember = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: "asha@example.com",
  name: "Asha Rao",
  role: "owner",
  status: "active",
};

beforeEach(() => {
  apiRequest.mockReset().mockResolvedValue({ ok: true, data: { ok: true } });
  replace.mockReset();
});

/** Opens the menu and waits for its content to actually be there -- Base UI positions it async. */
async function openMenu(): Promise<void> {
  await userEvent.click(screen.getByRole("button", { name: /Open the member menu/ }));
  await screen.findByRole("menuitem", { name: "My keys" });
}

describe("the member menu", () => {
  it("names the trigger after the member and their role", () => {
    render(<MemberMenu member={MEMBER} />);
    expect(screen.getByRole("button", { name: "Asha Rao, Owner. Open the member menu" })).toBeInTheDocument();
  });

  it("opens on exactly two items: My keys, a link to /keys, and Sign out, not a link", async () => {
    render(<MemberMenu member={MEMBER} />);
    await openMenu();

    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(2);

    const myKeys = screen.getByRole("menuitem", { name: "My keys" });
    expect(myKeys).toHaveAttribute("href", "/keys");

    const signOut = screen.getByRole("menuitem", { name: "Sign out" });
    expect(signOut).not.toHaveAttribute("href");
  });

  it("shows the member's name, email and role inside the menu", async () => {
    render(<MemberMenu member={MEMBER} />);
    await openMenu();
    expect(screen.getAllByText("Asha Rao").length).toBeGreaterThan(0);
    expect(screen.getByText("asha@example.com")).toBeVisible();
    expect(screen.getAllByText("Owner").length).toBeGreaterThan(0);
  });

  it("signs out: posts to /api/sign-out, then leaves for /login", async () => {
    render(<MemberMenu member={MEMBER} />);
    await openMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(apiRequest).toHaveBeenCalledWith("/api/sign-out", { method: "POST" }, expect.anything());
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("shows the server's own refusal and stays put", async () => {
    apiRequest.mockResolvedValue({ ok: false, error: { ok: false, code: "INVALID_INPUT", message: "You don't have access to this." } });
    render(<MemberMenu member={MEMBER} />);
    await openMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You don't have access to this.");
    expect(replace).not.toHaveBeenCalled();
  });

  it("maps SOURCE_UNAVAILABLE to the console's own line, not apiRequest's raw text", async () => {
    apiRequest.mockResolvedValue({
      ok: false,
      error: { ok: false, code: "SOURCE_UNAVAILABLE", message: "The service could not be reached. No result was generated." },
    });
    render(<MemberMenu member={MEMBER} />);
    await openMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The console could not be reached. Try again.");
    expect(replace).not.toHaveBeenCalled();
  });

  it("maps INTERNAL to the console's own line, not apiRequest's raw text", async () => {
    apiRequest.mockResolvedValue({ ok: false, error: { ok: false, code: "INTERNAL", message: "The service returned a malformed response." } });
    render(<MemberMenu member={MEMBER} />);
    await openMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The console could not be reached. Try again.");
    expect(replace).not.toHaveBeenCalled();
  });
});
