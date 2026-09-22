import { describe, expect, it } from "vitest";
import type { ConsoleRole } from "@/console/auth/member";
import { consoleHref } from "@/console/href";
import { CONSOLE_MODULES, railFor, type ConsoleModule } from "@/console/nav";

const ROLES = ["owner", "admin", "support", "viewer"] as const satisfies readonly ConsoleRole[];

// A small, self-contained fixture -- built: true but for the last row -- so railFor's role
// filtering can be asserted meaningfully. The real CONSOLE_MODULES has exactly one built module as
// of 2d-2 task-8 (see "today's real CONSOLE_MODULES" below), and one Owner-only module cannot show
// that a Viewer is filtered differently from an Admin (task-4-addendum.md §1 -- that was the
// brief's own defect, fixed there). Shaped like the real thing but not exported from nav.ts: the
// fixture belongs in the test. Its row 13 is the unbuilt one on purpose, so "never shows an unbuilt
// module" has something to prove -- it is not the real module 13, whose roles are Owner-only.
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
  // 2d-1 shipped every module with built: false -- a rail of fourteen links that all lead nowhere is
  // worse than a short one. 2d-2 task-8 flipped the first of them (13 Team) and 2d-2b task-2 flips
  // the second (14 Audit log, src/app/console/audit-log/page.tsx). Two modules, two groups, and --
  // because the Audit log is Owner+Admin where Team is Owner-only -- the first role other than the
  // Owner to get a rail at all.
  const TEAM = CONSOLE_MODULES.find((m) => m.num === "13");
  const AUDIT = CONSOLE_MODULES.find((m) => m.num === "14");

  it("gives an Owner both built modules, each in its own group, in the sheet's order", () => {
    expect(TEAM).toBeDefined();
    expect(AUDIT).toBeDefined();
    expect(railFor("owner")).toEqual([
      { group: "configure", modules: [TEAM] },
      { group: "record", modules: [AUDIT] },
    ]);
  });

  // Main.dc.html:293-298's own access.Admin list has no '13' -- Team is Owner-only, whatever the
  // plan's table said (task-4-addendum.md §5, re-checked for task-8 in task-7-addendum.md §6) --
  // but it does have '14'.
  it("gives an Admin the Audit log alone, because Team is Owner-only", () => {
    expect(railFor("admin")).toEqual([{ group: "record", modules: [AUDIT] }]);
  });

  it("gives Support and a Viewer nothing, because neither built module is theirs", () => {
    expect(railFor("support")).toEqual([]);
    expect(railFor("viewer")).toEqual([]);
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

  // A module's flag flips to true in the same PR that adds its page, and two pages exist: 13 Team
  // (2d-2 task-8) and 14 Audit log (2d-2b task-2). Pinned as a list rather than a count so the day
  // 11 Switches or 01 Overview arrives, this test names what changed instead of counting one more.
  it("builds 13 Team and 14 Audit log, and nothing else yet", () => {
    expect(CONSOLE_MODULES.filter((m) => m.built).map((m) => m.num)).toEqual(["13", "14"]);
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
