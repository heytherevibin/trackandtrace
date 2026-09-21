import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { consoleHref } from "@/console/href";
import type { ConsoleNavGroup } from "@/console/nav";
import { resetEnvCache } from "@/services/env";
import { buildLine, ConsoleRail } from "@/console/components/console-rail";

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
