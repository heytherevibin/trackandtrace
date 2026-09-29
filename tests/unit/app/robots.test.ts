import { describe, expect, it } from "vitest";
import robots from "@/app/robots";

describe("robots.txt", () => {
  it("keeps crawlers off the PNR page, the API, auth and the end-to-end run's fixture pages", () => {
    const rules = [robots().rules].flat();
    expect(rules).toHaveLength(1);
    expect(rules[0]?.disallow).toEqual(["/pnr", "/api/", "/auth/", "/e2e/"]);
  });
});
