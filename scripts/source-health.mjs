#!/usr/bin/env node
// Is each configured PNR source alive, and how much of its allowance is left? Ask every source
// this deployment would actually use — the primary, and the fallback if there is one — and say
// plainly which answered. A source that is structurally dead (a spent plan, a refused key) looks
// exactly like a source that is briefly busy unless somebody asks, so this is the asking. It
// exits non-zero the moment one cannot answer, so a check can be wired to it.
//
//   node --env-file=.env.local scripts/source-health.mjs [<10-digit PNR>]
//   (or: npm run source:health -- [<PNR>])
//
// Each source is asked once, which spends one request against its allowance. Without a PNR it
// asks for 0000000000, which is not a reservation anybody holds: every provider answers "no
// record", and that answer is what proves the source is alive and the key is accepted. Pass a
// real PNR to exercise the record path too.
//
// One provider is configured today. Everything below reads the PROVIDERS table rather than that
// one name — the roles, the two-source wording and the closing line all stay — so a second
// provider is one entry here and nothing else. See PNR_FALLBACK in src/services/env.ts.
//
// Like the probes beside it, this prints shapes and statuses only. No key is ever printed, the
// PNR is never printed, and every line is passed through the same ten-digit mask the server log
// uses, so the output is safe to paste into an issue.
//
// Exit: 0 every configured source answered · 1 one could not · 2 the script was asked wrongly.

import { pathToFileURL } from "node:url";

/**
 * Every third-party provider this product can be pointed at: where its key lives, and how it is
 * asked for a PNR. The only provider-specific knowledge in the file.
 */
export const PROVIDERS = {
  railkit: {
    key: (env) => env.RAILKIT_API_KEY,
    request: (pnr, env) => ({
      url: `${env.RAILKIT_BASE_URL || "https://api.railkit.in"}/api/v1/pnr/${pnr}`,
      headers: { "x-api-key": env.RAILKIT_API_KEY, accept: "application/json" },
    }),
  },
};

/** Not a reservation anybody holds. Used only when the operator does not supply one; never printed. */
const PROBE_PNR = "0000000000";

const TIMEOUT_MS = 15_000;

/** An allowance that does not refill within a day is gone for this shift, not briefly busy. */
const LONG_REST_SECONDS = 24 * 60 * 60;

/** The same rule the server log follows: a ten-digit run never reaches a terminal or a paste. */
export function mask(text) {
  return String(text).replace(/\d{10}/g, "••••••••••");
}

// ---------------------------------------------------------------------------
// Reading the answer
// ---------------------------------------------------------------------------

function header(headers, name) {
  const value = headers?.[name];
  return value === undefined || value === null || value === "" ? "not sent" : String(value);
}

/**
 * What the provider says is left, read from the IETF RateLimit headers. They are a standard
 * rather than one provider's convention, so every provider is asked the same question; one that
 * answers in names of its own would need its own list here.
 */
function allowanceNotes(headers) {
  return ["ratelimit-policy", "ratelimit-limit", "ratelimit-remaining", "ratelimit-reset", "retry-after"].map((name) => `${name}: ${header(headers, name)}`);
}

function positiveSeconds(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : undefined;
}

/**
 * How long a 429 says the allowance is gone for, taken from the headers the provider sends rather
 * than from any one gateway's prose. A plan-sized rest — RailKit's RateLimit policy window is a
 * month — will not refill within the shift and needs a person; a per-second or per-minute cap
 * refills on its own. The two must never be confused: one is an outage, the other is a moment.
 */
export function readRest(headers) {
  const seconds = positiveSeconds(header(headers, "retry-after")) ?? positiveSeconds(header(headers, "ratelimit-reset"));
  if (seconds === undefined) return { kind: "busy" };
  return seconds >= LONG_REST_SECONDS ? { kind: "exhausted", seconds } : { kind: "busy", seconds };
}

