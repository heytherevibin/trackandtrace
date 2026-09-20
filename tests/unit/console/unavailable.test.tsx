import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// SignedOutFrame is an async server component (it reads next/headers): only Playwright can render
// it. Stub it with a passthrough so this test exercises Unavailable's own plate and message.
vi.mock("@/console/components/signed-out-frame", () => ({
  SignedOutFrame: ({ children }: { readonly children: React.ReactNode }) => children,
}));

const { Unavailable } = await import("@/console/components/unavailable");

// Where the console must not run (spec 3A): a static plate, so it needs a real heading and no
// live-region role.
describe("Unavailable", () => {
  it("titles the plate with a real h1, the document's only heading", () => {
    render(<Unavailable reason="production-only" />);
    const heading = screen.getByRole("heading", { level: 1, name: "Console" });
    expect(heading.tagName).toBe("H1");
  });

  it("has no role=status on its static message", () => {
    render(<Unavailable reason="production-only" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps the drawn wording for each reason", () => {
    const { rerender } = render(<Unavailable reason="production-only" />);
    expect(screen.getByText("The console runs only in production.")).toBeInTheDocument();
    rerender(<Unavailable reason="local-database-needed" />);
    expect(screen.getByText("Point the app at a local Supabase to use the console.")).toBeInTheDocument();
  });
});
