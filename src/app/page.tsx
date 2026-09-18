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
import { SourcesBoard } from "@/components/landing/sources-board";
import { buildSpecimen } from "@/components/landing/specimen-data";
import { SpecimenRecord } from "@/components/landing/specimen-record";
import { activePnrSource, env, isThirdPartySource } from "@/services/env";
import { fixtureClock } from "@/services/sources/fixture";

export const metadata: Metadata = {
  title: "Check your PNR status",
  description: "Enter a 10-digit Indian Railways PNR and read exactly what the source returned. Free, no account needed.",
};

/** The landing sheet, as Landing Redesign B draws it, section by section. */
export default async function HomePage() {
  // Per request: the sources board and sample mode read the live flags, and the specimen's retrieval time is real.
  await connection();
  const source = activePnrSource(env());
  const sampleMode = source === "fixture";
  const thirdPartySource = isThirdPartySource(source) ? source : undefined;
  const specimen = buildSpecimen(fixtureClock());
  return (
    <div id="top" className="page-frame">
      <Hero sampleMode={sampleMode} thirdPartySource={thirdPartySource} />
      <PrinciplesSheet />
      <HowItWorks />
      <SpecimenRecord specimen={specimen} />
      <SourcesBoard />
      <Roadmap />
      <Features />
      <PhotoSplit />
      <Faq />
      <ClosingCta sampleMode={sampleMode} thirdPartySource={thirdPartySource} />
    </div>
  );
}
