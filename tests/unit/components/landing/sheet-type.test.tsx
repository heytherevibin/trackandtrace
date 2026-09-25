import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionKicker } from "@/components/landing/sheet-type";

describe("SectionKicker", () => {
  it("marks its words as a flap the journey may turn, keeping them plain text", () => {
    const { container } = render(<SectionKicker rule="mb-6">01 · Operating principles</SectionKicker>);
    const kicker = container.querySelector("[data-flap]");
    expect(kicker?.textContent).toBe("01 · Operating principles");
    expect(kicker?.children).toHaveLength(0);
  });
});
