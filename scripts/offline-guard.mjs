// Preloaded into the local production server (scripts/serve-local-production.mjs), so nothing the server runs
// reaches past this machine (J6-2):
//   node --import ./scripts/offline-guard.mjs …
// Every TCP connection to a host that is not loopback is refused before a DNS question is asked, and each refusal is
// written to OFFLINE_GUARD_LOG, one line each, after a first line that says the guard is on. So a run can prove
// afterwards that the guard was loaded and that nothing tried to leave. The server has no credentials (the serve
// script blanks every one); this is the second lock, not the first.
import { appendFileSync } from "node:fs";
import net from "node:net";
import { isLoopback, targetOf } from "./offline-guard-rules.mjs";

const log = process.env.OFFLINE_GUARD_LOG;

/** @param {string} line */
function record(line) {
  if (log) appendFileSync(log, `${line}\n`);
}

const connect = net.Socket.prototype.connect;

/** @this {import("node:net").Socket} @param {unknown[]} args */
function guarded(...args) {
  const { host, port } = targetOf(args);
  if (isLoopback(host)) return Reflect.apply(connect, this, args);
  const message = `[offline-guard] refused ${host}:${String(port ?? "?")}`;
  record(message);
  console.error(message);
  process.nextTick(() => this.destroy(new Error(message)));
  return this;
}

Reflect.set(net.Socket.prototype, "connect", guarded);
record(`# offline guard on (pid ${process.pid})`);
