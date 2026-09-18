import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ServiceList } from "@/components/status/service-list";

describe("ServiceList", () => {
  it("lists what a traveller uses, each with its state, and nothing internal", () => {
    const { container } = render(<ServiceList status={{ overall: "partial", checks: "operational", accounts: "unavailable" }} />);
    const list = screen.getByRole("list", { name: "Service status" });
    expect(within(list).getByText("PNR checks").closest("li")).toHaveTextContent("Operational");
    expect(within(list).getByText("Accounts and watchlist sync").closest("li")).toHaveTextContent("Unavailable");
    expect(container.textContent).not.toMatch(/timetable|inventory|outcome|flag|railkit|rapid|fallback/i);
  });
});
