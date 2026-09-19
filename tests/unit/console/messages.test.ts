import { describe, expect, it } from "vitest";
import { consoleMessages } from "@/console/messages";

function leaves(tree: unknown, path: string[] = []): [string, unknown][] {
  if (typeof tree !== "object" || tree === null) return [[path.join("."), tree]];
  return Object.entries(tree as Record<string, unknown>).flatMap(([k, v]) => leaves(v, [...path, k]));
}

describe("console messages", () => {
  it("has no empty strings and no placeholder text", () => {
    for (const [key, value] of leaves(consoleMessages)) {
      if (typeof value === "string") {
        expect(value.trim().length, key).toBeGreaterThan(0);
        expect(value, key).not.toMatch(/lorem|todo|tbd/i);
      } else {
        expect(typeof value, key).toBe("function");
      }
    }
  });

  it("words the sent state the same for every address", () => {
    expect(consoleMessages.signIn.sent.detail).toBe("If this address belongs to a console member, a sign-in link is on its way.");
    expect(consoleMessages.signIn.sent.againIn(42)).toBe("Send again in 42 s");
    expect(consoleMessages.frame.environment.previewHost("admin.localhost:4210")).toBe("Staging data · admin.localhost:4210");
  });
});
