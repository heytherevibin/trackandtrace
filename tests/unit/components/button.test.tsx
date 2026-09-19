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
  // Ghost words are small steel text, so they take the readable steel (AA); the locked steel
  // stays in the hover and press tints. Whole class tokens: text-accent-text is not text-accent.
  it("sets ghost words in the readable steel and keeps the steel tints", () => {
    render(<Button variant="ghost">Check another PNR</Button>);
    const button = screen.getByRole("button", { name: "Check another PNR" });
    expect(button).toHaveClass("text-accent-text", "hover:bg-accent/10", "active:bg-accent/18");
    expect(button).not.toHaveClass("text-accent");
    // Links dressed as ghost buttons share these classes, at every size.
    for (const size of ["sm", "md", "lg"] as const) {
      const tokens = buttonClassName({ variant: "ghost", size }).split(/\s+/);
      expect(tokens, size).toEqual(expect.arrayContaining(["text-accent-text", "hover:bg-accent/10", "active:bg-accent/18"]));
      expect(tokens, size).not.toContain("text-accent");
    }
  });
});
