import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConsoleMasthead } from "@/console/components/console-masthead";

// ConsoleMasthead has no next/headers call of its own (unlike ConsoleFrame/SignedOutFrame), so
// unlike most of the signed-in frame it renders directly under @testing-library/react.
//
// `leading` (task-10-fix-1.md's third slot, added after `clock`/`member`) is additive and optional,
// the same shape those two already have -- task-4-fix-1-report.md verified that pair by confirming
// every page that renders ConsoleMasthead with neither filled still passes unmodified
// (tests/unit/console/setup/setup-flow.test.tsx, tests/unit/console/sign-in-form.test.tsx,
// tests/unit/console/unavailable.test.tsx -- all exercise SignedOutFrame, which passes none of the
// three), rather than a dedicated test, since there wasn't one to update. This file adds the direct
// coverage neither addition had.
describe("ConsoleMasthead", () => {
  it("renders nothing extra when leading is omitted -- SignedOutFrame's own call shape", () => {
    render(<ConsoleMasthead />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open menu" })).not.toBeInTheDocument();
  });

  it("renders the given leading node before the mark", () => {
    render(<ConsoleMasthead leading={<button type="button">Open menu</button>} />);
    const banner = screen.getByRole("banner");
    const children = [...banner.children];
    const leadingIndex = children.findIndex((el) => el.textContent === "Open menu");
    const markLinkIndex = children.findIndex((el) => el.tagName === "A");
    expect(leadingIndex).toBeGreaterThanOrEqual(0);
    expect(markLinkIndex).toBeGreaterThan(leadingIndex);
  });
});
