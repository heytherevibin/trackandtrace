import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HowItWorks } from "@/components/landing/how-it-works";

describe("02 · How it works (v4)", () => {
  it("is a region named by its heading, with three stops and their headings", () => {
    render(<HowItWorks />);
    const section = screen.getByRole("region", { name: /three stops/i });
    expect(within(section).getAllByRole("listitem")).toHaveLength(3);
    expect(within(section).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Enter the PNR", "Run the request", "Read what came back"]);
    expect(within(section).getByText("01 · Origin")).toBeInTheDocument();
  });

  it("draws the line with its three stops as decoration", () => {
    const { container } = render(<HowItWorks />);
    const line = container.querySelector('[aria-hidden="true"]');
    expect(line?.querySelectorAll("span")).toHaveLength(3);
  });
});
