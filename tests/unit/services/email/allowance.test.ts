import { describe, expect, it, vi } from "vitest";
import { CONFIRMATION_CEILING, countSent, emailDay, takeConfirmation } from "@/services/email/allowance";
import { MemoryKv, type Kv } from "@/services/kv";

// 01:30 IST on the 29th, and still the 28th in Resend's day. The two calendars disagree for five and
// a half hours every night, which is exactly when a traveller signing up would be told the wrong
// thing about when the allowance comes back.
const AT = new Date("2026-09-28T20:00:00Z");

describe("the email allowance", () => {
  it("is keyed by Resend's day, UTC — not India's", () => {
    expect(emailDay(AT)).toBe("2026-09-28");
  });

  it("gives confirmations while the day's count is below the ceiling, keeping the rest for console mail", async () => {
    const kv = new MemoryKv();
    for (let i = 0; i < CONFIRMATION_CEILING; i += 1) expect(await takeConfirmation(kv, "tt:test", AT)).toBe("ok");
    expect(await takeConfirmation(kv, "tt:test", AT)).toBe("spent");
    // A refused take gives its count back: the ceiling is not pushed up by people being refused.
    expect(await kv.get("tt:test:email:2026-09-28")).toBe(String(CONFIRMATION_CEILING));
  });

  it("counts console mail against the same day, so a busy console leaves fewer confirmations", async () => {
    const kv = new MemoryKv();
    for (let i = 0; i < CONFIRMATION_CEILING; i += 1) await countSent(kv, "tt:test", AT);
    expect(await takeConfirmation(kv, "tt:test", AT)).toBe("spent");
  });

  it("fails closed: an unreadable counter gives no confirmation", async () => {
    const broken = { incr: vi.fn(async () => Promise.reject(new Error("down"))) } as unknown as Kv;
    expect(await takeConfirmation(broken, "tt:test", AT)).toBe("unknown");
  });

  it("never lets counting break a send", async () => {
    const broken = { incr: vi.fn(async () => Promise.reject(new Error("down"))) } as unknown as Kv;
    await expect(countSent(broken, "tt:test", AT)).resolves.toBeUndefined();
  });
});
