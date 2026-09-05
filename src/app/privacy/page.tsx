import { PlateLabel } from "@/components/ui";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-20 pt-28 sm:px-6 sm:pt-32">
      <PlateLabel>Legal · plain language</PlateLabel>
      <h1 className="mt-2 text-4xl font-bold tracking-[-0.02em]">Privacy</h1>
      <div className="mt-8 space-y-6 text-[14px] leading-relaxed text-steel-2">
        {[
          [
            "Small by design",
            "The current build stores your watchlist in your browser's local storage — nothing is sent to a server. There are no analytics scripts, no trackers and no ad pixels on this product.",
          ],
          [
            "PNR handling",
            "A PNR identifies a booking, not your identity. Live status checks would be made server-side only to fetch the record you asked for; we would not log PNRs or passenger identifiers.",
          ],
          [
            "What we would store later",
            "If accounts and alerts ship, we would store only what the feature needs: your email for sign-in, the PNRs you choose to watch, and their status history — nothing more.",
          ],
          [
            "Export and deletion",
            "When accounts arrive, export (your stored records as a file) and full deletion will be one click away.",
          ],
          [
            "Third parties",
            "Fonts are served by the framework; no third-party behavioural services are embedded.",
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
