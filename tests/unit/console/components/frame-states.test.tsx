import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ConsoleError from "@/app/console/error";
import { NoAccessState, SessionEndedState } from "@/console/components/frame-states";

// The three states Main.dc.html's `page` prop draws besides Ready/Loading (task-5-brief.md's
// table, word for word). Main.dc.html:162-193 draws no-access and session-ended with no role
// attribute and error with role="alert"; no-access and error as h2 (embedded under a page's own
// h1) and session-ended as h1 (a full takeover, task-5-addendum.md §2) -- each test below checks
// the attribute the sheet actually gives that state, not a guess.

describe("the frame's no-access state", () => {
  it("names the member's own role, word for word from the sheet", () => {
    render(<NoAccessState role="support" />);
    expect(screen.getByRole("heading", { level: 2, name: "This module isn't part of the Support role." })).toBeInTheDocument();
    expect(screen.getByText("Ask an Owner if you need it.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Overview" })).toHaveAttribute("href", "/");
  });

  it("names a different role for a different member, rather than hardcoding Support", () => {
    render(<NoAccessState role="viewer" />);
    expect(screen.getByRole("heading", { name: "This module isn't part of the Viewer role." })).toBeInTheDocument();
  });

  it("carries no alert role -- the sheet's no-access plate has none (Main.dc.html:163)", () => {
    render(<NoAccessState role="support" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("the frame's error state (src/app/console/error.tsx)", () => {
  it("shows the sheet's own copy, as an alert, with the server's digest as the reference", () => {
    render(<ConsoleError error={Object.assign(new Error("boom"), { digest: "7f3a2c" })} retry={vi.fn()} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("This page didn't load");
    expect(screen.getByRole("heading", { level: 2, name: "This page didn't load" })).toBeInTheDocument();
    expect(screen.getByText("The console couldn't reach its data.")).toBeInTheDocument();
    expect(screen.getByText("Reference 7f3a2c")).toBeInTheDocument();
  });

  it("shows no reference line when the error carries no digest -- a code in no log is worse than none", () => {
    render(<ConsoleError error={new Error("boom")} retry={vi.fn()} />);
    expect(screen.queryByText(/Reference/)).not.toBeInTheDocument();
  });

  it("retries through the button Next hands the boundary", async () => {
    const retry = vi.fn();
    const user = userEvent.setup();
    render(<ConsoleError error={Object.assign(new Error("boom"), { digest: "7f3a2c" })} retry={retry} />);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe("the frame's session-ended state", () => {
  it("shows the sheet's own copy as the page's one heading, with a primary Sign in action", () => {
    render(<SessionEndedState />);
    const heading = screen.getByRole("heading", { name: "Your session ended" });
    expect(heading.tagName).toBe("H1");
    expect(screen.getByText("Sign in again to keep working.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  it("carries no alert role -- the sheet's session-ended plate has none either (Main.dc.html:186)", () => {
    render(<SessionEndedState />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
