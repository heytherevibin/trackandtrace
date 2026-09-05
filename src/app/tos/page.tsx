import { PlateLabel } from "@/components/ui";

export const metadata = { title: "Terms of service" };

export default function TosPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-20 pt-28 sm:px-6 sm:pt-32">
      <PlateLabel>Legal · plain language</PlateLabel>
      <h1 className="mt-2 text-4xl font-bold tracking-[-0.02em]">Terms of service</h1>
      <div className="mt-8 space-y-6 text-[14px] leading-relaxed text-steel-2">
        {[
          [
            "What this is",
            "Track & Trace is an independent, unaffiliated utility that reads PNR numbers and presents status and modelled confirmation odds. It is not IRCTC and not Indian Railways.",
          ],
          [
            "Predictions are indicative",
            "All probabilities, factors and recommendations are estimates. The reservation chart is the final authority on any booking. Never rely on a prediction alone for critical travel.",
          ],
          [
            "Demo data",
            "Until live status is enabled, every read on this product is generated from a labelled demo engine. Demo data must never be presented as a real booking or a real outcome.",
          ],
          [
            "Your data",
            "The current build stores your watchlist on your own device. When accounts arrive, you will be able to export or delete your data.",
          ],
          [
            "No guarantees",
            "The service is provided as-is, without warranty of any kind. Availability, accuracy and continuity are not guaranteed.",
          ],
        ].map(([t, d]) => (
          <section key={t}>
            <h2 className="text-[15px] font-semibold text-bone">{t}</h2>
            <p className="mt-2">{d}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
