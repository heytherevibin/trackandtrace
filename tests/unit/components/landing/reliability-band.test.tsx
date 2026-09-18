import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReliabilityBand } from "@/components/landing/reliability-band";

describe("ReliabilityBand", () => {
  it("promises live, time-stamped, never-estimated records and shows whether checks are up", () => {
    const { container } = render(<ReliabilityBand checks="operational" />);
    expect(screen.getByRole("heading", { level: 2, name: "Real records, checked live" })).toBeInTheDocument();
    for (const legend of ["Live at check", "Time-stamped", "Never estimated"]) expect(screen.getByText(legend)).toBeInTheDocument();
    expect(screen.getByText("PNR checks operational")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read the data policy" })).toHaveAttribute("href", "/accuracy");
    expect(container.textContent).not.toMatch(/timetable|inventory|outcome history|flags|railkit|rapid|fallback|data set/i);
  });

  it("says so plainly when checks are unavailable", () => {
    render(<ReliabilityBand checks="unavailable" />);
    expect(screen.getByText("PNR checks unavailable")).toBeInTheDocument();
  });
});
