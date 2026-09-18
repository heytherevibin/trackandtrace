#!/usr/bin/env node
// Probe the RapidAPI "IRCTC" PNR endpoint with your own key and your own PNR, and print only the
// response's SHAPE: field names, types, and string lengths. No values, no PNR, no names are printed,
// so the output is safe to share when checking the adapter's field mapping.
//
//   node --env-file=.env.local scripts/probe-rapidapi.mjs <10-digit PNR>
//   (or: npm run source:probe -- <PNR>)

const pnr = process.argv[2];
if (!/^\d{10}$/.test(pnr ?? "")) {
  console.error("Usage: npm run source:probe -- <10-digit PNR>");
  process.exit(2);
}
const key = process.env.RAPIDAPI_KEY;
if (!key) {
  console.error("RAPIDAPI_KEY is not set. Add it to .env.local (never commit it).");
  process.exit(2);
}
const host = process.env.RAPIDAPI_HOST || "irctc1.p.rapidapi.com";
const path = process.env.RAPIDAPI_PNR_PATH || "/api/v3/getPNRStatus";

function shape(value, depth = 0) {
  if (depth > 6) return "…";
  if (value === null) return "null";
  if (Array.isArray(value)) return value.length === 0 ? "[]" : [`array(${value.length}) of`, shape(value[0], depth + 1)];
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v, depth + 1)]));
  if (typeof value === "string") return `string(${value.length})`;
  return typeof value;
}

const started = Date.now();
const response = await fetch(`https://${host}${path}?pnrNumber=${pnr}`, {
  headers: { "x-rapidapi-key": key, "x-rapidapi-host": host, accept: "application/json" },
  signal: AbortSignal.timeout(15000),
}).catch((error) => {
  console.error(`Request failed: ${error.name}`);
  process.exit(1);
});
console.log(`HTTP ${response.status} in ${Date.now() - started} ms`);
console.log(`x-ratelimit-requests-remaining: ${response.headers.get("x-ratelimit-requests-remaining") ?? "not sent"}`);
const text = await response.text();
try {
  console.log(JSON.stringify(shape(JSON.parse(text)), null, 2));
} catch {
  console.log(`Body is not JSON (${text.length} characters).`);
}
