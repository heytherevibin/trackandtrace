import type { Metadata } from "next";
import { Availability } from "@/components/landing/availability";
import { TrackDivider } from "@/components/landing/track-divider";
import { Claims } from "@/components/landing/claims";
import { ClosingCta } from "@/components/landing/closing-cta";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";

export const metadata: Metadata = {
  title: "Check your PNR status",
  description: "Enter a 10-digit Indian Railways PNR and read exactly what the source returned. Free, no account needed.",
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <TrackDivider />
      <HowItWorks />
      <TrackDivider />
      <Claims />
      <TrackDivider />
      <Availability />
      <TrackDivider />
      <ClosingCta />
    </>
  );
}
