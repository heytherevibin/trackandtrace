import { describe, expect, it } from "vitest";
import { home } from "@/messages/en-IN/home";

function answer(question: string): string | undefined {
  return home.faq.items.find((item) => item.q === question)?.a;
}

describe("home FAQ", () => {
  // A live third-party service answers each check, and travellers see one service: Trakline.
  // The FAQ says so without naming the provider or promising a source label on every result.
  it("says where the data comes from without the retired claims", () => {
    const text = answer("Where does the data come from?");
    expect(text).toBeDefined();
    expect(text).not.toContain("named on every result");
    expect(text).not.toContain("Until one is connected");
    expect(text).toContain("third-party");
  });

  // Railway Board rule since December 2025: the first chart at least 10 hours before departure,
  // or 20:00 the night before for trains leaving 05:00–14:00. The four-hour rule ended in July 2025.
  it("gives the chart rule in force since December 2025", () => {
    const text = answer("When should I check?");
    expect(text).toBeDefined();
    expect(text).not.toMatch(/four hours|4 hours/i);
    expect(text).toContain("10 hours");
    expect(text).toContain("20:00 the night before");
  });
});

describe("home copy", () => {
  // The accuracy page's ledger was removed on 2026-09-18, so no landing line may promise one.
  it("never mentions a ledger", () => {
    expect(JSON.stringify(home)).not.toMatch(/ledger/i);
  });
});