/** "6 hours", "31 days": a long rest reads better in days. */
function restLabel(seconds) {
  const hours = Math.round(seconds / 3600);
  return hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours} hours`;
}

/** Refusals that mean the PNR has no record. Mirrors src/services/sources/irctc-record.ts: each needs the PNR in view. */
const NO_RECORD = [/\bno pnr data\b/i, /\b(?:invalid|not valid|wrong)\b.{0,20}\bpnr\b/i, /\bpnr\b.{0,40}\b(?:not found|invalid|not valid|does not exist|flushed|not yet generated)\b/i, /\bflushed\b/i, /\bnot yet generated\b/i, /\bno (?:reservation )?records? found\b/i];

function refusalText(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return "";
  return typeof body.error === "string" ? body.error : typeof body.message === "string" ? body.message : "";
}

/**
 * One probe's answer turned into a verdict. Alive means the source answered — a record, or an
 * honest "no such PNR". Anything else is a source that cannot answer, whatever the reason.
 */
export function verdict(answer) {
  if (answer.unkeyed) return { alive: false, summary: "no key is set for it, so it cannot be asked at all", notes: [] };
  if (answer.failure) {
    const timedOut = answer.failure === "TimeoutError" || answer.failure === "AbortError";
    return { alive: false, summary: timedOut ? `did not answer in time (${TIMEOUT_MS} ms)` : `could not be reached (${answer.failure})`, notes: [] };
  }

  const { status, headers = {}, body } = answer;
  const notes = allowanceNotes(headers);
  const refusal = refusalText(body);
  const said = refusal ? [...notes, `it said: ${mask(JSON.stringify(refusal))}`] : notes;

  if (status === 401 || status === 403) return { alive: false, summary: `the key or the plan was refused (HTTP ${status})`, notes: said };
  if (status === 429) {
    const rest = readRest(headers);
    if (rest.kind === "exhausted") {
      return { alive: false, summary: `the allowance is spent for the next ${restLabel(rest.seconds)} — it will not come back on its own today (HTTP 429)`, notes: said };
    }
    const refills = rest.seconds === undefined ? "" : `, and refills in ${rest.seconds} s`;
    return { alive: false, summary: `the rate limit is reached${refills} (HTTP ${status})`, notes: said };
  }
  if (status >= 500) return { alive: false, summary: `it returned an error (HTTP ${status})`, notes: said };
  if (status >= 400) {
    if (NO_RECORD.some((pattern) => pattern.test(refusal))) return { alive: true, summary: `answered: no record for that PNR (HTTP ${status})`, notes: said };
    return { alive: false, summary: `it refused, and not about the PNR (HTTP ${status})`, notes: said };
  }
  return { alive: true, summary: `answered (HTTP ${status})`, notes: said };
}

// ---------------------------------------------------------------------------
// What this deployment is actually wired to
// ---------------------------------------------------------------------------

/** Only a name this table holds is a provider: PNR_SOURCE is operator input, not a key to trust. */
function known(providers, name) {
  return typeof name === "string" && Object.hasOwn(providers, name);
}

/** The sources this environment would ask, in the order it would ask them. */
export function plannedProbes(env, providers = PROVIDERS) {
  const source = env.PNR_SOURCE ?? "live";
  const fallback = env.PNR_FALLBACK ?? "none";
  const keyed = (name) => Boolean(providers[name].key(env));
  const planned = [];
  if (known(providers, source)) planned.push({ provider: source, role: "primary", keyed: keyed(source) });
  if (known(providers, fallback) && fallback !== source) planned.push({ provider: fallback, role: "fallback", keyed: keyed(fallback) });
  return planned;
}

/** Said before anything is asked: how many sources there are is a fact an operator should read, not infer. */
export function configurationLine(planned, providers = PROVIDERS) {
  if (planned.length === 0) return `No third-party source is configured: PNR_SOURCE names none of ${Object.keys(providers).join(", ")}, so there is nothing to ask.`;
  const [primary, fallback] = planned;
  if (!fallback) return `One source, no fallback: ${primary.provider} answers every check, and nothing answers when it cannot.`;
  return `Two sources: ${primary.provider} answers, and ${fallback.provider} is asked only while ${primary.provider} is unavailable.`;
}

/** Said after: what the verdicts mean together, which is not always what each one means alone. */
export function closingLine(reports) {
  if (reports.length === 0) return "Nothing to check.";
  if (reports.every((report) => report.alive)) return reports.length === 1 ? "The only source answered." : "Every configured source answered.";

  const primary = reports.find((report) => report.role === "primary");
  const fallback = reports.find((report) => report.role === "fallback");
  if (!fallback) return `${primary?.provider ?? "The source"} cannot answer and there is no fallback behind it: PNR checks are down.`;
  if (reports.every((report) => !report.alive)) return "No configured source can answer: PNR checks are down.";
  if (primary && !primary.alive) return `${primary.provider} cannot answer; ${fallback.provider} is covering it.`;
  return `${fallback.provider} cannot answer: ${primary?.provider ?? "the primary"} is uncovered, and a fallback that is already dead cannot cover the next outage.`;
}

/** Non-zero the moment a configured source cannot answer, so a check wired to this fails on it. */
export function exitCodeFor(verdicts) {
  return verdicts.some((report) => !report.alive) ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Asking
// ---------------------------------------------------------------------------

async function ask(entry, pnr, env, providers = PROVIDERS) {
  if (!entry.keyed) return { unkeyed: true };
  const { url, headers } = providers[entry.provider].request(pnr, env);
  const started = Date.now();
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    return { status: response.status, headers: Object.fromEntries(response.headers), body, ms: Date.now() - started };
  } catch (error) {
    return { failure: error?.name ?? "Error", ms: Date.now() - started };
  }
}

async function main() {
  const given = process.argv[2];
  if (given !== undefined && !/^\d{10}$/.test(given)) {
    console.error("Usage: npm run source:health -- [<10-digit PNR>]");
    process.exit(2);
  }
  const pnr = given ?? PROBE_PNR;

  const planned = plannedProbes(process.env);
  console.log(configurationLine(planned));
  if (planned.length === 0) process.exit(0);
  console.log(`Asking each once, which spends one request against its allowance.\n`);

  const reports = [];
  for (const entry of planned) {
    const answer = await ask(entry, pnr, process.env);
    const out = verdict(answer);
    reports.push({ ...entry, ...out });
    const took = answer.ms === undefined ? "" : ` · ${answer.ms} ms`;
    console.log(`${entry.provider} (${entry.role}) — ${out.alive ? "ALIVE" : "CANNOT ANSWER"}${took}`);
    console.log(`  ${mask(out.summary)}`);
    for (const note of out.notes) console.log(`  ${mask(note)}`);
    console.log("");
  }

  console.log(closingLine(reports));
  process.exit(exitCodeFor(reports));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
