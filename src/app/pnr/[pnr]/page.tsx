"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CoachMap } from "@/components/coach";
import { MovementPanel, TrendBars } from "@/components/charts";
import { FactorLegend, FactorRows } from "@/components/factors";
import { CountdownRing, ProbabilityDial, aspectFor } from "@/components/instruments";
import { Reveal } from "@/components/reveal";
import { formatPnr, isValidPnr } from "@/lib/engine";
import { clientSyntheticSource } from "@/lib/source";
import { getEntry, upsertEntry } from "@/lib/store";
import type { PnrResult } from "@/lib/types";
import { ArrowIcon, Chip, PlateLabel, Button, RuledRow, AspectLamps } from "@/components/ui";
import { fmtDayShort, fmtTimeIST } from "@/lib/time";

type Phase = "reading" | "settled" | "error";

export default function PnrResultPage() {
  const params = useParams<{ pnr: string }>();
  const pnr = (params?.pnr ?? "").toString();

  const [phase, setPhase] = useState<Phase>("reading");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PnrResult | null>(null);
  const [history, setHistory] = useState<{ points: import("@/lib/types").HistoryPoint[] }>({ points: [] });
  const [copied, setCopied] = useState(false);

  const run = useCallback(
    async (silent = false) => {
      if (!isValidPnr(pnr)) {
        setPhase("error");
        setError("That isn't a 10-digit PNR. Check the number on the top-left of your ticket.");
        return;
      }
      if (!silent) setPhase("reading");
      const existing = getEntry(pnr);
      const out = await clientSyntheticSource.check(pnr, existing?.checks ?? []);
      if (!out.ok) {
        setPhase("error");
        setError(out.code === "NOT_FOUND" ? "No reservation found for this number." : out.message);
        return;
      }
      const res = out.result;
      setResult(res);
      const lead = res.lead;
      const point = {
        at: new Date().toISOString(),
        status: lead.status,
        position: lead.position,
        probability: res.prediction.probability,
      };
      const label = `${res.snapshot.train.number} · ${res.snapshot.train.from.code}→${res.snapshot.train.to.code}`;
      const all = upsertEntry(pnr, label, point);
      const entry = all.find((e) => e.pnr === pnr);
      setHistory({ points: entry?.checks ?? [] });
      // hold the reading frame long enough to feel like a read
      window.setTimeout(() => setPhase("settled"), silent ? 120 : 900);
    },
    [pnr]
  );

  useEffect(() => {
    run();
  }, [run]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  if (phase === "error") {
    return (
      <section className="mx-auto w-full max-w-2xl px-4 pb-24 pt-40 sm:px-6">
        <div className="bezel">
          <div className="bezel-plate flex flex-col items-center px-6 py-16 text-center">
            <span className="led bg-stop" />
            <h1 className="mt-5 text-2xl font-bold">No read available</h1>
            <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-steel">{error}</p>
            <Link href="/" className="mt-8">
              <Button>Check another PNR</Button>
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const reading = phase === "reading" || !result;

  if (reading) {
    return (
      <section className="mx-auto flex min-h-[86vh] w-full max-w-3xl flex-col items-center justify-center px-4 pt-20">
        <div className="well rounded-3xl px-8 py-10 text-center sm:px-14">
          <PlateLabel>Decoding reservation</PlateLabel>
          <div
            className="mt-6 flex items-center justify-center gap-1 font-data text-[clamp(1.7rem,7vw,3rem)] font-medium text-bone"
            aria-label={`Reading PNR ${formatPnr(pnr)}`}
            role="status"
            aria-live="polite"
          >
            {formatPnr(pnr).split("").map((c, i) => (
              <span
                key={i}
                className={c === " " ? "w-3" : "scan-char inline-block"}
                style={{ animationDelay: `${i * 42}ms` }}
              >
                {c === " " ? "\u00A0" : c}
              </span>
            ))}
          </div>
          <div className="mt-6 flex items-center justify-center gap-2 font-data text-[10px] tracking-[0.26em] text-steel">
            <span className="led bg-watch lamp-live" />
            QUERYING THE RESERVATION LEDGER
          </div>
          <p className="mt-4 text-[12px] text-steel">
            Sample demo engine · resolves against modeled patterns
          </p>
        </div>
      </section>
    );
  }

  const r = result;
  const aspect = aspectFor(r.prediction.probability);
  const aspectText =
    aspect === "go" ? "GO — strongly toward confirmed" : aspect === "watch" ? "WATCH — genuinely in play" : "STOP — plan an alternate";
  const aspectColor =
    aspect === "go" ? "var(--go)" : aspect === "watch" ? "var(--watch)" : "var(--stop)";

  const s = r.snapshot;
  const lead = r.lead;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-28 sm:px-6 sm:pt-32">
      {/* Toolbar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/"
          className="group inline-flex items-center gap-2 rounded-full px-2 py-1 text-[12.5px] text-steel transition-colors hover:text-bone"
        >
          <ArrowIcon dir="left" size={11} className="transition-transform duration-200 group-hover:-translate-x-0.5" />
          Check another
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Chip dot tone="watch" size="sm">
            Demo prediction
          </Chip>
          <Button variant="outline" size="sm" onClick={share}>
            {copied ? "Link copied" : "Share read"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => run(true)}>
            Re-check
          </Button>
          <Link href="/watchlist">
            <Button variant="ghost" size="sm">
              In watchlist
              <ArrowIcon size={11} />
            </Button>
          </Link>
        </div>
      </div>

      {/* ============ MASTER PANEL ============ */}
      <div className="bezel overflow-hidden">
        <div className="bezel-plate">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,42%)_minmax(0,58%)]">
            {/* Ticket plate */}
            <div className="flex flex-col border-b border-(--line) p-5 sm:p-7 lg:border-b-0 lg:border-r">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <PlateLabel>Train</PlateLabel>
                  <h1 className="mt-1 font-data text-[clamp(1.15rem,2.6vw,1.6rem)] font-semibold tracking-[0.02em] text-bone">
                    {s.train.number}
                    <span className="ml-2 text-bone/70">·</span>
                  </h1>
                  <p className="mt-0.5 text-[13px] font-medium tracking-[0.06em] text-steel-2">
                    {s.train.name}
                  </p>
                </div>
                <Chip dot tone={aspect}>
                  {aspect.toUpperCase()}
                </Chip>
              </div>

              {/* Route block */}
              <div className="mt-7 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div>
                  <div className="font-data text-[clamp(1.5rem,4vw,2.3rem)] font-semibold tracking-[0.04em] text-bone">
                    {s.train.from.code}
                  </div>
                  <div className="mt-0.5 text-[11px] text-steel">{s.train.from.city}</div>
                </div>
                <div className="flex flex-col items-center px-2">
                  <span className="font-data text-[10px] tracking-[0.2em] text-steel">{s.train.distanceKm} KM</span>
                  <svg width="52" height="10" viewBox="0 0 52 10" aria-hidden="true">
                    <line x1="0" y1="5" x2="44" y2="5" stroke="var(--steel)" strokeWidth="1.4" strokeDasharray="4 3" />
                    <polygon points="46,5 40,2 40,8" fill="var(--go)" />
                  </svg>
                </div>
                <div className="text-right">
                  <div className="font-data text-[clamp(1.5rem,4vw,2.3rem)] font-semibold tracking-[0.04em] text-bone">
                    {s.train.to.code}
                  </div>
                  <div className="mt-0.5 text-[11px] text-steel">{s.train.to.city}</div>
                </div>
              </div>

              <div className="mt-7 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-2">
                <div>
                  <PlateLabel>Departs</PlateLabel>
                  <div className="mt-1 font-data text-[14px] text-bone">
                    {fmtDayShort(new Date(s.journeyDate + "T00:00:00+05:30"))} · {s.train.depTime}
                  </div>
                </div>
                <div>
                  <PlateLabel>Class / Quota</PlateLabel>
                  <div className="mt-1 font-data text-[14px] text-bone">
                    {s.cls} · {lead.quota}
                  </div>
                </div>
                <div>
                  <PlateLabel>Chart prepared</PlateLabel>
                  <div className="mt-1 font-data text-[14px] text-bone">
                    {s.chartTime} IST
                  </div>
                </div>
                <div>
                  <PlateLabel>Passengers</PlateLabel>
                  <div className="mt-1 font-data text-[14px] text-bone">{s.passengerCount}</div>
                </div>
              </div>

              <div className="mt-7 border-t border-(--line)">
                <PlateLabel className="mt-4">Passenger statuses</PlateLabel>
                <div className="mt-1">
                  {s.pax.map((p) => (
                    <RuledRow
                      key={p.index}
                      left={`PASSENGER ${p.index}${p.coach ? ` · ${p.coach}` : ""}${p.berth ? ` · berth ${p.berth}` : ""}`}
                      right={
                        p.currentStatus === "CNF"
                          ? "CNF"
                          : `${p.currentStatus} ${p.position ?? ""}`.trim()
                      }
                      tone={
                        p.currentStatus === "CNF" ? "go" : p.position != null && p.currentStatus === "WL" && p.position > 20 ? "stop" : "watch"
                      }
                    />
                  ))}
                </div>
              </div>

              <p className="mt-auto pt-6 font-data text-[10px] leading-relaxed tracking-[0.12em] text-steel/80">
                PNR {formatPnr(s.pnr)} · DEMO RECORD — SYNTHETIC, NOT A REAL BOOKING
              </p>
            </div>

            {/* Instrument deck */}
            <div className="flex flex-col p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4 sm:gap-x-10">
                <div className="flex flex-col items-center gap-1">
                  <ProbabilityDial probability={r.prediction.probability} animate size={238} />
                  <PlateLabel>Confirmation odds</PlateLabel>
                </div>
                <div className="hidden h-40 w-px bg-(--line) sm:block" aria-hidden="true" />
                <div className="flex flex-col items-center gap-1">
                  <CountdownRing chartAt={s.chartAt} animate size={238} />
                  <PlateLabel>Until chart prep</PlateLabel>
                </div>
              </div>

              {/* Aspect + recommendation */}
              <div className="mt-6 flex flex-col items-center gap-3 rounded-panel border border-(--line) bg-ink-2/60 px-5 py-4 text-center">
                <AspectLamps active={aspect} />
                <p className="max-w-xl text-pretty text-[14px] leading-relaxed text-bone">
                  <span className="font-data text-[11px] uppercase tracking-[0.18em]" style={{ color: aspectColor }}>
                    {r.prediction.recommendation} ·{" "}
                  </span>
                  {r.prediction.note}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
                  <Chip dot tone="neutral">
                    confidence {r.prediction.confidence}
                  </Chip>
                  <span className="font-data text-[10px] tracking-[0.18em] text-steel">
                    {aspectText}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============ FACTORS + MOVEMENT ============ */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Reveal delay={120}>
          <div className="bezel h-full">
            <div className="bezel-plate flex h-full flex-col p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <PlateLabel>Why this number</PlateLabel>
                  <h2 className="mt-1 text-[15px] font-semibold">Factor ledger</h2>
                </div>
                <FactorLegend />
              </div>
              <div className="mt-4 flex-1">
                <FactorRows factors={r.prediction.factors} settled={phase === "settled"} />
              </div>
              <p className="mt-3 border-t border-(--line) pt-3 text-[11px] leading-relaxed text-steel">
                Factors are additive from a 50-point prior and calibrated to this
                train, class, quota and departure day. Full method on the accuracy page.
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal delay={200}>
          <div className="bezel h-full">
            <div className="bezel-plate flex h-full flex-col p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <PlateLabel>Movement</PlateLabel>
                  <h2 className="mt-1 text-[15px] font-semibold">
                    {lead.status === "CNF" ? "Seat locked before chart" : `${lead.status} ${lead.position ?? ""} toward chart`}
                  </h2>
                </div>
                {lead.status !== "CNF" && (
                  <Chip dot tone={aspect} className="hidden sm:inline-flex">
                    {aspect.toUpperCase()}
                  </Chip>
                )}
              </div>
              <div className="mt-5 flex-1">
                {lead.status === "CNF" ? (
                  <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 text-center">
                    <span className="led bg-go shadow-[0_0_14px_rgba(47,191,113,0.7)]" />
                    <p className="max-w-xs text-[13px] leading-relaxed text-steel">
                      Your berth is already chart-locked. The movement race is
                      over — this seat no longer depends on the ledger.
                    </p>
                  </div>
                ) : (
                  <MovementPanel
                    points={history.points}
                    currentPos={lead.position ?? 1}
                    hoursToChart={r.hoursToChart}
                    probability={r.prediction.probability}
                    unit={lead.status === "RAC" ? "RAC" : "WL"}
                    settled={phase === "settled"}
                  />
                )}
              </div>
              <div className="mt-4 border-t border-(--line) pt-3">
                {history.points.length > 1 ? (
                  <p className="text-[11px] text-steel">
                    {history.points.length} checks recorded on this device. Re-check closer to chart to
                    watch momentum accumulate.
                  </p>
                ) : lead.status !== "CNF" ? (
                  <p className="text-[11px] text-steel">
                    Solid line = your recorded checks (re-check to grow it). Dashed path = modeled
                    expectation to chart for this position, labeled honestly as demo.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </Reveal>
      </div>

      {/* ============ TREND + COACH ============ */}
      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Reveal delay={140} className="lg:col-span-2">
          <div className="bezel h-full">
            <div className="bezel-plate flex h-full flex-col p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <PlateLabel>Confirmation pressure</PlateLabel>
                  <h2 className="mt-1 text-[15px] font-semibold">5-day modelled trend</h2>
                </div>
                <Chip tone="neutral">prior · demo</Chip>
              </div>
              <div className="mt-5 flex-1">
                <TrendBars trend={r.trend} settled={phase === "settled"} />
              </div>
              <p className="mt-4 border-t border-(--line) pt-3 text-[11px] leading-relaxed text-steel">
                Share of {s.cls} bookings confirming in the five prior days for
                this corridor, modelled from demand priors — not claimed as
                tracked counts until the community ledger ships.
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal delay={220} className="lg:col-span-3">
          <div className="bezel h-full">
            <div className="bezel-plate flex h-full flex-col p-5 sm:p-6">
              <div>
                <PlateLabel>Inside the coach</PlateLabel>
                <h2 className="mt-1 text-[15px] font-semibold">
                  {lead.coach ? `${lead.coach} · ${s.cls}` : "Your coach"} at a glance
                </h2>
              </div>
              <div className="mt-5 flex-1">
                <CoachMap pnr={s.pnr} yourBerth={lead.berth?.replace(/[A-Z]+/, "").trim()} coach={lead.coach} settled={phase === "settled"} />
              </div>
            </div>
          </div>
        </Reveal>
      </div>

      {/* Provenance footnote */}
      <p className="mt-6 text-center font-data text-[10px] tracking-[0.18em] text-steel/70">
        CHECKED {fmtTimeIST(new Date())} IST · DEMO ENGINE · LIVE STATUS LANDS WITH THE DATA SOURCE MILESTONE
      </p>
    </div>
  );
}
