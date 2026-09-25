// Renders the route list to a standalone page, so the drawn design and the built one can be put
// side by side without waiting for the fan-out behind them.
//
// It runs the REAL components through React's server renderer against the app's own compiled
// stylesheet. What it cannot prove is the thing the fan-out will decide — where the data comes
// from — so every number here is shaped like a real one and is labelled sample data on the plate.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PreBookingForm } from "../src/app/(site)/pre-booking/pre-booking-form.tsx";
import { TrainsPlate } from "../src/app/(site)/pre-booking/trains-plate.tsx";

const OUT = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..", ".render", "trains-list.html");
const CSS = process.argv[3] ?? "app.css";

const train = (trainNo, trainName, departs, arrives, travelTime, days) => ({
  trainNo,
  trainName,
  fromCode: "SBC",
  fromName: "KSR Bengaluru",
  toCode: "NDLS",
  toName: "New Delhi",
  originCode: "SBC",
  originName: "KSR Bengaluru",
  destinationCode: "NDLS",
  destinationName: "New Delhi",
  departs,
  arrives,
  travelTime,
  runningDays: null,
  runsOn: Array.from({ length: 7 }, (_, i) => i < days),
  halts: null,
  distanceKm: 2444,
});

const day = (status, canBook, wlBooking, wlCurrent) => ({
  date: "2026-10-16",
  status,
  availabilityText: status,
  rawStatus: status,
  canBook,
  wlBooking,
  wlCurrent,
  seats: null,
  prediction: null,
  predictionPercentage: null,
});

const answer = (d, total) => ({
  train: { no: "", name: "", fromName: "KSR Bengaluru", toName: "New Delhi", distanceKm: 2444 },
  fare: total === null ? null : { base: total, reservation: 0, superfast: 0, gst: 0, total },
  days: [d],
  retrievedAt: "2026-10-16T08:39:00.000Z",
});

const row = (t, d, total, over = {}) => ({
  train: t,
  answers: d ? { SL: answer(d, total) } : {},
  pending: ["3A", "2A"],
  beyondCap: false,
  failed: false,
  ...over,
});

// The eight trains the provider really returns for SBC → NDLS (probed 2026-09-25). The statuses
// are shaped like real ones and are not measured — which is why the plate says Sample data.
const ROWS = [
  row(train("12649", "SAMPARK KRANTI", "13:30", "04:10", "42h 40m", 2), day("WL", true, 136, 44), 710),
  row(train("12629", "SAMPARK KRANTI", "13:30", "04:10", "38h 40m", 2), day("AVAILABLE", true, null, null), 710),
  row(train("22685", "CDG SKRANTI EXP", "13:30", "04:10", "44h 10m", 1), day("WL", true, 136, 96), 745),
  row(train("12627", "KARNATAKA EXP", "19:20", "09:00", "37h 40m", 7), day("WAITLIST", false, null, null), 765),
  row(train("22691", "RAJDHANI EXP", "20:00", "05:30", "33h 30m", 4), null, null, { failed: true, pending: ["3A", "2A"] }),
  row(train("12647", "KONGU SF EXP", "21:00", "09:45", "36h 45m", 1), day("WL", true, 136, 148), 735),
  row(train("12213", "YPR DEE DURONTO", "23:00", "09:15", "34h 15m", 2), day("AVAILABLE", true, null, null), 800),
  row(train("00629", "YPR-ICOD TKD PCET", "10:15", "06:30", "44h 15m", 1), null, null, { beyondCap: true, pending: ["SL", "3A", "2A"] }),
];

// The form renders at its opening state: this is React's static renderer, so no effect has run and
// nothing has been fetched. It is the shape of the page, not a working one.
const form = renderToStaticMarkup(createElement(PreBookingForm));

const list = renderToStaticMarkup(
  TrainsPlate({
    answer: { from: "SBC", to: "NDLS", journeyDate: "2026-10-16", leadClass: "SL", rows: ROWS, retrievedAt: "14:09" },
    refusal: null,
    sampleData: true,
  }),
);

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Trains on this route</title>
<link rel="stylesheet" href="${CSS}">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@500;600&display=swap">
<style>body{margin:0;font-family:Barlow,ui-sans-serif,system-ui,sans-serif;font-size:16px;line-height:1.5}</style>
</head>
<body class="bg-surface-0 text-ink-1" data-theme="dark" style="color-scheme:dark">
<section class="page-frame page-body">
<div class="max-w-[60ch]">
<h1 class="optical-hang text-page tracking-display text-pretty">Availability before booking</h1>
<p class="mt-3.5 text-base text-ink-1/78">Pick the stations, the date and the classes you would travel in. Every train on that route answers at once.</p>
</div>
${form}${list}</section>
</body></html>`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html, "utf8");
console.log(`wrote ${OUT} (${ROWS.length} rows)`);
