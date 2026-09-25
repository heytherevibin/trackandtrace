#!/usr/bin/env node
// Probe RailKit for endpoints BEYOND the PNR one the app already uses, and print only each
// response's STATUS and SHAPE: field names, types, string lengths. No record values, no PNR, no
// key, no station or passenger data is printed, so the output is safe to paste into a report.
//
// Why this exists: the prediction work needs to know whether this source can answer "how many
// seats are left, at what quota, on what date" -- and if so, in what shape. That question has been
// asked of the roadmap twice and never of the API. This asks the API.
//
//   npm run source:probe:availability
//   node --env-file=.env.local scripts/probe-railkit-availability.mjs --train 12951 --from NDLS --to BCT --date 2026-10-15
//
// WHAT IT FOUND, 2026-09-23. The answer is `GET /api/v1/seats/:trainNo/:from/:to/:date/:class/:quota`
// with the date as DD-MM-YYYY -- not any of the `/availability` spellings guessed at below, which is
// why that path now sits ahead of the guesses: a future run must not repeat the search that has
// already happened. It returns `train`, an embedded `fare`, and a four-element `availability` window running
// forward from the date asked for. Past dates answer 400 `Failed to fetch availability`, so a missed
// day can never be back-filled. Those shapes are the whole basis of
// `docs/superpowers/specs/2026-09-23-pre-booking-availability-design.md` §4 and of
// `src/services/sources/railkit-availability.ts`; re-run this before trusting them again, because
// nothing here is pinned by a test against the live API.
//
// WHAT A SECOND RUN FOUND, 2026-09-25, probing 12627 SBC→NDLS. Four of the twenty-two answer:
//
//   /api/v1/seats/:no/:from/:to/:ddmmyyyy/:class/:quota  as above
//   /api/v1/trains/:trainNo            {trainNo, trainName} and NOTHING else
//   /api/v1/trains/search?name=        {query, count, trains:[{trainNo, trainName}]}
//   /api/v1/trains/between/:from/:to   the rich one, below
//
// THERE IS NO TRAIN-TO-ROUTE LOOKUP. `/route/:no`, `/schedule/:no`, `/train-schedule/:no`,
// `/station/:code` and both hyphenated trains-between spellings are 404, and the `train` block
// inside a seats response only echoes the from/to that was ASKED for, with station names attached.
// Neither `/trains/:no` nor `/trains/search` carries a route either, so a train number or name can
// NEVER reach `/seats` on its own — the station pair has to come from the traveller or from
// `/trains/between`, which is the only endpoint that knows where a train runs.
//
// `/trains/between/:from/:to` returns an array of:
//   train_no, train_name,
//   source_stn_code/name, dstn_stn_code/name   the TRAIN's own origin and destination
//   from_stn_code/name, to_stn_code/name       the SEGMENT that was asked for
//   from_time, to_time, travel_time, running_days, distance, halts
// So one call gives a route's trains, the codes `/seats` needs, and the running days that explain
// why four returned dates are not four consecutive ones. There is no station lookup at all: a
// station code cannot be resolved to a name except through one of these responses.
//
// Budget: Enterprise is 600 requests per 10 minutes (railkit-source memory). This makes at most
// ~22 and stops dead on 401/403/429, so it cannot eat a meaningful share of the month's 10k.

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);

const TRAIN = args.get("train") ?? "12951";
const FROM = args.get("from") ?? "NDLS";
const TO = args.get("to") ?? "BCT";
// Far enough ahead that a real booking window is open, near enough to be a date the source has.
const DATE = args.get("date") ?? new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10);
const CLASS = args.get("class") ?? "3A";
const QUOTA = args.get("quota") ?? "GN";
// A partial train name, for the search endpoint the drawn train field would use.
const NAME = args.get("name") ?? "karnat";
// The seats endpoint wants DD-MM-YYYY; every guessed path below is asked in ISO, as it was on the
// run that found this. Both forms are derived here once, from the same day.
const DDMMYYYY = DATE.split("-").reverse().join("-");

const key = process.env.RAILKIT_API_KEY;
if (!key) {
  console.error("RAILKIT_API_KEY is not set. Run through `node --env-file=.env.local`, and never commit the key.");
  process.exit(2);
}
if (!/^railkit_[A-Za-z0-9]{24,}$/.test(key)) {
  console.error("RAILKIT_API_KEY does not look like a RailKit key (railkit_…, no spaces). Check the paste.");
  process.exit(2);
}
const base = process.env.RAILKIT_BASE_URL || "https://api.railkit.in";

/** Field names and types only -- never a value. Strings collapse to their length. */
function shape(value, depth = 0) {
  if (depth > 5) return "…";
  if (value === null) return "null";
  if (Array.isArray(value)) return value.length === 0 ? "[]" : [`array(${value.length}) of`, shape(value[0], depth + 1)];
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v, depth + 1)]));
  if (typeof value === "string") return `string(${value.length})`;
  return typeof value;
}

// A ten-digit run is a PNR; a date is not. Masked before anything is printed, as the PNR probe does.
const masked = (text) => String(text).replace(/\d{10}/g, "••••••••••");

