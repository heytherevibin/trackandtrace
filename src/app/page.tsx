"use client";

import Link from "next/link";
import { useMemo } from "react";
import { PnrInput } from "@/components/pnr-input";
import { CountdownRing, ProbabilityDial } from "@/components/instruments";
import { Reveal } from "@/components/reveal";
import { ArrowIcon, Button, PlateLabel, Chip } from "@/components/ui";
import { checkPnr, formatPnr } from "@/lib/engine";
import { DEMO_PNRS } from "@/lib/engine";
import { fmtTimeIST } from "@/lib/time";
import {
  TargetRegular,
  TimerRegular,
  DataTrendingRegular,
} from "@fluentui/react-icons";

const SAMPLE_PNR = "8765432109";

export default function HomePage() {
  const sample = useMemo(() => {
    const out = checkPnr(SAMPLE_PNR);
    return out.ok ? out.result : null;
  }, []);

  return (
    <>
      {/* ============ HERO — the twin-face instrument ============ */}
      <section className="relative mx-auto w-full max-w-6xl overflow-hidden px-4 pb-20 pt-36 sm:px-6 sm:pt-44 lg:pt-52">
        {/* Ambient hero glow */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute left-1/2 top-[18%] size-[600px] -translate-x-1/2 rounded-full opacity-[0.07]" style={{ background: 'radial-gradient(circle, var(--go) 0%, transparent 70%)' }} />
          <div className="absolute left-1/2 top-[30%] size-[800px] -translate-x-1/2 rounded-full opacity-[0.04]" style={{ background: 'radial-gradient(circle, var(--brass) 0%, transparent 70%)' }} />
        </div>

        <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)_minmax(0,1fr)]">
          {/* Left face — time to chart (live sample) */}
          <Reveal className="order-2 flex justify-center lg:order-1 lg:justify-start" delay={120}>
            {sample && (
              <div className="flex flex-col items-center gap-2">
                <CountdownRing chartAt={sample.snapshot.chartAt} size={238} />
                <div className="mt-1 flex h-4 items-center gap-2">
                  <span className="led bg-watch" aria-hidden="true" />
                  <span className="font-data text-[10px] tracking-[0.2em] text-steel uppercase">
                    Live sample · {formatPnr(SAMPLE_PNR)}
                  </span>
                </div>
                <div className="plate-label">
                  {sample.snapshot.chartTime} IST · chart prep
                </div>
              </div>
            )}
          </Reveal>

          {/* Center — the terminal */}
          <div className="order-1 text-center lg:order-2">
            <Reveal>
              <div className="mb-10 flex flex-col items-center gap-6">
                <Chip dot tone="neutral">
                  Journey intelligence · Indian Railways
                </Chip>
                <h1 className="text-[clamp(1.75rem,6vw,5.5rem)] font-[800] leading-[1.05] tracking-[-0.03em] sm:leading-[0.92]">
                  <span className="text-bone">One ticket.</span>{" "}
                  <span className="text-bone/80">Read it before</span>
                  <br />
                  <span className="whitespace-nowrap text-go">chart time.</span>
                </h1>
                <p className="mx-auto max-w-xs text-pretty text-[10.5px] font-normal leading-[1.8] tracking-[0.03em] text-steel-2 sm:max-w-lg sm:text-[13px] sm:tracking-[0.04em]">
                  Enter your PNR. We decompose the odds into
                  the factors that move them.
                </p>
              </div>
            </Reveal>
            <Reveal delay={140} className="mx-auto max-w-[520px]">
              <PnrInput />
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <PlateLabel>Try a documented demo:</PlateLabel>
                {Object.entries(DEMO_PNRS).map(([pnr, label]) => (
                  <Link
                    key={pnr}
                    href={`/pnr/${pnr}`}
                    className="btn-press inline-flex items-center gap-1.5 rounded-full border border-bone/[0.06] bg-ink-2/40 px-3 py-1.5 font-data text-[10.5px] text-steel-2 transition-all hover:border-brass/25 hover:bg-ink-2/70 hover:text-bone"
                  >
                    {formatPnr(pnr)}
                    <span className="sr-only">{label}</span>
                  </Link>
                ))}
              </div>
            </Reveal>
          </div>

          {/* Right face — confirmation odds (live sample) */}
          <Reveal className="order-3 flex justify-center lg:justify-end" delay={220}>
            {sample && (
              <div className="flex flex-col items-center gap-2">
                <ProbabilityDial probability={sample.prediction.probability} size={238} />
                <div className="mt-1 flex h-4 items-center gap-2">
                  <span className="led bg-go" aria-hidden="true" />
                  <span className="font-data text-[10px] tracking-[0.2em] text-steel uppercase">
                    Sample read · RAC {sample.lead.position}
                  </span>
                </div>
                <div className="plate-label">
                  Confidence · {sample.prediction.confidence}
                </div>
              </div>
            )}
          </Reveal>
        </div>

        {/* Telemetry strip */}
        <Reveal delay={300}>
          <div className="mt-16 overflow-hidden rounded-panel border border-bone/[0.05] bg-ink-1/60" style={{ boxShadow: 'inset 0 1px 0 rgba(201,162,95,0.06), inset 0 -1px 0 rgba(0,0,0,0.2), 0 8px 24px -12px rgba(0,0,0,0.5)' }}>
            <div className="ticker-track flex w-max items-center gap-10 px-5 py-3 font-data text-[10px] tracking-[0.16em] text-steel">
              {[0, 1].map((dup) => (
                <div key={dup} className="flex items-center gap-10" aria-hidden={dup === 1}>
                  <span>CHART ≈ 4H BEFORE DEPARTURE</span>
                  <span className="led bg-go" aria-hidden="true" />
                  <span>WL MOVEMENT CONCENTRATES IN THE LAST 72H</span>
                  <span className="led bg-watch" aria-hidden="true" />
                  <span>QUOTA BEHAVES DIFFERENTLY — GN VS PQWL VS TATKAL</span>
                  <span className="led bg-go" aria-hidden="true" />
                  <span>RAILWAY TIME IS IST · ALWAYS</span>
                  <span className="led bg-watch" aria-hidden="true" />
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ============ WHY TIME WINS ============ */}
      <section className="relative mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <div className="max-w-lg">
              <PlateLabel>The clock that decides</PlateLabel>
              <h2 className="mt-3 text-balance text-4xl font-bold leading-[1.05] tracking-[-0.025em] sm:text-5xl">
                Most waitlist seats move in the final 72 hours — not before.
              </h2>
              <p className="mt-6 text-pretty text-[13px] font-normal leading-[1.85] tracking-[0.03em] text-steel-2">
                Confirmation is a race against the reservation chart. Tools that
                quote a percentage without telling you the window are reading
                tea leaves. We weight the single dominant variable — <strong className="text-bone/90">hours to
                chart</strong> — and show you exactly how each factor moves the number.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/accuracy">
                  <Button variant="outline">
                    Read the method
                    <ArrowIcon />
                  </Button>
                </Link>
              </div>
            </div>
          </Reveal>

          {/* Chart timeline instrument */}
          <Reveal delay={140}>
            <div className="bezel">
              <div className="bezel-plate p-6 sm:p-8">
                <PlateLabel>The approach to chart</PlateLabel>
                <div className="mt-7 flex flex-col gap-0">
                  {[
                    { t: "T − 72H", w: "34%", c: "var(--steel)", label: "Quiet churn — early cancellations trickle in", amp: 0.25 },
                    { t: "T − 48H", w: "58%", c: "var(--steel-2)", label: "Movement builds as passengers replan", amp: 0.55 },
                    { t: "T − 24H", w: "78%", c: "var(--watch)", label: "Peak window — most WL clears here", amp: 0.9 },
                    { t: "T − 6H", w: "92%", c: "var(--go)", label: "Final decisions; chart closes on the ledger", amp: 0.7 },
                    { t: "T − 0 · CHART", w: "100%", c: "var(--stop)", label: "Ledger locks. Status is final until boarding", amp: 0.15 },
                  ].map((row, i) => (
                    <div key={row.t} className="relative">
                      <div className="flex items-center gap-4 py-3.5">
                        <span className="w-20 shrink-0 font-data text-[11px] tracking-[0.1em] text-bone">
                          {row.t}
                        </span>
                        <div className="relative h-[26px] flex-1">
                          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-(--line)" />
                          <div
                            className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full"
                            style={{
                              width: row.w,
                              background: `linear-gradient(90deg, transparent, ${row.c})`,
                              opacity: row.amp,
                            }}
                          />
                          <span
                            className="absolute top-1/2 size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                            style={{ left: row.w, background: row.c, boxShadow: `0 0 10px ${row.c}` }}
                          />
                        </div>
                      </div>
                      <p className="ml-[6.5rem] -mt-2 pb-1 text-[12px] text-steel">{row.label}</p>
                      {i < 4 && <div className="ml-[6.5rem] h-px bg-(--line)" />}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ EXPLAINABLE ============ */}
      <section className="relative border-y border-(--line) bg-ink-1/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
          <Reveal className="max-w-2xl">
            <PlateLabel>A number, and the why</PlateLabel>
            <h2 className="mt-3 text-4xl font-bold leading-[1.05] tracking-[-0.025em] sm:text-5xl">
              Every percentage decomposes into factors you can see.
            </h2>
            <p className="mt-5 text-[13px] font-normal leading-[1.85] tracking-[0.03em] text-steel-2">
              The odds dial is only half the story. Beneath it, each factor
              states its case in points — <strong className="text-bone/90">nothing hidden</strong>, nothing averaged into
              a vibe.
            </p>
          </Reveal>

          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {[
              {
                k: "01",
                title: "Position within the horizon",
                body: "Your WL number vs this train's confirmation horizon — the line history rarely crosses.",
                tone: "var(--go)",
                Icon: TargetRegular,
              },
              {
                k: "02",
                title: "Hours left on the clock",
                body: "The dominant variable, weighted by the 72-hour movement window and the chart lock.",
                tone: "var(--watch)",
                Icon: TimerRegular,
              },
              {
                k: "03",
                title: "Quota, class and the day",
                body: "PQWL vs Tatkal, 3A vs Sleeper, Sunday vs Tuesday — each carries its own prior.",
                tone: "var(--stop)",
                Icon: DataTrendingRegular,
              },
            ].map((f, i) => (
              <Reveal key={f.k} delay={i * 100}>
                <article className="bezel hover-lift h-full cursor-default">
                  <div className="bezel-plate flex h-full flex-col p-6 sm:p-8">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <f.Icon className="size-[18px]" style={{ color: f.tone }} />
                        <span className="font-data text-[11px] text-brass/60">{f.k}</span>
                      </div>
                      <span className="size-2.5 rounded-full" style={{ background: f.tone, boxShadow: `0 0 12px ${f.tone}` }} />
                    </div>
                    <h3 className="mt-5 text-[15px] font-semibold leading-snug">{f.title}</h3>
                    <p className="mt-3 text-[11.5px] font-normal leading-[1.8] tracking-[0.03em] text-steel">{f.body}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>

          <Reveal className="mt-12">
            <div className="flex flex-col items-start justify-between gap-5 rounded-panel border border-(--line) bg-ink-2/50 p-6 sm:flex-row sm:items-center sm:p-8" style={{ boxShadow: 'inset 0 1px 0 rgba(201,162,95,0.06)' }}>
            <p className="max-w-2xl text-[13px] leading-relaxed text-steel">
              <span className="font-semibold text-bone">Honesty is the feature.</span>{" "}
              Every read carries its provenance and confidence. Demo predictions
              say so. Modeled trends say so. When live status arrives, it will
              say so too.
            </p>
            <Link href="/accuracy" className="shrink-0">
              <Button variant="primary">
                Calibration &amp; method
                <ArrowIcon />
              </Button>
            </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className="relative mx-auto w-full max-w-6xl px-4 py-28 text-center sm:px-6 sm:py-36">
        <Reveal>
          <PlateLabel>Your ticket is on the clock</PlateLabel>
          <h2 className="mx-auto mt-3 max-w-2xl text-balance text-4xl font-bold leading-[1.05] tracking-[-0.025em] sm:text-5xl">
            Check it now — the chart won't wait.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[14px] text-steel">
            Ten digits. One honest light. The reasoning laid open. Railway time
            is running either way.
          </p>
        </Reveal>
        <Reveal delay={120} className="mx-auto mt-8 max-w-[520px]">
          <PnrInput />
        </Reveal>
        <p className="mt-5 font-data text-[10px] tracking-[0.2em] text-steel/70">
          DEMO ENGINE · DOCUMENTED SAMPLE PNRS ABOVE · {fmtTimeIST(new Date())} IST
        </p>
      </section>
    </>
  );
}
