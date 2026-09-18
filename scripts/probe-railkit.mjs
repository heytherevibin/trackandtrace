#!/usr/bin/env node
// Probe RailKit's PNR endpoint with your own key, and print only the response's SHAPE: field
// names, types, and string lengths. No record values, no PNR and no key are printed, so the
// output is safe to share when checking the adapter's field mapping. RailKit's `error` text,
// when it sends one, is printed with any ten-digit run masked: it decides whether a refusal
// reads as "no record" or "source unavailable".
//
//   node --env-file=.env.local scripts/probe-railkit.mjs <10-digit PNR>
//   (or: npm run source:probe:railkit -- <PNR>)

const pnr = process.argv[2];
if (!/^\d{10}$/.test(pnr ?? "")) {
  console.error("Usage: npm run source:probe:railkit -- <10-digit PNR>");
  process.exit(2);
}
const key = process.env.RAILKIT_API_KEY;
if (!key) {
  console.error("RAILKIT_API_KEY is not set. Add it to .env.local (never commit it).");
  process.exit(2);
}
if (!/^railkit_[A-Za-z0-9]{24,}$/.test(key)) {
  console.error("RAILKIT_API_KEY does not look like a RailKit key (railkit_…, no spaces). Check the paste.");
  process.exit(2);
}
const base = process.env.RAILKIT_BASE_URL || "https://api.railkit.in";

function shape(value, depth = 0) {
  if (depth > 6) return "…";
  if (value === null) return "null";
  if (Array.isArray(value)) return value.length === 0 ? "[]" : [`array(${value.length}) of`, shape(value[0], depth + 1)];
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v, depth + 1)]));
  if (typeof value === "string") return `string(${value.length})`;
  return typeof value;
}

const masked = (text) => text.replace(/\d{10}/g, "••••••••••");

const started = Date.now();
const response = await fetch(`${base}/api/v1/pnr/${pnr}`, {
  headers: { "x-api-key": key, accept: "application/json" },
  signal: AbortSignal.timeout(15000),
}).catch((error) => {
  console.error(`Request failed: ${error.name}`);
  process.exit(1);
});
console.log(`HTTP ${response.status} in ${Date.now() - started} ms`);
for (const header of ["ratelimit-limit", "ratelimit-remaining", "ratelimit-reset", "ratelimit-policy", "retry-after"]) {
  console.log(`${header}: ${response.headers.get(header) ?? "not sent"}`);
}
const text = await response.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  console.log(`Body is not JSON (${text.length} characters).`);
  process.exit(0);
}
if (body && typeof body.error === "string") console.log(`error text: ${JSON.stringify(masked(body.error))}`);
console.log(JSON.stringify(shape(body), null, 2));
