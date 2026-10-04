import { describe, expect, it, vi } from "vitest";

const { withdrawRow } = vi.hoisted(() => ({ withdrawRow: vi.fn(async () => "done") }));
vi.mock("@/services/subscriptions/store", () => ({ withdrawRow }));

import { composeMail } from "../../../scripts/announce-plan.mjs";
import { POST } from "@/app/api/unsubscribe/one-click/route";
import { letterText, listHeaders } from "@/services/announcements/letter";
import { signUnsubscribe, unsubscribeKey, unsubscribeUrl } from "@/services/subscriptions/links";

// The recipient's only exit, and a legal obligation. The link a reader's mail client POSTs is the one
// the runner COMPOSED, so this takes it out of the composed message exactly as a mail client would and
// hands it to the real route. Nothing about the signature is recomputed on this side of the assertion:
// the earlier tests compared the composed signature with one computed by the same function, which
// stays green when that function is wrong (a base64 digest instead of base64url, say) while the route
// answers 400 to every real one-click POST, forever.

const PERSON = "8a1f2c3d-0000-4000-8000-000000000001";

function composed(list: "news" | "availability") {
  return composeMail({
    letter: { id: "L1", list, subject: "A new chart view", body: "Hello.", state: "sending", queuedAt: "2026-10-01T09:00:00.000Z" },
    personId: PERSON,
    email: "a@example.in",
    origin: "https://trakline.in",
    from: "Trakline <updates@trakline.in>",
    // The same wiring `announce-send.mjs` gives the runner.
    sign: (person: string, l: string) => signUnsubscribe(unsubscribeKey(), person, l),
    deps: { letterText, listHeaders, unsubscribeUrl },
  });
}

/** What a mail client does with the header: take the URL out of its angle brackets. */
const oneClickTarget = (headers: Record<string, string>): string => {
  const match = /^<([^>]+)>$/.exec(headers["List-Unsubscribe"] ?? "");
  if (!match?.[1]) throw new Error("List-Unsubscribe is not a bracketed URL");
  return match[1];
};

describe("the one-click link the runner composes", () => {
  it.each(["news", "availability"] as const)("is accepted by the real route for the %s list, with the POST body RFC 8058 fixes", async (list) => {
    withdrawRow.mockClear();
    const mail = composed(list);
    expect(mail.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const res = await POST(new Request(oneClickTarget(mail.headers), { method: "POST", body: mail.headers["List-Unsubscribe-Post"] }));
    expect(res.status).toBe(200);
    expect(withdrawRow).toHaveBeenCalledWith(PERSON, list, null);
  });

  it("is refused for the other list: the signature covers the list it was composed for", async () => {
    withdrawRow.mockClear();
    const target = oneClickTarget(composed("news").headers).replace("l=news", "l=availability");
    const res = await POST(new Request(target, { method: "POST", body: "List-Unsubscribe=One-Click" }));
    expect(res.status).toBe(400);
    expect(withdrawRow).not.toHaveBeenCalled();
  });
});
