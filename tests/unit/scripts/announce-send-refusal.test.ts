import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// The runner is started for real, as a subprocess with an environment built from nothing, so what is
// tested is the script's own refusal and not a function it happens to call.
//
// "Nothing is sent" is asserted two ways, because an exit code alone proves only that it exited:
//   * stdout is empty: `drain` prints a line before it does anything, so no line means it never ran;
//   * the process never reached the store. This environment has no Supabase credentials, so the first
//     store call a run makes throws an error that names it ("Account deletion is not configured…").
//     That message is absent from a refusal and present once the run gets past the checks, which the
//     last two cases use as the positive control: they prove the refusal is about the counter and not
//     about the test's setup.

const DATA_KEY = Buffer.alloc(32, 1).toString("base64");
const RESEND_API_KEY = "re_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const STORE_REACHED = "Account deletion is not configured";

function start(extra: Record<string, string>) {
  const result = spawnSync(process.execPath, ["scripts/announce-send.mjs"], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH ?? "", DATA_KEY, RESEND_API_KEY, ...extra },
    encoding: "utf8",
    timeout: 30_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe("the runner's start-up refusals", () => {
  it("refuses, exit 2, when no shared store holds the day's counter, and sends and reads nothing", () => {
    // An in-process counter starts every run at zero: three runs would send 120 against a plan of
    // 100 a day, and the process gating confirmations would never see one of them.
    const out = start({});
    expect(out.status).toBe(2);
    expect(out.stderr).toMatch(/allowance/i);
    expect(out.stderr).toContain("KV_REST_API_URL");
    expect(out.stdout).toBe("");
    expect(out.stderr).not.toContain(STORE_REACHED);
  });

  it("refuses when the counter is configured to be memory only, whatever credentials are set", () => {
    const out = start({ KV_REST_API_URL: "https://example.upstash.io", KV_REST_API_TOKEN: "token", RATE_LIMIT_STRATEGY: "memory" });
    expect(out.status).toBe(2);
    expect(out.stdout).toBe("");
    expect(out.stderr).not.toContain(STORE_REACHED);
  });

  it("refuses with only half the pair set", () => {
    const out = start({ KV_REST_API_URL: "https://example.upstash.io" });
    expect(out.status).toBe(2);
    expect(out.stdout).toBe("");
  });

  it("gets past the refusal with the KV pair (the control: it then reaches the store, which this environment cannot)", () => {
    const out = start({ KV_REST_API_URL: "https://example.upstash.io", KV_REST_API_TOKEN: "token" });
    expect(out.status).toBe(1);
    expect(out.stderr).toContain(STORE_REACHED);
    expect(out.stdout).toBe("");
  });

  it("gets past it with Upstash's own names as well", () => {
    const out = start({ UPSTASH_REDIS_REST_URL: "https://example.upstash.io", UPSTASH_REDIS_REST_TOKEN: "token" });
    expect(out.stderr).toContain(STORE_REACHED);
  });
});
