import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { messages } from "@/messages";

const at = vi.hoisted(() => ({ path: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => at.path }));
// The status line follows the deployment's configuration, which a test run does not have; pin it so the line's presence is what is asserted.
vi.mock("@/services/service-status", () => ({
  serviceStatus: () => ({ overall: "operational", checks: "operational", accounts: "operational" }),
}));

import { Footer } from "@/components/shell/footer";

const m = messages.shell.footer;

describe.each(["/", "/watchlist", "/login"])("the footer on %s", (path) => {
  it("is the full footer: brand and disclaimer, then Sections, Product and Company, four columns", () => {
    at.path = path;
    render(<Footer />);
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText(messages.common.footerDisclaimer)).toBeInTheDocument();
    for (const head of [m.sections, m.product, m.company]) expect(within(footer).getByText(head, { selector: "p" })).toBeInTheDocument();
    expect(footer.querySelectorAll("[data-footer-column]")).toHaveLength(4);
  });

  it("carries no sign-up: no form, no field, no Updates by email column", () => {
    at.path = path;
    render(<Footer />);
    const footer = screen.getByRole("contentinfo");
    expect(footer.querySelector("form")).toBeNull();
    // The switches carry hidden inputs of their own; the sign-up's is the email field.
    expect(footer.querySelector("input[name='email'], input[type='email']")).toBeNull();
    expect(within(footer).queryByText(messages.subscribe.places.footerColumn)).not.toBeInTheDocument();
  });

  it("keeps the bar: copyright, the status line, the clock and the Motion switch", () => {
    at.path = path;
    render(<Footer />);
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText(m.copyright(new Date().getFullYear()))).toBeInTheDocument();
    expect(within(footer).getByText(messages.service.overall.operational)).toBeInTheDocument();
    expect(within(footer).getByRole("img", { name: /IST/ })).toBeInTheDocument();
    expect(within(footer).getByRole("switch", { name: m.motion })).toBeInTheDocument();
  });
});
