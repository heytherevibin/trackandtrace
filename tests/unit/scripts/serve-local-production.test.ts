import { describe, expect, it } from "vitest";
import { LIVE_CREDENTIALS, activePnrSource, fixtureAllowed, parseEnv } from "@/services/env";
import { GUARD_LOG, LIVE_VARIABLES, localProductionEnv, strayEnvFiles } from "../../../scripts/serve-local-production.mjs";

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
