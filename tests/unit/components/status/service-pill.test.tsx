import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ServicePill } from "@/components/status/service-pill";

describe("ServicePill", () => {
  it.each([
    ["operational", "All systems operational"],
    ["partial", "Some services are unavailable"],
    ["down", "Services are unavailable"],
  ] as const)("says %s in one line, with nothing about sources", (overall, text) => {
    const { container } = render(<ServicePill status={{ overall, checks: "operational", accounts: "operational" }} />);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/source|connected|railkit|rapid/i);
  });
});
