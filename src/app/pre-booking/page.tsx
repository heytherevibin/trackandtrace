"use client";

import { useMemo, useState } from "react";
import { Bezel, Button, Chip, PlateLabel, SelectField } from "@/components/ui";
import { MiniDial } from "@/components/instruments";
import { Reveal } from "@/components/reveal";
import { TRAIN_CATALOG } from "@/lib/catalog";
import { CLASS_OPTIONS, QUOTA_OPTIONS, TRAIN_OPTIONS, analyzeContext, type BookingContext } from "@/lib/context";
import type { BookingClass, Quota } from "@/lib/types";

export default function PreBookingPage() {
  const [trainNo, setTrainNo] = useState(TRAIN_OPTIONS[0].value);
  const [cls, setCls] = useState<BookingClass>("3A");
  const [quota, setQuota] = useState<Quota>("GN");
  const [days, setDays] = useState(2);
  const [compare, setCompare] = useState(false);
  const [phase, setPhase] = useState<"idle" | "reading" | "done">("idle");

  const base: BookingContext = {
    train: TRAIN_CATALOG.find((t) => t.number === trainNo) ?? TRAIN_CATALOG[0],
    cls,
    quota,
    daysAhead: days,
  };

  const analyses = useMemo(() => {
    if (!compare) return [analyzeContext(base)];
    const idx = TRAIN_CATALOG.findIndex((t) => t.number === base.train.number);
    const picks: typeof TRAIN_CATALOG = [];
    for (let i = 0; picks.length < 4; i++) {
      const t = TRAIN_CATALOG[(idx + i) % TRAIN_CATALOG.length];
      if (!picks.some((p) => p.number === t.number)) picks.push(t);
    }
    return picks.map((train) => analyzeContext({ ...base, train }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base.train.number, cls, quota, days, compare]);

  const run = () => {
    setPhase("reading");
    window.setTimeout(() => setPhase("done"), 850);
    window.scrollTo({ top: 640, behavior: "smooth" });
  };

  const best = [...analyses].sort((a, b) => b.probability - a.probability)[0];
  const show = phase === "done";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-28 sm:px-6 sm:pt-32">
      <div className="max-w-2xl">
        <PlateLabel>Before you book — not after</PlateLabel>
        <h1 className="mt-2 text-balance text-4xl font-bold tracking-[-0.02em] sm:text-5xl">
          Read the route before your money locks in.
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-steel-2">
          Pick a train, class, quota and travel day. The ledger model reads that
          context the way it reads a PNR — and tells you whether the ticket
          confirms before you buy it.
        </p>
      </div>

      {/* Parameter deck */}
      <Reveal delay={120}>
        <Bezel className="mt-10">
          <div className="bezel-plate">
            <div className="grid gap-5 border-b border-(--line) p-5 sm:p-6 lg:grid-cols-[auto_1fr_auto] lg:items-end">
              <div>
                <PlateLabel>Mode</PlateLabel>
                <div className="mt-2 inline-flex rounded-full border border-(--line) bg-ink-1 p-1">
                  {[
                    { v: false, l: "Single route" },
                    { v: true, l: "Compare trains" },
                  ].map((m) => (
                    <button
                      key={m.l}
                      type="button"
                      onClick={() => setCompare(m.v)}
                      aria-pressed={compare === m.v}
                      className={`rounded-full px-4 py-1.5 text-[12px] font-medium transition-colors duration-200 cursor-pointer ${
                        compare === m.v ? "bg-bone text-ink-1" : "text-steel hover:text-bone"
                      }`}
                    >
                      {m.l}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SelectField
                  label="Train"
                  value={trainNo}
                  onChange={(v) => setTrainNo(v)}
                  options={TRAIN_OPTIONS}
                />
                <SelectField
                  label="Class"
                  value={cls}
                  onChange={(v) => setCls(v as BookingClass)}
                  options={CLASS_OPTIONS}
                />
                <SelectField
                  label="Quota"
                  value={quota}
                  onChange={(v) => setQuota(v as Quota)}
                  options={QUOTA_OPTIONS}
                />
                <SelectField
                  label="Travel in"
                  value={String(days)}
                  onChange={(v) => setDays(Number(v))}
                  options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({
                    value: String(d),
                    label: d === 1 ? "Tomorrow" : `${d} days`,
                  }))}
                />
              </div>

              <Button variant="primary" onClick={run} className="justify-center lg:px-8">
                {phase === "reading" ? "Reading the ledger…" : compare ? "Run comparison" : "Run analysis"}
              </Button>
            </div>
          </div>
        </Bezel>
      </Reveal>

      {/* Reading state */}
      {phase === "reading" && (
        <div className="mt-10 flex flex-col items-center gap-3 py-16">
          <span className="led bg-watch lamp-live" />
          <p className="font-data text-[11px] tracking-[0.24em] text-steel uppercase">
            Scoring {compare ? "4 contexts" : "1 context"} against demand priors
          </p>
        </div>
      )}

      {/* Results */}
      {show && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {analyses.map((a, i) => (
            <Reveal key={`${a.context.train.number}-${i}`} delay={i * 130}>
              <div className={`bezel h-full ${best === a ? "ring-1 ring-go/40" : ""}`}>
                <div className="bezel-plate flex h-full flex-col p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <PlateLabel>{compare ? `Option ${i + 1}` : "Single route read"}</PlateLabel>
                      <h2 className="mt-1 font-data text-[16px] font-semibold text-bone">
                        {a.context.train.number}
                        <span className="ml-2 font-sans text-[13px] font-medium tracking-[0.06em] text-steel-2">
                          {a.context.train.name}
                        </span>
                      </h2>
                      <p className="mt-1 font-data text-[11px] tracking-[0.08em] text-steel">
                        {a.context.train.from.code} → {a.context.train.to.code} · {a.journeyDateLabel} ·{" "}
                        {a.context.cls} · {a.context.quota}
                      </p>
                    </div>
                    <MiniDial value={a.probability} />
                  </div>

                  {best === a && compare && (
                    <Chip dot tone="go" className="mt-3 w-fit">
                      Top pick this context
                    </Chip>
                  )}

                  <p className="mt-4 text-[13px] leading-relaxed text-bone">
                    <span className="font-data text-[11px] uppercase tracking-[0.14em] text-go">
                      {a.recommendation} ·{" "}
                    </span>
                    {a.note}
                  </p>

                  <div className="mt-4 grid grid-cols-3 gap-3 border-t border-(--line) pt-4">
                    <div>
                      <PlateLabel>Lead position</PlateLabel>
                      <div className="mt-1 font-data text-[15px] text-bone">
                        {a.position === 0 ? "CNF" : `${a.context.cls} WL ${a.position}`}
                      </div>
                    </div>
                    <div>
                      <PlateLabel>To chart</PlateLabel>
                      <div className="mt-1 font-data text-[15px] text-bone">
                        {Math.max(1, Math.round(a.hoursToChart))}h
                      </div>
                    </div>
                    <div>
                      <PlateLabel>Confidence</PlateLabel>
                      <div className="mt-1 font-data text-[15px] uppercase text-bone">{a.confidence}</div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <PlateLabel className="mb-1.5">Why</PlateLabel>
                    <ul className="space-y-1.5">
                      {a.factors.slice(0, 3).map((f) => (
                        <li key={f.id} className="flex items-baseline justify-between gap-3 text-[12px]">
                          <span className="text-steel">{f.label}</span>
                          <span className={`font-data ${f.points > 0 ? "text-go" : f.points < 0 ? "text-stop" : "text-steel"}`}>
                            {f.points > 0 ? `+${f.points}` : f.points}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      )}

      <p className="mt-6 text-center font-data text-[10px] tracking-[0.18em] text-steel/70">
        MODELLED FROM DEMAND PRIORS · DEMO ENGINE — NOT A GUARANTEE OF ANY REAL BOOKING OUTCOME
      </p>
    </div>
  );
}
