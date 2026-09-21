import { describe, expect, it } from "vitest";
import type { ConsoleRole } from "@/console/auth/member";
import { consoleHref } from "@/console/href";
import { CONSOLE_MODULES, railFor, type ConsoleModule } from "@/console/nav";

const ROLES = ["owner", "admin", "support", "viewer"] as const satisfies readonly ConsoleRole[];

// A small, self-contained fixture -- built: true throughout -- so railFor's role filtering can be
// asserted meaningfully. The real CONSOLE_MODULES has no built module yet (see "today's reality"
// below); testing role filtering against it directly would assert nothing (task-4-addendum.md
// §1 -- that was the brief's own defect, fixed there). Shaped like the real thing but not
// exported from nav.ts: the fixture belongs in the test.
const FIXTURE: readonly ConsoleModule[] = [
  { num: "01", label: "Overview", group: "operate", roles: ["owner", "admin", "support", "viewer"], href: consoleHref("/"), built: true },
  { num: "02", label: "Sources & usage", group: "operate", roles: ["owner", "admin", "viewer"], href: consoleHref("/sources"), built: true },
  { num: "12", label: "Provider keys", group: "configure", roles: ["owner"], href: consoleHref("/provider-keys"), built: true },
  { num: "13", label: "Team", group: "configure", roles: ["owner", "admin", "support", "viewer"], href: consoleHref("/team"), built: false },
];

describe("railFor: role filtering (fixture)", () => {
  it("gives the owner every built module, grouped in the sheet's order", () => {
    expect(railFor("owner", FIXTURE)).toEqual([
      { group: "operate", modules: [FIXTURE[0], FIXTURE[1]] },
      { group: "configure", modules: [FIXTURE[2]] },
    ]);
  });

  it("gives the admin only what the admin role can see, dropping the group only Provider keys was in", () => {
    expect(railFor("admin", FIXTURE)).toEqual([{ group: "operate", modules: [FIXTURE[0], FIXTURE[1]] }]);
  });

  it("gives support the narrower set again", () => {
    expect(railFor("support", FIXTURE)).toEqual([{ group: "operate", modules: [FIXTURE[0]] }]);
  });

  it("gives the viewer Overview and Sources & usage, not Provider keys", () => {
    expect(railFor("viewer", FIXTURE)).toEqual([{ group: "operate", modules: [FIXTURE[0], FIXTURE[1]] }]);
  });

  it("never shows an unbuilt module, even to a role allowed to see it", () => {
    for (const role of ROLES) {
      const seen = railFor(role, FIXTURE).flatMap((g) => g.modules);
      expect(seen.some((m) => m.num === "13")).toBe(false);
    }
  });
});

describe("railFor against today's real CONSOLE_MODULES", () => {
  // This plan (2d-1) ships every module with built: false -- the brief's own ruling: a rail of
  // fourteen links that all lead nowhere is worse than a short one. This test pins that ruling
  // deliberately: it must change the day 2d-2 flips Team and the Audit log to built: true.
  it("shows nothing for any role, yet", () => {
    for (const role of ROLES) {
      expect(railFor(role)).toEqual([]);
    }
  });
});

describe("CONSOLE_MODULES", () => {
  // Main.dc.html:293-298's own `access` map (renderVals()) is the authority, not the brief's
  // table -- whose transcription was wrong for Admin/13 Team (task-4-addendum.md §5: the brief
  // said Admin could see Team; the sheet's own access.Admin list does not include '13').
  const ACCESS: Readonly<Record<ConsoleRole, readonly string[]>> = {
    owner: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14"],
    admin: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "14"],
    support: ["01", "06", "09", "10"],
    viewer: ["01", "02", "03"],
  };

  it("has fourteen modules, numbered 01 through 14 in the sheet's order", () => {
    expect(CONSOLE_MODULES.map((m) => m.num)).toEqual(["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14"]);
  });

  it("gives each module exactly the roles the sheet's own access map gives it", () => {
    // Not `module`: reserved by webpack's module wrapper (@next/next/no-assign-module-variable).
    for (const mod of CONSOLE_MODULES) {
      const allowed = ROLES.filter((role) => ACCESS[role].includes(mod.num));
      expect(mod.roles, `module ${mod.num}`).toEqual(allowed);
    }
  });

  it("groups the fourteen modules exactly as allGroups does", () => {
    const byGroup: Record<string, string[]> = {};
    for (const mod of CONSOLE_MODULES) (byGroup[mod.group] ??= []).push(mod.num);
    expect(byGroup).toEqual({
      operate: ["01", "02", "03", "04", "05"],
      people: ["06", "07", "08"],
      queues: ["09", "10"],
      configure: ["11", "12", "13"],
      record: ["14"],
    });
  });

  it("builds nothing yet -- this plan's own ruling", () => {
    expect(CONSOLE_MODULES.every((m) => m.built === false)).toBe(true);
  });

  it("gives every module a distinct, non-empty label and a console href", () => {
    const labels = new Set(CONSOLE_MODULES.map((m) => m.label));
    expect(labels.size).toBe(CONSOLE_MODULES.length);
    for (const mod of CONSOLE_MODULES) {
      expect(mod.label.length).toBeGreaterThan(0);
      expect(mod.href.startsWith("/")).toBe(true);
    }
  });
});
