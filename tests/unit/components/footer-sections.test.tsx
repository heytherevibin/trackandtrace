import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FooterSections } from "@/components/shell/footer-sections";

describe("FooterSections", () => {
  it("lists the landing's section anchors with an icon beside each label", () => {
    render(<FooterSections />);
    const list = screen.getByRole("list", { name: "Sections" });
    const expected = [
      ["How it works", "#how"],
      ["The record", "#record"],
      ["Sources", "#sources"],
      ["Roadmap", "#roadmap"],
      ["FAQ", "#faq"],
    ] as const;
    for (const [name, href] of expected) {
      const link = within(list).getByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
      expect(link.querySelector("svg"), name).not.toBeNull();
    }
  });
});
