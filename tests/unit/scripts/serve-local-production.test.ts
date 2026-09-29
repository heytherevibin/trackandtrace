import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LIVE_CREDENTIALS, activePnrSource, fixtureAllowed, parseEnv } from "@/services/env";
import {
  BUILD_STAMP,
  GUARD_LOG,
  LIVE_VARIABLES,
  buildRefusal,
  localBuildEnv,
  localProductionEnv,
  refusals,
  serverArgs,
  strayEnvFiles,
} from "../../../scripts/serve-local-production.mjs";

// The local production server's environment (J6-2): sample data, every live variable blanked, the guard preloaded.

describe("the local production server's environment", () => {
  const stray = {
    PATH: "/usr/bin",
    NODE_OPTIONS: "--max-old-space-size=4096",
    RAILKIT_API_KEY: `railkit_${"a".repeat(24)}`,
    DATA_KEY: `${"A".repeat(43)}=`,
    NEXT_PUBLIC_SENTRY_DSN: "https://key@example.invalid/1",
    VERCEL: "1",
  };

  it("blanks every live variable, even one the shell set, so a stray .env.local cannot fill it in either", () => {
    const env = localProductionEnv(stray, 4210);
    for (const name of LIVE_VARIABLES) expect(env[name], name).toBe("");
    expect(env.PATH).toBe("/usr/bin");
  });

  it("blanks every credential env.ts refuses LOCAL_FIXTURE beside, so the two lists cannot drift apart", () => {
    expect(LIVE_VARIABLES).toEqual(expect.arrayContaining([...LIVE_CREDENTIALS]));
  });

  it("serves the fixture from a production build, which env.ts accepts only this way", () => {
    const parsed = parseEnv(localProductionEnv(stray, 4210));
    if (!parsed.ok) throw new Error(parsed.issues.join("; "));
    expect(fixtureAllowed(parsed.env)).toBe(true);
    expect(activePnrSource(parsed.env)).toBe("fixture");
  });

  it("preloads the offline guard, keeping the shell's own NODE_OPTIONS, and names its log", () => {
    const env = localProductionEnv(stray, 4210);
    expect(env.NODE_OPTIONS).toMatch(/^--max-old-space-size=4096 --import=file:\/\/.*\/scripts\/offline-guard\.mjs$/);
    expect(env.OFFLINE_GUARD_LOG).toBe(GUARD_LOG);
    expect(env.PORT).toBe("4210");
    expect(env.NEXT_TELEMETRY_DISABLED).toBe("1");
  });
});

describe("the working tree it serves from (J6-2)", () => {
  it("refuses one that holds any .env file but the example: Next inlines NEXT_PUBLIC_* into the build, where blanking cannot reach", () => {
    expect(strayEnvFiles([".env.example", ".env.local", "package.json", ".next", ".env"])).toEqual([".env", ".env.local"]);
    expect(strayEnvFiles([".env.production.local", ".env.development"])).toEqual([".env.development", ".env.production.local"]);
  });

  it("serves from one with none: the example is documentation, and nothing else is an env file", () => {
    expect(strayEnvFiles([".env.example", "package.json", "src", ".gitignore", "vercel.json"])).toEqual([]);
  });
});

describe("the build it serves (J6-2): made by this script, blanked, and stamped", () => {
  const exported = Object.fromEntries(LIVE_VARIABLES.map((name) => [name, `live-${name}`]));

  it("builds with every live variable blank even when the shell exports them all: the build is what inlines NEXT_PUBLIC_* and uploads with SENTRY_AUTH_TOKEN", () => {
    const env = localBuildEnv({ ...exported, PATH: "/usr/bin" });
    for (const name of LIVE_VARIABLES) expect(env[name], name).toBe("");
    expect(env.PATH).toBe("/usr/bin");
    expect(LIVE_VARIABLES).toEqual(expect.arrayContaining(["NEXT_PUBLIC_SENTRY_DSN", "SENTRY_DSN", "SENTRY_AUTH_TOKEN"]));
  });

  it("builds the fixture in, as env.ts accepts it, and without the guard (the build fetches its fonts)", () => {
    const env = localBuildEnv(exported);
    const parsed = parseEnv(env);
    if (!parsed.ok) throw new Error(parsed.issues.join("; "));
    expect(activePnrSource(parsed.env)).toBe("fixture");
    expect(env.NODE_OPTIONS ?? "").not.toMatch(/offline-guard/);
  });

  const built = (files: Readonly<Record<string, string>>): string => {
    const dir = mkdtempSync(join(tmpdir(), "local-build-"));
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    return dir;
  };

  it("refuses a build this script did not make: no stamp beside BUILD_ID", () => {
    expect(buildRefusal(built({ BUILD_ID: "abc123" }))).toMatch(/not built by `npm run build:local`/);
  });

  it("refuses a stamp left from another build: `npm run build` since replaced it", () => {
    expect(buildRefusal(built({ BUILD_ID: "abc123", [BUILD_STAMP]: "old999" }))).toMatch(/not built by `npm run build:local`/);
  });

  it("refuses no build at all", () => {
    expect(buildRefusal(built({}))).toMatch(/no production build here/);
  });

  it("serves the build it stamped", () => {
    expect(buildRefusal(built({ BUILD_ID: "abc123", [BUILD_STAMP]: "abc123" }))).toBeNull();
  });
});

describe("where it listens, and what it proves afterwards", () => {
  it("listens on 127.0.0.1 only, never the local network", () => {
    expect(serverArgs(4210)).toEqual(["start", "--port", "4210", "--hostname", "127.0.0.1"]);
  });

  const log = (text?: string): string => {
    const file = join(mkdtempSync(join(tmpdir(), "offline-guard-")), "log");
    if (text !== undefined) writeFileSync(file, text);
    return file;
  };

  it("reads each refusal the guard wrote", () => {
    expect(refusals(log("# offline guard on (pid 1)\n"))).toEqual([]);
    expect(refusals(log("# offline guard on (pid 1)\n[offline-guard] refused api.railkit.in:443\n"))).toEqual(["[offline-guard] refused api.railkit.in:443"]);
  });

  it("calls a missing log, or one the guard never opened, no evidence rather than no refusals", () => {
    expect(() => refusals(log())).toThrow(/no evidence/);
    expect(() => refusals(log(""))).toThrow(/no evidence/);
    expect(GUARD_LOG).toMatch(/\/\.offline-guard\.log$/);
  });
});
