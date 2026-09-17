import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PnrResultSkeleton } from "@/components/pnr/pnr-result-skeleton";
import { formatPnr, pnrSchema } from "@/utils/pnr";
import { PnrResultLoader } from "./pnr-result-loader";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ pnr: string }> }): Promise<Metadata> {
  const { pnr } = await params;
  return { title: `PNR ${formatPnr(pnr)}`, robots: { index: false, follow: false } };
}

export default async function PnrPage({ params }: { params: Promise<{ pnr: string }> }) {
  const { pnr } = await params;
  if (!pnrSchema.safeParse(pnr).success) notFound();
  return (
    <section className="page-frame page-body">
      <Suspense fallback={<PnrResultSkeleton />}>
        <PnrResultLoader pnr={pnr} />
      </Suspense>
    </section>
  );
}
