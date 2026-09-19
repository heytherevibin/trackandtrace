import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EnvStrip } from "@/console/components/env-strip";

// B0: Production and Preview differ by shape and word, never by colour.
describe("the environment strip", () => {
  it("draws production as a hairline with a filled tag and the host", () => {
    const { container } = render(<EnvStrip production host="admin.trakline.in" />);
    expect(screen.getByText("Production")).toHaveClass("bg-accent-soft", "uppercase");
    expect(screen.getByText("admin.trakline.in")).toBeInTheDocument();
    expect(container.firstElementChild).not.toHaveClass("border-dashed");
  });

  it("draws preview as a dashed rule with an outline tag and the staging line", () => {
    const { container } = render(<EnvStrip production={false} host="admin.localhost:4210" />);
    expect(screen.getByText("Preview")).toHaveClass("border-accent-text", "uppercase");
    expect(screen.getByText("Staging data · admin.localhost:4210")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("border-dashed");
  });
});
