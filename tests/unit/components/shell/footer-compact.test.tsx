import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/messages";

// A second vi.mock of the same module cannot live beside the landing's, so the compact footer has its own file.
vi.mock("next/navigation", () => ({ usePathname: () => "/pnr" }));

import { Footer } from "@/components/shell/footer";

const m = messages.subscribe;

afterEach(() => vi.unstubAllGlobals());

describe("the app pages' compact footer", () => {
  it("carries the sign-up field but not the landing's column heading", () => {
    render(<Footer />);
    expect(screen.getByLabelText(m.form.label)).toBeInTheDocument();
    expect(screen.queryByText(m.places.footerColumn)).not.toBeInTheDocument();
  });

  it("names the row for what it subscribes to, since a bare Email field says nothing on /login or /pre-booking", () => {
    render(<Footer />);
    const row = screen.getByRole("form", { name: m.places.footerColumn });
    expect(row).toContainElement(screen.getByLabelText(m.form.label));
  });

  it("keeps the disclaimer and the clock, which the row must never push out", () => {
    render(<Footer />);
    expect(screen.getByText(messages.common.notAffiliated, { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /IST/ })).toBeInTheDocument();
  });

  it("draws the sign-up row above the disclaimer line, not beneath it", () => {
    render(<Footer />);
    const field = screen.getByLabelText(m.form.label);
    const disclaimer = screen.getByText(messages.common.notAffiliated, { exact: false });
    expect(field.compareDocumentPosition(disclaimer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("uses the row layout: the button sits in a row beside the field, not directly in the form", () => {
    render(<Footer />);
    const button = screen.getByRole("button", { name: m.form.subscribe });
    // footer-column stacks the button straight under the form; footer-row wraps label, field and button in one row.
    expect(button.parentElement).not.toBe(button.closest("form"));
  });

  it("records the sign-up as coming from the footer, not from the landing", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true, message: m.sent }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<Footer />);
    await userEvent.type(screen.getByLabelText(m.form.label), "asha@example.in");
    await userEvent.click(screen.getByRole("button", { name: m.form.subscribe }));
    expect(await screen.findByRole("status")).toHaveTextContent(m.sent);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ email: "asha@example.in", list: "news", source: "footer" });
  });
});
