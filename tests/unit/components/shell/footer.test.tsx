import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/messages";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
// The status line follows the deployment's configuration, which a test run does not have; pin it so the line's presence is what is asserted.
vi.mock("@/services/service-status", () => ({
  serviceStatus: () => ({ overall: "operational", checks: "operational", accounts: "operational" }),
}));

import { Footer } from "@/components/shell/footer";

const m = messages.subscribe;

afterEach(() => vi.unstubAllGlobals());

describe("the landing footer's sign-up", () => {
  it("gives the landing an Updates by email column", () => {
    render(<Footer />);
    expect(screen.getByText(m.places.footerColumn)).toBeInTheDocument();
    expect(screen.getByLabelText(m.form.label)).toBeInTheDocument();
  });

  it("keeps the disclaimer, the status line and the clock, which the column must never push out", () => {
    render(<Footer />);
    expect(screen.getByText(messages.common.footerDisclaimer)).toBeInTheDocument();
    expect(screen.getByText(messages.service.overall.operational)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /IST/ })).toBeInTheDocument();
  });

  it("records the sign-up as coming from the landing, not from the footer", async () => {
    // first_source is what 06-B's Leads list reads: the full footer is only ever the landing.
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true, message: m.sent }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<Footer />);
    await userEvent.type(screen.getByLabelText(m.form.label), "asha@example.in");
    await userEvent.click(screen.getByRole("button", { name: m.form.subscribe }));
    expect(await screen.findByRole("status")).toHaveTextContent(m.sent);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ email: "asha@example.in", list: "news", source: "landing" });
  });
});
