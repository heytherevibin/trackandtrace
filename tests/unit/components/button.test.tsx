import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button, buttonClassName } from "@/components/ui/button";

describe("Button", () => {
  it("renders its label and defaults to type=button", () => {
    render(<Button>Run</Button>);
    const button = screen.getByRole("button", { name: "Run" });
    expect(button).toHaveAttribute("type", "button");
  });
  it("marks loading with aria-busy, disables, and keeps the label in the tree for width", () => {
    render(<Button loading>Run</Button>);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();
    expect(button.textContent).toContain("Run");
  });
  it("exposes classes for links so buttons never nest", () => {
    expect(buttonClassName({ variant: "run" })).toContain("bg-accent");
    expect(buttonClassName({ variant: "primary" })).toContain("press");
  });
});
