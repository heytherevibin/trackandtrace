import { describe, expect, it } from "vitest";
import { consoleApiMessage } from "@/console/api-message";
import { consoleMessages } from "@/console/messages";
import type { ApiErrorBody } from "@/services/errors";

const error = (code: ApiErrorBody["code"], message: string): ApiErrorBody => ({ ok: false, code, message });

// Five call sites read this rule -- the member menu, both key clients, the setup token redeemer and
// the console's own error paths -- and it used to be five separate copies of the same ternary. The
// rule lives in one function now, so it is pinned in one place too.
describe("what a failed console request tells a member", () => {
  it("never shows SOURCE_UNAVAILABLE's own words", () => {
    expect(consoleApiMessage(error("SOURCE_UNAVAILABLE", "upstream 503: provider pool exhausted"))).toBe(consoleMessages.session.unavailable);
  });

  it("never shows INTERNAL's own words", () => {
    expect(consoleApiMessage(error("INTERNAL", "TypeError: cannot read properties of undefined"))).toBe(consoleMessages.session.unavailable);
  });

  it("passes through a refusal that was already written for a member to read", () => {
    expect(consoleApiMessage(error("INVALID_INPUT", "That key didn't answer. Try again."))).toBe("That key didn't answer. Try again.");
  });

  it("passes through an authentication refusal unchanged, so a member is told to sign in again", () => {
    expect(consoleApiMessage(error("UNAUTHENTICATED", consoleMessages.session.ended))).toBe(consoleMessages.session.ended);
  });
});
