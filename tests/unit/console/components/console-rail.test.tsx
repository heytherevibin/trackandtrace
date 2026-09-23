import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConsoleRole } from "@/console/auth/member";
import { consoleHref } from "@/console/href";
import { CONSOLE_MODULES, railFor, type ConsoleNavGroup } from "@/console/nav";
import { resetEnvCache } from "@/services/env";
import { buildLine, ConsoleRail, ConsoleRailDrawer } from "@/console/components/console-rail";

const ROLES = ["owner", "admin", "support", "viewer"] as const satisfies readonly ConsoleRole[];

const GROUPS: readonly ConsoleNavGroup[] = [
  {
    group: "operate",
    modules: [
      { num: "01", label: "Overview", group: "operate", roles: ["owner"], href: consoleHref("/"), built: true },
      { num: "02", label: "Sources & usage", group: "operate", roles: ["owner"], href: consoleHref("/sources"), built: true },
    ],
  },
  {
    group: "configure",
    modules: [{ num: "12", label: "Provider keys", group: "configure", roles: ["owner"], href: consoleHref("/provider-keys"), built: true }],
  },
];

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe("the console rail", () => {
  it("draws each group's legend and its modules, numbered and linked", () => {
    render(<ConsoleRail groups={GROUPS} />);
    expect(screen.getByRole("navigation", { name: "Console" })).toBeInTheDocument();

    expect(screen.getByText("Operate")).toBeVisible();
    expect(screen.getByText("Configure")).toBeVisible();

    const overview = screen.getByRole("link", { name: /Overview/ });
    expect(overview).toHaveAttribute("href", "/");
    expect(screen.getByText("01")).toBeVisible();

    expect(screen.getByRole("link", { name: /Provider keys/ })).toHaveAttribute("href", "/provider-keys");
  });

  it("draws nothing -- not even a legend -- for a group with no groups at all", () => {
    render(<ConsoleRail groups={[]} />);
    expect(screen.getByRole("navigation", { name: "Console" })).toBeInTheDocument();
    expect(screen.queryByText("Operate")).not.toBeInTheDocument();
  });

  it("shows Build dev when the environment carries no commit or build date (this test's own process)", () => {
    render(<ConsoleRail groups={GROUPS} />);
    expect(screen.getByText("Build dev")).toBeVisible();
  });

  it("draws the real build line once VERCEL_GIT_COMMIT_SHA and BUILD_DATE are known", () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "42c5317aabbccddeeff00112233445566778899");
    vi.stubEnv("BUILD_DATE", "2026-09-19");
    resetEnvCache();
    render(<ConsoleRail groups={GROUPS} />);
    // "Sept", not the sheet's hand-typed "Sep": @/utils/datetime's shared formatDate (already used
    // and tested for every other date in the app) is what Intl/CLDR's en-IN short month gives for
    // September -- confirmed directly (`node -e "new Intl.DateTimeFormat('en-IN',{month:'short'})…"`),
    // not a quirk of this test. Reusing the one shared, tested formatter wins over hand-rolling a
    // second one just to force the sheet's exact three letters (task-4-report.md has the detail).
    expect(screen.getByText("Build 42c5317 · 19 Sept 2026")).toBeVisible();
  });
});

