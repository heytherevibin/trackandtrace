import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionKicker } from "@/components/landing/sheet-type";

describe("SectionKicker", () => {
  it("is v4's kicker: a Space Mono legend in the link blue, plain text", () => {
    const { container } = render(<SectionKicker>02 · How it works</SectionKicker>);
    const kicker = container.firstElementChild as HTMLElement;
    expect(kicker.textContent).toBe("02 · How it works");
    expect(kicker).toHaveClass("legend", "text-link");
    expect(kicker.children).toHaveLength(0);
  });
});
