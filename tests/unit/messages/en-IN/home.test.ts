import { describe, expect, it } from "vitest";
import { home } from "@/messages/en-IN/home";

// A live third-party service answers each check, and travellers see one service: Trakline.
// The FAQ says so without naming the provider or promising a source label on every result.

function answer(question: string): string | undefined {
  return home.faq.items.find((item) => item.q === question)?.a;
}

describe("home FAQ", () => {
  it("says where the data comes from without the retired claims", () => {
    const text = answer("Where does the data come from?");
    expect(text).toBeDefined();
    expect(text).not.toContain("named on every result");
    expect(text).not.toContain("Until one is connected");
    expect(text).toContain("third-party");
  });
});
