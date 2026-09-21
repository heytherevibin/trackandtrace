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
// cannot be written as stated: railFor(role) is [] for every role against the real CONSOLE_MODULES
// today (nav.ts's own ruling -- no module is built yet), and console-frame.tsx already gates the
// rail behind `groups.length > 0`, so an assertion against real data would pass against an empty
// page and prove nothing (task-10-addendum.md §1). ConsoleRailDrawer goes behind the same gate as
// ConsoleRail -- both are driven by the one `groups.length > 0` in console-frame.tsx -- so this
// fixture (built: true throughout, the same shape nav.test.ts and this file's own GROUPS already
// use) is what lets "opening it lists the same modules railFor gives" mean anything, and "today's
// reality" below is asserted separately, against the real data, the way nav.test.ts's own "today's
// reality" block already does for railFor itself.
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
// today's real CONSOLE_MODULES" block already pins at the railFor level ("shows nothing for any
// role, yet"); this test pins the boolean console-frame.tsx itself branches on, using the real
// (non-fixture) railFor and CONSOLE_MODULES, so it fails the day 2d-2 flips Team or the Audit log to
// built: true -- exactly as it should.
describe("today's reality: the rail and its phone trigger render for no role, yet", () => {
  it("groups.length > 0 is false for every role against the real CONSOLE_MODULES", () => {
    for (const role of ROLES) {
      expect(railFor(role).length > 0, role).toBe(false);
      expect(railFor(role, CONSOLE_MODULES).length > 0, role).toBe(false);
    }
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
