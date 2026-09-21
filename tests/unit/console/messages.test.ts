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
    expect(consoleMessages.availability.productionOnly).toBe("The console runs only in production.");
    expect(consoleMessages.availability.localDatabase).toBe("Point the app at a local Supabase to use the console.");
  });

  it("says the same thing about an ended session everywhere", () => {
    expect(consoleMessages.session.ended).toBe("Your session ended. Sign in again.");
    expect(consoleMessages.session.noAccess).toBe("You don't have access to this.");
  });

  // ConsoleMyKeys.dc.html's own state script, transcribed word for word (task-9-addendum.md §1):
  // `st === 'Removed' ? 'Key removed · logged' : st === 'Others signed out' ? 'Other sessions
  // signed out · logged' : ''`.
  it("carries the sheet's own two toasts, byte for byte", () => {
    expect(consoleMessages.myKeys.removedToast).toBe("Key removed · logged");
    expect(consoleMessages.myKeys.sessions.signedOutToast).toBe("Other sessions signed out · logged");
  });

  // task-9-brief.md's own quoted copy: the confirm dialog's title, and its body naming the one
  // other session drawn on the sheet (Safari on iPhone) -- built from the list, never hardcoded.
  it("names the sessions plate's confirm dialog word for word", () => {
    expect(consoleMessages.myKeys.sessionsTitle).toBe("Sessions");
    expect(consoleMessages.myKeys.sessions.signOutOthers).toBe("Sign out other sessions");
    expect(consoleMessages.myKeys.sessions.confirmTitle).toBe("Sign out other sessions?");
    expect(consoleMessages.myKeys.sessions.confirmConfirm).toBe("Sign out others");
    expect(consoleMessages.myKeys.sessions.confirmBody(["Safari on iPhone"])).toBe("Safari on iPhone is signed out at once. This device stays signed in.");
  });
});
