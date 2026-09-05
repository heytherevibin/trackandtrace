import Link from "next/link";
import { ArrowIcon, Bezel, Chip, PlateLabel } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { DEMO_PNRS, formatPnr } from "@/lib/engine";

// Synthetic calibration ledger — clearly labelled demo numbers, structured so
// the real community ledger can replace them without changing the surface.
const BUCKETS = [
  { label: "80–100%", n: 240, actual: 92, hint: "Strong reads — CNF-heavy and near-chart buckets" },
  { label: "60–79%", n: 318, actual: 74, hint: "The improving-watchlist zone" },
  { label: "40–59%", n: 276, actual: 47, hint: "Coin-flip territory — planning signals only" },
  { label: "0–39%", n: 152, actual: 21, hint: "Honest negative reads — plan an alternate" },
];

export const metadata = { title: "Accuracy & method" };

export default function AccuracyPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-28 sm:px-6 sm:pt-32">
      <div className="max-w-2xl">
        <PlateLabel>Trust is earned in buckets</PlateLabel>
        <h1 className="mt-2 text-balance text-4xl font-bold tracking-[-0.02em] sm:text-5xl">
          We show our work — including the misses.
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-steel-2">
          A probability is only worth what its track record says. Every read is
          binned by confidence so you can judge the tool where it matters: did
          tickets in each band actually behave that way?
        </p>
      </div>

      {/* Calibration ledger */}
      <Reveal delay={100}>
        <Bezel className="mt-10">
          <div className="bezel-plate">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-(--line) px-5 py-4 sm:px-6">
              <div>
                <PlateLabel>Demo calibration ledger</PlateLabel>
                <h2 className="mt-1 text-[15px] font-semibold">Predicted band vs observed outcome</h2>
              </div>
              <Chip dot tone="watch" size="sm">
                Synthetic sample · labelled
              </Chip>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left">
                <thead>
                  <tr className="border-b border-(--line)">
                    <th className="px-5 py-3 font-data text-[10px] font-medium tracking-[0.2em] text-steel sm:px-6">Predicted band</th>
                    <th className="px-5 py-3 font-data text-[10px] font-medium tracking-[0.2em] text-steel sm:px-6">Reads</th>
                    <th className="px-5 py-3 font-data text-[10px] font-medium tracking-[0.2em] text-steel sm:px-6">Confirmed at chart</th>
                    <th className="hidden px-5 py-3 font-data text-[10px] font-medium tracking-[0.2em] text-steel sm:px-6 md:table-cell">Reading</th>
                  </tr>
                </thead>
                <tbody>
                  {BUCKETS.map((b) => {
                    const offset = b.actual - Number(b.label.split("–")[0].replace("%", ""));
                    const tone = Math.abs(offset) <= 6 ? "text-go" : Math.abs(offset) <= 12 ? "text-watch" : "text-stop";
                    return (
                      <tr key={b.label} className="border-b border-(--line) last:border-b-0">
                        <td className="px-5 py-3.5 sm:px-6">
                          <span className="font-data text-[13px] text-bone">{b.label}</span>
                        </td>
                        <td className="px-5 py-3.5 font-data text-[13px] text-steel-2 sm:px-6">{b.n}</td>
                        <td className="px-5 py-3.5 sm:px-6">
                          <div className="flex items-center gap-3">
                            <div className="h-[5px] w-28 overflow-hidden rounded-full bg-ink-4">
                              <div
                                className={`h-full rounded-full ${Math.abs(offset) <= 6 ? "bg-go" : Math.abs(offset) <= 12 ? "bg-watch" : "bg-stop"}`}
                                style={{ width: `${b.actual}%` }}
                              />
                            </div>
                            <span className={`font-data text-[13px] ${tone}`}>{b.actual}%</span>
                          </div>
                        </td>
                        <td className="hidden px-5 py-3.5 text-[12px] text-steel sm:px-6 md:table-cell">{b.hint}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="border-t border-(--line) px-5 py-3.5 text-[11px] leading-relaxed text-steel sm:px-6">
              Sample drawn from the deterministic demo engine — real tracked outcomes arrive with the
              community ledger, when travellers confirm how their tickets actually landed.
            </p>
          </div>
        </Bezel>
      </Reveal>

      {/* Method */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Reveal delay={120}>
          <Bezel className="h-full">
            <div className="bezel-plate p-5 sm:p-6">
              <PlateLabel>Method</PlateLabel>
              <h2 className="mt-1 text-[15px] font-semibold">What moves the number</h2>
              <ul className="mt-4 space-y-3">
                {[
                  ["Time to chart", "The dominant factor — movement concentrates in the final 72h; the chart locks ≈ 4h before departure."],
                  ["Waitlist position", "Scored against each train/class confirmation horizon, not as an absolute."],
                  ["Quota behaviour", "GN, PQWL, RLWL, Tatkal and the rest carry different priors."],
                  ["Class and day", "Occupancy pressure and departure-day demand shift the base."],
                  ["Your momentum", "Recorded checks on this device add a trend term — moving up is worth real points."],
                ].map(([t, d]) => (
                  <li key={t} className="flex gap-3">
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-go/70" />
                    <div>
                      <p className="text-[13px] font-medium text-bone">{t}</p>
                      <p className="mt-0.5 text-[12.5px] leading-relaxed text-steel">{d}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-5 border-t border-(--line) pt-4 text-[11.5px] leading-relaxed text-steel">
                Factors are additive from a 50-point prior and clipped to 3–97.
                Confidence is High inside 18h to chart, Medium inside 72h, Low beyond —
                far from chart, honest uncertainty beats false certainty.
              </p>
            </div>
          </Bezel>
        </Reveal>

        <Reveal delay={200}>
          <Bezel className="h-full">
            <div className="bezel-plate flex h-full flex-col p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <PlateLabel>Replicable</PlateLabel>
                  <h2 className="mt-1 text-[15px] font-semibold">Documented demo PNRs</h2>
                </div>
                <Chip dot tone="watch" size="sm">Demo engine</Chip>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-steel">
                These numbers resolve deterministically on this build — the same PNR,
                the same read. They exist so the product can be tested and critiqued
                without touching a real booking:
              </p>
              <div className="mt-4 flex-1 space-y-2">
                {Object.entries(DEMO_PNRS).map(([pnr, label]) => (
                  <Link
                    key={pnr}
                    href={`/pnr/${pnr}`}
                    className="flex items-center justify-between gap-4 rounded-field border border-(--line) bg-ink-2/60 px-4 py-3 transition-colors hover:border-(--line-2) hover:bg-ink-2"
                  >
                    <span className="font-data text-[13px] font-medium text-bone">{formatPnr(pnr)}</span>
                    <span className="truncate text-right text-[12px] text-steel">{label}</span>
                    <ArrowIcon size={11} className="text-steel" />
                  </Link>
                ))}
              </div>
              <p className="mt-4 border-t border-(--line) pt-3 text-[11.5px] leading-relaxed text-steel">
                A real PNR typed here also resolves — deterministically, and clearly
                labelled as synthetic. Live status plugs into the same seam when the
                data source milestone lands.
              </p>
            </div>
          </Bezel>
        </Reveal>
      </div>

      {/* Boundaries */}
      <Reveal delay={160}>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            ["What we never claim", "Predictions are indicative. The chart is final. No tool can promise a berth — anyone who does is guessing."],
            ["What demo means", "Every read on this build is generated from modelled priors and says so on the surface."],
            ["What changes at live", "Real status, real movement, real calibration — the same interface, honest provenance."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-panel border border-(--line) bg-ink-2/40 p-5">
              <p className="text-[13px] font-semibold text-bone">{t}</p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-steel">{d}</p>
            </div>
          ))}
        </div>
      </Reveal>
    </div>
  );
}
