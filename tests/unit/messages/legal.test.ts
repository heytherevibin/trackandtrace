import { describe, expect, it } from "vitest";
import { messages } from "@/messages";

// The privacy notice is versioned because each consent records the version it was given under
// (`subscriptions.consents.notice_version`). A notice that changed without its number changing
// would make those records say something untrue about what somebody agreed to.

describe("privacy notice v1.1", () => {
  it("has an Email updates section saying what, why, how long and how to withdraw", () => {
    const section = messages.legal.privacy.sections.find((s) => s.id === "email-updates");
    expect(section?.body).toMatch(/7 days/);
    expect(section?.body).toMatch(/until you unsubscribe/);
    expect(section?.body).toMatch(/every email/i);
  });

  it("shows its version", () => {
    expect(messages.legal.privacy.version).toBe("1.1");
  });
});
