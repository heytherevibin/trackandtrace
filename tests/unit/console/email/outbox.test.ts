import { beforeEach, describe, expect, it } from "vitest";
import { outbox } from "@/console/email/outbox";

const letter = (to: string) => ({ to, subject: "Sign in", text: "link" });

beforeEach(() => outbox.clear());

describe("the e2e outbox", () => {
  it("hands letters back oldest first and empties itself", () => {
    outbox.put(letter("a@trakline.in"));
    outbox.put(letter("b@trakline.in"));
    expect(outbox.take().map((l) => l.to)).toEqual(["a@trakline.in", "b@trakline.in"]);
    expect(outbox.take()).toEqual([]);
  });

  it("keeps only the most recent letters, so a long run cannot grow without bound", () => {
    for (let i = 0; i < 60; i++) outbox.put(letter(`${i}@trakline.in`));
    const held = outbox.take();
    expect(held).toHaveLength(50);
    expect(held[0]?.to).toBe("10@trakline.in");
  });
});
