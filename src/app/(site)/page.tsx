import type { Metadata } from "next";
import { connection } from "next/server";
import { ClosingCta } from "@/components/landing/closing-cta";
import { Faq } from "@/components/landing/faq";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { JourneyLoader } from "@/components/landing/journey/journey-loader";
import { PrinciplesSheet } from "@/components/landing/principles-sheet";
import { Roadmap } from "@/components/landing/roadmap";
import { ReliabilityBand } from "@/components/landing/reliability-band";
import { activePnrSource, env } from "@/services/env";
import { serviceStatus } from "@/services/service-status";

export const metadata: Metadata = {
  title: { absolute: "Trakline — Check your PNR status" },
  description: "Enter a 10-digit Indian Railways PNR and read exactly what the source returned. Free, no account needed.",
};

/**
 * The landing sheet, as Neubrutal v4 draws it: the hero with the live check plate, the operating principles, how it
 * works, reliability, the roadmap, the questions, and the close — the train arrived at the terminus over the yellow
 * plate. The journey's loader stays only for that train's live arrival (the owner, 2026-10-18).
 */
export default async function HomePage() {
  // Per request: service status and sample mode read the live configuration.
  await connection();
  const current = env();
  const sampleMode = activePnrSource(current) === "fixture";
  const status = serviceStatus();
  const connected = !sampleMode && status.checks === "operational";
  return (
    <div id="top" className="page-frame">
      <Hero sampleMode={sampleMode} connected={connected} />
      <PrinciplesSheet />
      <HowItWorks />
      <ReliabilityBand checks={status.checks} />
      <Roadmap />
      <Faq />
      <ClosingCta />
      <JourneyLoader />
    </div>
  );
}