// The brief's own first test ("at 390px the rail is not rendered and the bottom-sheet trigger is")
// could not be written as stated in 2d-1: railFor(role) was [] for every role against the real
// CONSOLE_MODULES (no module was built), and console-frame.tsx gates the rail behind
// `groups.length > 0`, so an assertion against real data would have passed against an empty page
// and proved nothing (task-10-addendum.md §1). That is no longer true as of 2d-2 task-8 -- an Owner
// now gets one group with one module -- but one Owner-only module still cannot show that a Viewer
// is filtered differently from an Admin, so this fixture (several modules, several groups, the same
// shape nav.test.ts and this file's own GROUPS already use) is still what lets "opening it lists the
// same modules railFor gives" mean anything. "Today's reality" below is asserted separately,
// against the real data, the way nav.test.ts's own real-CONSOLE_MODULES block does for railFor.
// A real browser layout at 390px is tests/e2e/console-auth/scans.spec.ts's; jsdom has none.
//
// task-10-fix-1.md: this was first built over src/components/ui/sheet.tsx's bottom tray, on the
// brief and addendum's own repeated "bottom sheet" instruction -- both wrong, per ShellPhone.dc.html's
// own drawer panel (left-anchored, border-right, no drag handle) and its `drawer`/`drawerOpen` prop
// name. These tests exercise the corrected drawer; the accessible shape (a "dialog" named "Console",
// a "navigation" of the same name inside it) is unchanged from the retired sheet version, since
// Base UI's Drawer and the generic Sheet wrapper both render that way -- only the drawer's own
// header content (Trakline, the Console tag, a "Close menu" button) and the drawer/sheet distinction
// itself are new.
describe("ConsoleRailDrawer: the phone trigger and its drawer", () => {
  it("is a trigger button; opening it lists the same groups and modules railFor gives, under the drawer's own Console landmark", async () => {
    render(<ConsoleRailDrawer groups={GROUPS} />);
    const trigger = screen.getByRole("button", { name: "Open menu" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(trigger);
    const drawer = await screen.findByRole("dialog", { name: "Console" });
    const nav = within(drawer).getByRole("navigation", { name: "Console" });

    expect(within(nav).getByText("Operate")).toBeVisible();
    expect(within(nav).getByText("Configure")).toBeVisible();
    const overview = within(nav).getByRole("link", { name: /Overview/ });
    expect(overview).toHaveAttribute("href", "/");
    expect(within(nav).getByText("01")).toBeVisible();
    expect(within(nav).getByRole("link", { name: /Provider keys/ })).toHaveAttribute("href", "/provider-keys");
  });

  // ShellPhone.dc.html's own drawer header (Trakline, the Console tag, Close menu) -- distinct from
  // ConsoleMasthead's own header above the backdrop, not a re-render of it.
  it("draws its own header -- Trakline, the Console tag, and a Close menu button -- not ConsoleMasthead's", async () => {
    render(<ConsoleRailDrawer groups={GROUPS} />);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const drawer = await screen.findByRole("dialog", { name: "Console" });
    expect(within(drawer).getByText("Trakline")).toBeVisible();
    // Two matches for "Console": the sr-only Drawer.Title (the dialog's own accessible name,
    // already asserted by findByRole above) and the visible Console tag beside the wordmark.
    expect(within(drawer).getAllByText("Console")).toHaveLength(2);
    const close = within(drawer).getByRole("button", { name: "Close menu" });
    expect(close).toBeVisible();
    fireEvent.click(close);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("draws a trigger but an empty drawer -- not even a legend -- for a group with no groups at all", async () => {
    render(<ConsoleRailDrawer groups={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const drawer = await screen.findByRole("dialog", { name: "Console" });
    expect(within(drawer).queryByText("Operate")).not.toBeInTheDocument();
  });

  it("shows the same build line ConsoleRail draws, once the drawer is open", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "42c5317aabbccddeeff00112233445566778899");
    vi.stubEnv("BUILD_DATE", "2026-09-19");
    resetEnvCache();
    render(<ConsoleRailDrawer groups={GROUPS} />);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(await screen.findByText("Build 42c5317 · 19 Sept 2026")).toBeVisible();
  });
});

// console-frame.tsx's own gate -- `groups.length > 0` drives both `<ConsoleRail>` and the `leading`
// slot's `<ConsoleRailDrawer>` together -- so a role that gets nothing from railFor gets neither the
// desktop rail nor the phone trigger. This is the same ternary nav.test.ts's own "railFor against
// today's real CONSOLE_MODULES" block pins at the railFor level; this test pins the boolean
// console-frame.tsx itself branches on, using the real (non-fixture) railFor and CONSOLE_MODULES.
//
// 2d-2 task-8 is where it stopped reading "no role, yet": 13 Team is built, and it is Owner-only
// (Main.dc.html:293-298's own access map), so an Owner was the first role for which this console
// rendered a rail at all. 2d-2b task-2 adds the second built module -- 14 Audit log, which the same
// access map gives to Owner *and* Admin -- so an Admin now gets a rail too, with one row in it.
// Support and a Viewer still get neither, because neither built module is theirs.
describe("today's reality: the rail and its phone trigger render for an Owner and an Admin, and for no one else", () => {
  it("groups.length > 0 is true for an Owner and an Admin against the real CONSOLE_MODULES", () => {
    for (const role of ["owner", "admin"] as const) {
      expect(railFor(role).length > 0, role).toBe(true);
      expect(railFor(role, CONSOLE_MODULES).length > 0, role).toBe(true);
    }
  });

  it("and false for a Support member and a Viewer", () => {
    for (const role of ROLES.filter((r) => r !== "owner" && r !== "admin")) {
      expect(railFor(role).length > 0, role).toBe(false);
      expect(railFor(role, CONSOLE_MODULES).length > 0, role).toBe(false);
    }
  });

  // What the Owner's rail actually draws, through the real components rather than a fixture: two
  // legends and two numbered, linked rows. Both layouts, because both are fed the same `groups`.
  it("draws Configure and Record, with a linked Team and Audit log row, in the rail and in the phone drawer alike", async () => {
    const groups = railFor("owner");
    render(<ConsoleRail groups={groups} />);
    const rail = screen.getByRole("navigation", { name: "Console" });
    expect(within(rail).getByText("Configure")).toBeVisible();
    expect(within(rail).getByRole("link", { name: /Team/ })).toHaveAttribute("href", "/team");
    expect(within(rail).getByText("13")).toBeVisible();
    expect(within(rail).getByText("Record")).toBeVisible();
    expect(within(rail).getByRole("link", { name: /Audit log/ })).toHaveAttribute("href", "/audit-log");
    expect(within(rail).getByText("14")).toBeVisible();

    render(<ConsoleRailDrawer groups={groups} />);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const drawer = await screen.findByRole("dialog", { name: "Console" });
    expect(within(drawer).getByText("Configure")).toBeVisible();
    expect(within(drawer).getByRole("link", { name: /Team/ })).toHaveAttribute("href", "/team");
    expect(within(drawer).getByRole("link", { name: /Audit log/ })).toHaveAttribute("href", "/audit-log");
  });

  // An Admin's rail is the Audit log alone: Team is Owner-only, so the Configure group is dropped
  // entirely rather than rendered empty.
  it("gives an Admin the Record group and nothing else", () => {
    render(<ConsoleRail groups={railFor("admin")} />);
    const rail = screen.getByRole("navigation", { name: "Console" });
    expect(within(rail).getByText("Record")).toBeVisible();
    expect(within(rail).queryByText("Configure")).not.toBeInTheDocument();
    expect(within(rail).getAllByRole("link")).toHaveLength(1);
  });
});

describe("buildLine", () => {
  it("draws the short sha and the formatted date when both are known", () => {
    expect(buildLine("42c5317aabbccddeeff00112233445566778899", "2026-09-19")).toBe("Build 42c5317 · 19 Sept 2026");
  });

  it("says Build dev when neither is known -- local development", () => {
    expect(buildLine(undefined, undefined)).toBe("Build dev");
  });

  it("says Build dev rather than a sha with no date -- never fabricate the date", () => {
    expect(buildLine("42c5317aabbccddeeff00112233445566778899", undefined)).toBe("Build dev");
  });

  it("says Build dev rather than a date with no sha", () => {
    expect(buildLine(undefined, "2026-09-19")).toBe("Build dev");
  });
});
