#!/usr/bin/env node
// Probe RailKit for what a REFUSAL looks like, and print only statuses and shapes: field names,
// types, and the provider's own error text. No key, no passenger data, nothing personal — the
// output is safe to paste into a report.
//
//   node --env-file=.env.local scripts/probe-railkit-refusals.mjs --train 12649 --from YPR --to NZM
//
// WHY THIS EXISTS. TL-02 v2's route fan-out makes one availability ask per train. On production a
// single search of eight trains produced five refusals in about a second, and `BREAKER.threshold`
// is five failures in sixty seconds — so one ordinary search opened the breaker for the whole
// endpoint, which live PNR checks share.
//
// The question that decides the fix: when a train does not run on a date, or does not carry a
// class, does RailKit say so DISTINGUISHABLY, or does it look exactly like a provider failure?
//
//   - Distinguishable  -> the adapter maps it to an ANSWER ("does not run that day"), which is a
//                         fact the traveller wants, and the breaker stops counting it.
//   - Indistinguishable -> the fan-out needs its own breaker scope, because there is no way to
//                         tell an expected refusal from a real outage.
//
// Do NOT raise the breaker threshold to make the symptom go away: that blinds the PNR path too.
//
// Budget: Enterprise is 600 requests per 10 minutes. This makes at most ~30 and stops dead on
// 401/403/429.

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);

const trainNo = args.get("train") ?? "12649";
const from = args.get("from") ?? "YPR";
const to = args.get("to") ?? "NZM";
const quota = args.get("quota") ?? "GN";

const key = process.env.RAILKIT_API_KEY;
if (!key) {
  console.error("RAILKIT_API_KEY is not set. Run through `node --env-file=.env.local`, and never commit the key.");
  process.exit(1);
}
const base = process.env.RAILKIT_BASE_URL || "https://api.railkit.in";

/** DD-MM-YYYY, the only date form `/seats` accepts. */
function ddmmyyyy(date) {
  const d = String(date.getUTCDate()).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${d}-${m}-${date.getUTCFullYear()}`;
}

/** Field names and types only — never a value, except the provider's own error text. */
function shape(value, depth = 0) {
  if (value === null) return "null";
  if (Array.isArray(value)) return depth > 1 ? `array(${value.length})` : `[${value.length}: ${value.length ? shape(value[0], depth + 1) : "-"}]`;
  if (typeof value !== "object") return typeof value;
  if (depth > 1) return "object";
  return `{${Object.keys(value).join(", ")}}`;
}

async function seats(dateText, travelClass) {
  const url = `${base}/api/v1/seats/${trainNo}/${from}/${to}/${dateText}/${travelClass}/${quota}`;
  const started = Date.now();
  try {
    const res = await fetch(url, { headers: { "x-api-key": key } });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return { status: res.status, ms: Date.now() - started, note: `non-JSON, ${text.length} chars` };
    }
    return {
      status: res.status,
      ms: Date.now() - started,
      success: body?.success,
      // The whole point of this probe: the provider's own words for a refusal.
      error: typeof body?.error === "string" ? body.error : undefined,
      shape: shape(body),
      availability: Array.isArray(body?.data?.availability) ? body.data.availability.length : undefined,
      rateLimit: res.headers.get("ratelimit-remaining") ?? undefined,
    };
  } catch (error) {
    return { status: 0, ms: Date.now() - started, note: error instanceof Error ? error.name : "threw" };
  }
}

const CLASSES = (args.get("classes") ?? "2A,3A,SL,1A,CC,2S").split(",");
const DAYS = Number(args.get("days") ?? 7);

console.log(`# ${trainNo} ${from} → ${to}, quota ${quota}`);
console.log(`# base ${base}\n`);

let stop = false;
const halt = (r) => [401, 403, 429].includes(r.status);

console.log("## One class, consecutive dates — does a day the train does not run look different?");
const start = new Date();
start.setUTCDate(start.getUTCDate() + 7);
for (let i = 0; i < DAYS && !stop; i += 1) {
  const day = new Date(start);
  day.setUTCDate(start.getUTCDate() + i);
  const text = ddmmyyyy(day);
  const r = await seats(text, CLASSES[0]);
  const weekday = day.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  console.log(`${text} ${weekday} ${CLASSES[0]}: ${JSON.stringify(r)}`);
  stop = halt(r);
  await new Promise((s) => setTimeout(s, 350));
}

console.log("\n## One date, every class — does a class the train does not carry look different?");
const oneDate = ddmmyyyy(start);
for (const travelClass of CLASSES) {
  if (stop) break;
  const r = await seats(oneDate, travelClass);
  console.log(`${oneDate} ${travelClass}: ${JSON.stringify(r)}`);
  stop = halt(r);
  await new Promise((s) => setTimeout(s, 350));
}

console.log("\n## Controls — a train that certainly runs, and inputs that are certainly wrong");
for (const [label, run] of [
  ["nonsense class", () => seats(oneDate, "ZZ")],
  ["nonsense train", async () => {
    const saved = trainNo;
    void saved;
    const url = `${base}/api/v1/seats/99999/${from}/${to}/${oneDate}/${CLASSES[0]}/${quota}`;
    const res = await fetch(url, { headers: { "x-api-key": key } });
    const body = await res.json().catch(() => null);
    return { status: res.status, success: body?.success, error: body?.error, shape: shape(body) };
  }],
]) {
  if (stop) break;
  console.log(`${label}: ${JSON.stringify(await run())}`);
  await new Promise((s) => setTimeout(s, 350));
}

console.log(`\n# done${stop ? " — stopped early on 401/403/429" : ""}`);
