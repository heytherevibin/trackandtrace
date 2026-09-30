import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LegalDocument } from "@/components/legal/legal-document";
import { messages } from "@/messages";

// The privacy notice's version has to be ON THE PAGE, not only in the message tree: each email
// consent records the version it was given under, and a reader who cannot see which version they
// are reading cannot check what they agreed to.

const SECTIONS = [{ id: "one", title: "One", body: "First." }];

describe("the legal document", () => {
  it("shows the version beside the date when one is given", () => {
    render(<LegalDocument title="Privacy" lead="Lead." sections={SECTIONS} version="1.1" />);
    expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
    expect(screen.getByText("Version 1.1")).toBeInTheDocument();
  });

  it("shows no version when there is none, so Terms does not grow an empty one", () => {
    render(<LegalDocument title="Terms" lead="Lead." sections={SECTIONS} />);
    expect(screen.queryByText(/^Version/)).not.toBeInTheDocument();
  });

  it("draws the privacy notice's own sections, Email updates among them", () => {
    const m = messages.legal.privacy;
    render(<LegalDocument title={m.title} lead={m.lead} sections={m.sections} version={m.version} />);
    expect(screen.getByRole("heading", { name: /Email updates/i })).toBeInTheDocument();
    expect(screen.getByText(/deleted after 7 days/)).toBeInTheDocument();
    expect(screen.getByText("Version 1.1")).toBeInTheDocument();
  });
});
