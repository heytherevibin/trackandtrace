import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// The runner is started for real, as a subprocess with an environment built from nothing. What it
// must not do is read a store it cannot reach as "nothing is stuck": that is the one answer a
// stuck-send report must never give by accident.

function start() {
  const result = spawnSync(process.execPath, ["scripts/announce-report.mjs"], {
    cwd: process.cwd(),
    // Built from nothing, so no credential of the developer's reaches the child. NODE_ENV is the
    // schema's own default, named only because the typings of `ProcessEnv` require it.
    env: { PATH: process.env.PATH ?? "", NODE_ENV: "development" },
    encoding: "utf8",
    timeout: 30_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe("the report runner against a store it cannot reach", () => {
  it("exits 2 and says it could not read, rather than 0 for nothing stuck or 1 for something", () => {
    const out = start();
    expect(out.status).toBe(2);
    expect(out.stderr).toMatch(/could not be read/i);
    expect(out.stdout).not.toMatch(/nothing is stuck/i);
  });
});
