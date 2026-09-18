import type { Metadata } from "next";
import { connection } from "next/server";
import { ClosingCta } from "@/components/landing/closing-cta";
import { Faq } from "@/components/landing/faq";
import { Features } from "@/components/landing/features";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { PhotoSplit } from "@/components/landing/photo-split";
import { PrinciplesSheet } from "@/components/landing/principles-sheet";
import { Roadmap } from "@/components/landing/roadmap";
import { ReliabilityBand } from "@/components/landing/reliability-band";
import { buildSpecimen } from "@/components/landing/specimen-data";
import { SpecimenRecord } from "@/components/landing/specimen-record";
import { activePnrSource, env } from "@/services/env";
import { serviceStatus } from "@/services/service-status";
import { fixtureClock } from "@/services/sources/fixture";

export const metadata: Metadata = {
  title: { absolute: "Trakline — Check your PNR status" },
  description: "Enter a 10-digit Indian Railways PNR and read exactly what the source returned. Free, no account needed.",
};

/** The landing sheet, as Landing Redesign B draws it, section by section. */
export default async function HomePage() {
  // Per request: service status and sample mode read the live configuration, and the specimen's retrieval time is real.
  await connection();
  const source = activePnrSource(env());
  const sampleMode = source === "fixture";
  const status = serviceStatus();
  const connected = !sampleMode && status.checks === "operational";
  const specimen = buildSpecimen(fixtureClock());
  return (
    <div id="top" className="page-frame">
      <Hero sampleMode={sampleMode} connected={connected} />
      <PrinciplesSheet />
      <HowItWorks />
      <SpecimenRecord specimen={specimen} />
      <ReliabilityBand checks={status.checks} />
      <Roadmap />
      <Features />
      <PhotoSplit />
      <Faq />
      <ClosingCta sampleMode={sampleMode} connected={connected} />
    </div>
  );
}
