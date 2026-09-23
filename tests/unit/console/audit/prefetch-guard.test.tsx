import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { render } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// `next/link` consumes `prefetch` itself and puts nothing in the DOM for it, so the prop is captured
// here rather than read off the rendered <a>.
const { linkProps } = vi.hoisted(() => ({ linkProps: [] as { href: string; prefetch: unknown }[] }));
vi.mock("next/link", () => ({
  default: ({ href, prefetch, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: unknown; children: ReactNode }) => {
    linkProps.push({ href, prefetch });
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

import { ConsoleRail } from "@/console/components/console-rail";
import { railFor } from "@/console/nav";

const ROOT = join(__dirname, "..", "..", "..", "..");
const AUDIT_LOG = "/audit-log";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function consoleComponents(): string[] {
  return [...walk(join(ROOT, "src", "console")), ...walk(join(ROOT, "src", "app", "console"))].filter((file) => file.endsWith(".tsx"));
}

/** A line that is prose about prefetching rather than code that turns it on. */
function isComment(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*");
}

/**
 * Every `prefetch` in the file that would actually enable prefetching:
 *
 * - `(?<![\w.\-])` and `(?![\w\-])` keep `next-router-prefetch` (the header this page reads) and any
 *   `prefetchFoo` identifier out of it.
 * - `prefetch={false}` is allowed: intent `'none'` prefetches nothing at all, so it cannot produce a
 *   headerless render. It is the *enabling* forms that break the guard.
 */
function prefetchProps(source: string): string[] {
  const found: string[] = [];
  for (const line of source.split("\n")) {
    if (isComment(line)) continue;
    for (const match of line.matchAll(/(?<![\w.\-])prefetch(?![\w\-])(\s*=\s*(\{[^}]*\}|"[^"]*"))?/g)) {
      if (match[2] === "{false}") continue;
      found.push(match[0].trim());
    }
  }
  return found;
}

/**
 * The Audit log page writes one "Opened the audit log" row per server render and skips the write
 * when `Next-Router-Prefetch` is present (src/app/console/audit-log/page.tsx). That guard holds only
 * because every console link takes Next's default fetch strategy:
 *
 * - `next/dist/client/app-dir/link.js:108-110`: no `prefetch` prop -> intent `'auto'`; `true` ->
 *   `'full'`; `false` -> `'none'`.
 * - `link.js:403-414`: `'auto'` -> `FetchStrategy.PPR`, `'full'` -> `FetchStrategy.Full`.
 * - `segment-cache/cache.js:1195` and `:1511` (the PPR paths) set `NEXT_ROUTER_PREFETCH_HEADER: '1'`.
 * - `cache.js:1954-1958` (`FetchStrategy.Full`) is a bare `break`: **no header at all.**
 *
 * So `<Link prefetch>` pointing at /audit-log would make every viewport impression of that link
 * indistinguishable from a member opening the log, and write a permanent untrue row into a table
 * nothing can delete from. This file is what fails when someone adds it.
 *
 * It is not covered by the end-to-end run and cannot be:
 * `next/dist/client/components/links.js:217-223` disables viewport prefetch outright when
 * `NODE_ENV !== 'production'`, and the console e2e runs `next dev`. The e2e proves the *server* half
 * instead, by sending the real header itself (tests/e2e/console-auth/audit-log.spec.ts).
 */
describe("the audit log's prefetch guard", () => {
  it("leaves the rail's link to the Audit log on Next's default strategy, which is the one that sends the header", () => {
    linkProps.length = 0;
    render(<ConsoleRail groups={railFor("owner")} />);
    const audit = linkProps.filter((link) => link.href === AUDIT_LOG);
    expect(audit.length, "the rail should link to the Audit log").toBeGreaterThan(0);
    for (const link of audit) {
      // `undefined` is intent 'auto' -> FetchStrategy.PPR -> the header is sent. `true` is the
      // hazard; `false` prefetches nothing at all and is safe.
      expect(link.prefetch, "a <Link prefetch> to /audit-log sends no Next-Router-Prefetch header").not.toBe(true);
    }
  });

  // The rail is the only link that exists today. The point of this one is the link someone adds
  // tomorrow -- a breadcrumb, an Overview tile, a "see the full log" line under a plate.
  it("has no console link anywhere that turns prefetch on", () => {
    const offenders = consoleComponents().flatMap((file) => prefetchProps(readFileSync(file, "utf8")).map((hit) => `${relative(ROOT, file)}: ${hit}`));
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

// A guard rail for the guard rail: a scan that silently stopped looking at anything would pass.
describe("the scan itself", () => {
  it("covers both console trees", () => {
    const files = consoleComponents();
    expect(files.some((f) => f.endsWith(`components${sep}console-rail.tsx`))).toBe(true);
    expect(files.some((f) => f.endsWith(`audit-log${sep}page.tsx`))).toBe(true);
  });

  it("catches the enabling forms and lets the safe one through", () => {
    expect(prefetchProps("<Link href={x} prefetch>")).toEqual(["prefetch"]);
    expect(prefetchProps("<Link href={x} prefetch={true} />")).toEqual(["prefetch={true}"]);
    expect(prefetchProps('<Link href={x} prefetch="auto" />')).toEqual(['prefetch="auto"']);
    expect(prefetchProps("<Link href={x} prefetch={false} />")).toEqual([]);
  });

  it("is not fooled by the header this page reads, or by prose about it", () => {
    expect(prefetchProps('head.get("next-router-prefetch")')).toEqual([]);
    expect(prefetchProps(" * Next prefetches links it can see, so a prefetch is excluded here.")).toEqual([]);
    expect(prefetchProps("// a prefetch is not an open")).toEqual([]);
  });
});
