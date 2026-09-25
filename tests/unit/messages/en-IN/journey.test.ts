import { describe, expect, it } from "vitest";
import { journey } from "@/messages/en-IN/journey";

describe("the chapters' trace card", () => {
  it("counts the party in words, singular for one", () => {
    expect(journey.chapters.partyOf(1)).toBe("one passenger");
    expect(journey.chapters.partyOf(3)).toBe("three passengers");
    expect(journey.chapters.partyOf(7)).toBe("7 passengers");
  });
});
