import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The runner is started for real, as a subprocess, against a stand-in for the store on a local port:
// the same three reads the sender uses, answered over HTTP the way PostgREST answers them. That is
// the only way to observe the top-level `process.exitCode = await main()` on a run that READ the
// store, and it watches every door stdout and stderr have at once instead of enumerating them.
//
// Nothing here is a credential: the two keys are placeholder strings that only have to be long
// enough to pass the schema, and the server is on 127.0.0.1.

const HOUR = 3_600_000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();

const SUBJECT = "A subject nobody may read in a log";
const BODY = "A body nobody may read in a log";
const ADDRESS = "someone@example.com";

// The answers below travel the real read path, `drain-store.ts`, so what reaches the rules is only
// what that wrapper copies through. That matters for two fields in particular: `lastSentAt`, which
// the store computes and the wrapper once dropped, leaving `queuedAt` the only clock a real run had;
// and a claim's own `state`, without which the unknown rule is fed nothing. Both are asserted here
// rather than in a wrapper unit test, because this proves they arrive all the way at the decision.
type Answers = { queuedHoursAgo: number; remaining: Record<string, unknown> | null; claims: readonly Record<string, unknown>[] };
let answers: Answers = { queuedHoursAgo: 1, remaining: null, claims: [] };
let server: Server;
let origin = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    const name = (req.url ?? "").split("?")[0]?.split("/").pop();
    const body: unknown =
      name === "announce_open_letters"
        ? [{ id: "L1", list: "news", subject: SUBJECT, body: BODY, state: "sending", queuedAt: ago(answers.queuedHoursAgo), email: ADDRESS }]
        : name === "announce_remaining"
          ? answers.remaining
          : name === "announce_open_claims"
            ? answers.claims
            : null;
    req.resume();
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function start(): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/announce-report.mjs"], {
      cwd: process.cwd(),
      // Built from nothing, so no credential of the developer's reaches the child.
      env: {
        PATH: process.env.PATH ?? "",
        NODE_ENV: "development",
        NEXT_PUBLIC_SUPABASE_URL: origin,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "placeholder-publishable-key-0000",
        SUPABASE_SECRET_KEY: "placeholder-secret-key-0000000000",
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    const timer = setTimeout(() => child.kill(), 30_000);
    child.on("error", reject);
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

describe("the report, started for real against a store that answers", () => {
  it("exits 1, and not 2, when the store was read in full and a letter is stuck", async () => {
    // The ladder end to end: 2 is for an incomplete report, and a finding in a complete one is 1.
    answers = { queuedHoursAgo: 240, remaining: { pending: 10, sending: 0, lastSentAt: ago(168) }, claims: [] };
    const out = await start();
    expect(out.status).toBe(1);
    expect(out.stdout).toContain("L1");
    expect(out.stdout).toContain("10 still pending");
    expect(out.stderr).toBe("");
  });

  it("exits 0 when the letter is young and advancing", async () => {
    answers = { queuedHoursAgo: 1, remaining: { pending: 10, sending: 0, lastSentAt: ago(1) }, claims: [] };
    const out = await start();
    expect(out.status).toBe(0);
    expect(out.stdout).toMatch(/nothing is stuck/i);
    expect(out.stderr).toBe("");
  });

  it("does NOT name a letter queued ten days ago that sent an hour ago, because lastSentAt reaches the rule", async () => {
    // The pair to the first case above, and the one that proves the field arrives. Measured from
    // `queuedAt` — the only clock a run had while the wrapper dropped `lastSentAt` — this letter is
    // 240 hours old with ten pending and would be named. Measured from its last delivery it is
    // moving, and a report that cried wolf on every healthy long letter is a report nobody reads.
    answers = { queuedHoursAgo: 240, remaining: { pending: 10, sending: 0, lastSentAt: ago(1) }, claims: [] };
    const out = await start();
    expect(out.status).toBe(0);
    expect(out.stdout).toMatch(/nothing is stuck/i);
    expect(out.stderr).toBe("");
  });

  it("names an unknown delivery, which only reaches the rule because the row carries its own state", async () => {
    // Nothing else here is a finding: the letter sent an hour ago, nothing is pending, and the row's
    // first attempt is an hour old, so neither the 48-hour rule nor the stale-claim rule fires. The
    // only reason anything is said is the row's `state`. Assembled as a constant `"sending"`, as it
    // was while `announce_open_claims` returned only claimed rows, this run exits 0 and says nothing.
    answers = {
      queuedHoursAgo: 2,
      remaining: { pending: 0, sending: 1, lastSentAt: ago(1) },
      claims: [{ personId: "person-1", claimedAt: ago(1), firstAttemptedAt: ago(1), state: "unknown" }],
    };
    const out = await start();
    expect(out.status).toBe(1);
    expect(out.stdout).toContain("1 unknown: we cannot say whether it was sent");
    expect(out.stderr).toBe("");
  });

  it("exits 2 when a letter's counts cannot be read, whatever else it found", async () => {
    answers = { queuedHoursAgo: 240, remaining: null, claims: [] };
    const out = await start();
    expect(out.status).toBe(2);
    expect(out.stdout).toContain("L1");
    expect(out.stdout).toMatch(/could not be read/);
  });

  it("writes no subject, body, address or person to stdout or stderr, on any run", async () => {
    // The store's answers carry all four. The real streams are read whole, so a leak through any
    // door at all (console.log, .info, .warn, process.stdout.write) is seen. The positive control is
    // in the assertions: the same stdout is shown to hold the letter's id, so silence is not an
    // empty capture.
    answers = {
      queuedHoursAgo: 240,
      remaining: { pending: 10, sending: 1, lastSentAt: ago(100) },
      claims: [{ personId: "person-1", email: ADDRESS, claimedAt: ago(30), firstAttemptedAt: ago(30), state: "sending" }],
    };
    const out = await start();
    expect(out.status).toBe(1);
    expect(out.stdout).toContain("L1");
    for (const secret of [SUBJECT, BODY, ADDRESS, "@", "example.com", "person-1"]) {
      expect(out.stdout).not.toContain(secret);
      expect(out.stderr).not.toContain(secret);
    }
    expect(out.stderr).toBe("");
  });
});
