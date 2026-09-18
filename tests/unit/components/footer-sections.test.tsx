import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FooterSections } from "@/components/shell/footer-sections";

describe("FooterSections", () => {
  it("lists the landing's sections as plain links, like the other footer columns", () => {
    render(<FooterSections />);
    const list = screen.getByRole("list", { name: "Sections" });
    const expected = [
      ["How it works", "#how"],
      ["The record", "#record"],
      ["Roadmap", "#roadmap"],
      ["FAQ", "#faq"],
    ] as const;
    expect(within(list).getAllByRole("link").map((link) => link.textContent)).toEqual(expected.map(([name]) => name));
    for (const [name, href] of expected) {
      const link = within(list).getByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
      expect(link.querySelector("svg"), name).toBeNull();
    }
  });
});
