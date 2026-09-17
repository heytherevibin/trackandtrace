import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";

describe("Skeleton", () => {
  it("announces the wait once and hides the shapes", () => {
    const { container } = render(
      <SkeletonGroup label="Requesting railway data">
        <Skeleton />
        <Skeleton variant="text" />
      </SkeletonGroup>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Requesting railway data");
    expect(container.querySelectorAll('[aria-hidden="true"].skeleton')).toHaveLength(2);
  });
});
