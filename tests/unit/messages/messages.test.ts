import { describe, expect, it } from "vitest";
import { messages } from "@/messages";

function leaves(tree: unknown, path: string[] = []): [string, unknown][] {
  if (typeof tree !== "object" || tree === null) return [[path.join("."), tree]];
  return Object.entries(tree as Record<string, unknown>).flatMap(([k, v]) => leaves(v, [...path, k]));
}

describe("messages", () => {
  it("has no empty strings and no placeholder text", () => {
    for (const [key, value] of leaves(messages)) {
      if (typeof value === "string") {
        expect(value.trim().length, key).toBeGreaterThan(0);
        expect(value, key).not.toMatch(/lorem|todo|tbd/i);
      } else {
        expect(typeof value, key).toBe("function");
      }
    }
  });
  it("interpolates function messages", () => {
    expect(messages.check.progress(4)).toBe("4 of 10 digits");
    expect(messages.status.withPosition("WL", 9)).toBe("WL 9");
  });
});
