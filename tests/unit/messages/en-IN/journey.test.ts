import { describe, expect, it } from "vitest";
import { journey } from "@/messages/en-IN/journey";

describe("the chapters' trace card", () => {
  it("counts the party in words, singular for one", () => {
    expect(journey.chapters.partyOf(1)).toBe("one passenger");
    expect(journey.chapters.partyOf(3)).toBe("three passengers");
    expect(journey.chapters.partyOf(7)).toBe("7 passengers");
  });
});

describe("the window-seat run", () => {
  it("labels a kilometre post as v3 does, with the figure it is given", () => {
    expect(journey.run.km("530")).toBe("KM 530");
    expect(journey.run.km("084")).toBe("KM 084");
  });
});
