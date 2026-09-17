import { PnrResultSkeleton } from "@/components/pnr/pnr-result-skeleton";

export default function Loading() {
  return (
    <section className="mx-auto w-full max-w-page px-4 py-8 sm:px-6">
      <PnrResultSkeleton />
    </section>
  );
}
