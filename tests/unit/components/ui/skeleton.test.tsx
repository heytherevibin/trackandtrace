import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "@/components/ui/skeleton";

describe("Skeleton", () => {
  // A block's width is in rem (w-48, w-60), so with the text at 200% it doubles: 384px of outline in a 238px plate ran
  // the page 86px sideways for as long as the watchlist loaded (360×740; the nightly caught it mid-load).
  it("is never wider than the box it stands in, whatever width it is given", () => {
    const { container } = render(<Skeleton className="h-6 w-48" />);
    expect(container.firstElementChild).toHaveClass("w-48", "max-w-full");
  });
});
