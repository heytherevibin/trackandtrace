import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const at = vi.hoisted(() => ({ path: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => at.path }));

import { FooterSections } from "@/components/shell/footer-sections";

const NAMES = ["How it works", "The record", "Roadmap", "FAQ"] as const;
const IDS = ["how", "record", "roadmap", "faq"] as const;

describe("FooterSections", () => {
  it("lists the landing's sections as plain in-page links on the landing, like the other footer columns", () => {
    at.path = "/";
    render(<FooterSections />);
    const list = screen.getByRole("list", { name: "Sections" });
    expect(within(list).getAllByRole("link").map((link) => link.textContent)).toEqual([...NAMES]);
    NAMES.forEach((name, i) => {
      const link = within(list).getByRole("link", { name });
      // Exactly "#id": the journey's in-page link handling matches a[href^="#"].
      expect(link).toHaveAttribute("href", `#${IDS[i]}`);
      expect(link.querySelector("svg"), name).toBeNull();
    });
  });

  it.each(["/watchlist", "/pnr/2345678909", "/login"])("points at the landing's sections from %s", (path) => {
    at.path = path;
    render(<FooterSections />);
    const list = screen.getByRole("list", { name: "Sections" });
    NAMES.forEach((name, i) => expect(within(list).getByRole("link", { name })).toHaveAttribute("href", `/#${IDS[i]}`));
  });
});
