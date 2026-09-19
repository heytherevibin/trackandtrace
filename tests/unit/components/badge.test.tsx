import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "@/components/ui/badge";

// 11px steel words must reach AA. The locked steel (#5980a6) is about 3.7:1 by day and 3.4:1 by
// night, so the outline tag keeps it for its edge and sets its words in the readable steel.
// toHaveClass matches whole class tokens: text-accent-text never counts as text-accent.

describe("Badge", () => {
  it("sets the outline tag's words in the readable steel and keeps the steel edge", () => {
    render(<Badge variant="outline">Free</Badge>);
    const tag = screen.getByText("Free");
    expect(tag).toHaveClass("border", "border-accent", "text-accent-text");
    expect(tag).not.toHaveClass("text-accent");
  });

  it("draws the console's steel tag: readable steel edge and words, frame tags in capitals", () => {
    render(
      <Badge variant="steel" caps>
        Console
      </Badge>,
    );
    const tag = screen.getByText("Console");
    expect(tag).toHaveClass("border", "border-accent-text", "text-accent-text", "font-display", "font-semibold", "uppercase", "tracking-caps");
    expect(tag).not.toHaveClass("border-accent", "text-accent");
  });
});
