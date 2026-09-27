import { describe, expect, it } from "vitest";
import { boardStatus } from "@/components/landing/journey/board-status";

describe("boardStatus", () => {
  it("departs every stop before the page's, holds the page's at the platform, and calls only the next one", () => {
    expect([1, 2, 3, 4, 5, 6].map((stop) => boardStatus(stop, 3))).toEqual(["departed", "departed", "here", "next", "", ""]);
  });

  it("at DEP, the first stop is next and nothing has departed", () => {
    expect([1, 2].map((stop) => boardStatus(stop, 0))).toEqual(["next", ""]);
  });
});