/**
 * The paths worth asking about. RailKit publishes no OpenAPI document that the PNR work found, so
 * this is a list of the shapes an Indian-rail API of this kind usually exposes, ordered by how much
 * the prediction work would need them. A 404 here is a real answer -- it says the endpoint is not
 * there -- so the list is deliberately broader than what we expect to exist.
 */
const CANDIDATES = [
  ["discovery", "/"],
  ["discovery", "/api/v1"],
  ["discovery", "/openapi.json"],
  // The one that answers. Kept first so a re-run confirms it before spending calls on the guesses.
  ["seats", `/api/v1/seats/${TRAIN}/${FROM}/${TO}/${DDMMYYYY}/${CLASS}/${QUOTA}`],
  ["availability", `/api/v1/availability/${TRAIN}/${FROM}/${TO}/${DATE}/${CLASS}/${QUOTA}`],
  ["availability", `/api/v1/seat-availability?train=${TRAIN}&from=${FROM}&to=${TO}&date=${DATE}&class=${CLASS}&quota=${QUOTA}`],
  ["availability", `/api/v1/availability?train=${TRAIN}&from=${FROM}&to=${TO}&date=${DATE}&class=${CLASS}&quota=${QUOTA}`],
  ["fare", `/api/v1/fare/${TRAIN}/${FROM}/${TO}/${CLASS}/${QUOTA}`],
  ["fare", `/api/v1/fare?train=${TRAIN}&from=${FROM}&to=${TO}&class=${CLASS}&quota=${QUOTA}`],
  ["train", `/api/v1/train/${TRAIN}`],
  ["train", `/api/v1/trains/${TRAIN}`],
  ["schedule", `/api/v1/schedule/${TRAIN}`],
  ["schedule", `/api/v1/train-schedule/${TRAIN}`],
  ["route", `/api/v1/route/${TRAIN}`],
  ["live", `/api/v1/live/${TRAIN}`],
  ["live", `/api/v1/live-status/${TRAIN}`],
  ["live", `/api/v1/running-status/${TRAIN}`],
  ["trains-between", `/api/v1/trains-between/${FROM}/${TO}`],
  ["trains-between", `/api/v1/trains?from=${FROM}&to=${TO}&date=${DATE}`],
  // The two the sheet's train field is drawn on. The `trains/...` prefix answers for a train number,
  // so these spellings are the ones worth asking; the hyphenated and query forms above do not.
  // A form that starts from a train name needs `search`; one that starts from a station pair needs
  // `between` — and whether `between` carries running_days decides whether a missing day can be
  // explained or has to be left as a hole. Neither is pinned by a test, so re-ask before trusting.
  ["trains-search", `/api/v1/trains/search?name=${encodeURIComponent(NAME)}`],
  ["trains-between", `/api/v1/trains/between/${FROM}/${TO}`],
  ["station", `/api/v1/station/${FROM}`],
];

console.log(`base           ${base}`);
console.log(`train/route    ${TRAIN} ${FROM}→${TO}  ${DATE}  ${CLASS}/${QUOTA}`);
console.log(`candidates     ${CANDIDATES.length}\n`);

let quotaHeaders = null;
let stopped = null;

for (const [group, path] of CANDIDATES) {
  if (stopped) break;
  const started = Date.now();
  let response;
  try {
    response = await fetch(`${base}${path}`, { headers: { "x-api-key": key, accept: "application/json" } });
  } catch (err) {
    console.log(`${group.padEnd(14)} ${path}\n  network error: ${masked(err.message)}\n`);
    continue;
  }
  const ms = Date.now() - started;
  const type = response.headers.get("content-type") ?? "";
  const policy = response.headers.get("ratelimit-policy");
  const remaining = response.headers.get("ratelimit-remaining");
  if (policy || remaining) quotaHeaders = { policy, remaining };

  // 401/403 means the key is wrong or inactive; 429 means the bucket is empty. Either way every
  // later call would answer the same, so stop rather than spending the rest of the list proving it.
  if (response.status === 401 || response.status === 403 || response.status === 429) {
    stopped = `${response.status} on ${path} -- stopping rather than repeating it ${CANDIDATES.length} times`;
  }

  let body = null;
  if (type.includes("json")) {
    try {
      body = await response.json();
    } catch {
      body = "<unparseable json>";
    }
  } else {
    const text = await response.text();
    body = `<${type.split(";")[0] || "no content-type"}, ${text.length} bytes>`;
  }

  const summary =
    typeof body === "object" && body !== null
      ? JSON.stringify(shape(body), null, 2).split("\n").map((line) => `  ${line}`).join("\n")
      : `  ${masked(body)}`;

  console.log(`${group.padEnd(14)} ${response.status}  ${String(ms).padStart(5)}ms  ${path}`);
  console.log(`${masked(summary)}\n`);
}

if (quotaHeaders) console.log(`rate limit     policy=${quotaHeaders.policy ?? "?"} remaining=${quotaHeaders.remaining ?? "?"}`);
if (stopped) console.log(`stopped        ${stopped}`);
