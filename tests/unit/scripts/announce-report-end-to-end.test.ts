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

// `queuedAt` is the clock these runs are driven by. The store's own `remainingFor` copies only
// `pending` and `sending` off the answer today and drops `lastSentAt`, so a run through the real read
// path has no other. (Task 2 owns that; when it carries the field through, `lastSentAt` below is read.)
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
      claims: [{ personId: "person-1", email: ADDRESS, claimedAt: ago(30), firstAttemptedAt: ago(30) }],
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
