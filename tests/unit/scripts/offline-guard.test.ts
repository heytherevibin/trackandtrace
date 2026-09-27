import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { isLoopback, targetOf } from "../../../scripts/offline-guard-rules.mjs";

// The local production server's second lock (J6-2): nothing it runs reaches past this machine. The rules are pure; the
// guard itself is proven in a child process, so this test runner's own sockets are never patched.

describe("which connections stay on this machine", () => {
  it.each(["localhost", "admin.localhost", "127.0.0.1", "127.8.0.1", "::1", "[::1]", undefined, ""])("lets %s through", (host) => {
    expect(isLoopback(host)).toBe(true);
  });

  it.each(["api.railkit.in", "example.invalid", "10.0.0.1", "0.0.0.0.example"])("refuses %s", (host) => {
    expect(isLoopback(host)).toBe(false);
  });

  it("reads the host from each way a socket is connected", () => {
    const cb = () => undefined;
    expect(targetOf([[{ host: "api.railkit.in", port: 443 }, cb]])).toEqual({ host: "api.railkit.in", port: 443 });
    expect(targetOf([{ host: "example.invalid", port: 80 }, cb])).toEqual({ host: "example.invalid", port: 80 });
    expect(targetOf([8080, "example.invalid"])).toEqual({ host: "example.invalid", port: 8080 });
    expect(targetOf([8080])).toEqual({ host: undefined, port: 8080 });
    expect(targetOf([{ path: "/tmp/next.sock" }])).toEqual({ host: "", port: undefined });
    expect(targetOf(["/tmp/next.sock", cb])).toEqual({ host: "", port: undefined });
  });
});

describe("the guard, preloaded into a process", () => {
  const guard = pathToFileURL(join(process.cwd(), "scripts/offline-guard.mjs")).href;
  // stdio "pipe": the refusal the guard prints to stderr is expected, and stays off this runner's output
  const run = (code: string, log: string): string =>
    execFileSync(process.execPath, ["--import", guard, "--input-type=module", "-e", code], { env: { ...process.env, OFFLINE_GUARD_LOG: log }, encoding: "utf8", timeout: 20_000, stdio: "pipe" });
  const logFile = () => join(mkdtempSync(join(tmpdir(), "offline-guard-")), "log");

  it("refuses a connection off this machine before any DNS question, and writes it down", () => {
    const log = logFile();
    // .invalid never resolves (RFC 2606), so even a broken guard would reach no service
    const out = run('try { await fetch("https://example.invalid/pnr"); console.log("reached"); } catch (e) { console.log(String(e.cause?.message ?? e.message)); }', log);
    expect(out).toContain("[offline-guard] refused example.invalid:443");
    expect(out).not.toContain("reached");
    expect(readFileSync(log, "utf8")).toMatch(/^# offline guard on \(pid \d+\)\n\[offline-guard\] refused example\.invalid:443\n$/);
  });

  it("lets a connection to this machine through", () => {
    const log = logFile();
    const code = [
      'import http from "node:http";',
      'const server = http.createServer((q, r) => r.end("ok"));',
      'await new Promise((done) => server.listen(0, "127.0.0.1", done));',
      "const address = server.address();",
      'const port = typeof address === "object" && address ? address.port : 0;',
      'const reply = await fetch("http://127.0.0.1:" + port + "/");',
      "console.log(await reply.text());",
      "server.close();",
    ].join("\n");
    expect(run(code, log).trim()).toBe("ok");
    expect(readFileSync(log, "utf8")).toMatch(/^# offline guard on \(pid \d+\)\n$/);
  });
});
