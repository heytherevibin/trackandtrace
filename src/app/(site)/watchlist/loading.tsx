import { Skeleton } from "@/components/ui/skeleton";
import { CountSkeleton, SavedPlateSkeleton } from "./watchlist-skeleton";

/** The Watchlist sheet in outline: title block, the announcement line, the saved-PNR plate. */
export default function Loading() {
  return (
    <section className="page-frame page-body">
      <div className="max-w-[56ch]">
        <Skeleton className="h-[clamp(36px,4.24vw,55px)] w-60" />
        <Skeleton className="mt-3.5 h-6 w-96 max-w-full" />
        <CountSkeleton />
      </div>
      <div className="mt-4 min-h-5" />
      <SavedPlateSkeleton />
    </section>
  );
}
