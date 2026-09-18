import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LegalDocument } from "@/components/legal/legal-document";
import { messages } from "@/messages";

const privacy = messages.legal.privacy;

describe("LegalDocument", () => {
  it("opens with the title block and the last-updated legend", () => {
    render(<LegalDocument title={privacy.title} lead={privacy.lead} sections={privacy.sections} />);
    expect(screen.getByRole("heading", { level: 1, name: "Privacy" })).toBeInTheDocument();
    expect(screen.getByText("What this product processes, where it keeps it, and how you remove it.")).toBeInTheDocument();
    expect(screen.getByText(messages.legal.updatedLine(messages.legal.updated))).toBeInTheDocument();
    expect(messages.legal.updated).toMatch(/^\d{1,2} [A-Z][a-z]+ \d{4}$/);
  });

  it("indexes every section in a marked plate", () => {
    render(<LegalDocument title={privacy.title} lead={privacy.lead} sections={privacy.sections} />);
    const index = screen.getByRole("navigation", { name: "On this page" });
    expect(index).toHaveClass("blueprint");
    expect(index.querySelectorAll(":scope > .corner")).toHaveLength(4);
    const links = within(index).getAllByRole("link");
    expect(links.map((a) => [a.getAttribute("href"), a.textContent])).toEqual(privacy.sections.map((s, i) => [`#${s.id}`, `${String(i + 1).padStart(2, "0")}${s.title}`]));
    expect(within(index).getByRole("link", { name: "What we process" })).toBeInTheDocument();
  });

  it("renders each section as a numbered kicker over a heading named exactly by its title", () => {
    render(<LegalDocument title={privacy.title} lead={privacy.lead} sections={privacy.sections} />);
    privacy.sections.forEach((s, i) => {
      const heading = screen.getByRole("heading", { level: 2, name: s.title });
      const section = heading.closest("section") as HTMLElement;
      expect(section.id).toBe(s.id);
      expect(section).toHaveAttribute("aria-labelledby", heading.id);
      expect(within(section).getByText(String(i + 1).padStart(2, "0"))).toBeInTheDocument();
      expect(within(section).getByText(s.body)).toBeInTheDocument();
    });
  });

  it("closes with the disclaimer", () => {
    render(<LegalDocument title={privacy.title} lead={privacy.lead} sections={privacy.sections} />);
    expect(screen.getByText("Not affiliated with IRCTC or Indian Railways.")).toBeInTheDocument();
  });
});
