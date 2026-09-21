import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConsoleMasthead } from "@/console/components/console-masthead";

// ConsoleMasthead has no next/headers call of its own (unlike ConsoleFrame/SignedOutFrame), so
// unlike most of the signed-in frame it renders directly under @testing-library/react.
//
// `leading` (task-10-fix-1.md's third slot, added after `clock`/`member`) is additive and optional,
// the same shape those two already have.
//
// A correction, because a review caught the earlier claim being false and it had already been
// repeated once: task-4-fix-1-report.md said setup-flow.test.tsx, sign-in-form.test.tsx and
// unavailable.test.tsx all exercise SignedOutFrame. None of them do. The first two render their own
// client components, which never import ConsoleMasthead at all; the third mocks SignedOutFrame to a
// passthrough on purpose, and says so in its own comment. SignedOutFrame is only assembled by
// setup/page.tsx and login/page.tsx, both async server components reading next/headers, which
// vitest cannot render -- so only Playwright reaches them.
//
// The tests below are therefore the *only* automated proof that omitting a slot changes nothing.
// That is what they are for; do not read them as covering the pages themselves.
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
