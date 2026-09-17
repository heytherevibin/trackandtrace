import { Plate } from "@/components/ui/plate";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { messages } from "@/messages";

/** The result sheet's plates with flat blocks where the record will be. Announced once by the group. */
export function PnrResultSkeleton() {
  const m = messages.result;
  return (
    <SkeletonGroup label={messages.states.loadingResult} className="flex flex-col">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-5 w-40" />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="w-full min-w-0 max-w-[60ch]">
            <Skeleton className="h-12 w-72 max-w-full" />
            <Skeleton className="mt-3.5 h-6 w-96 max-w-full" />
            <Skeleton className="mt-3 h-5 w-40" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-32" />
          </div>
        </div>
      </div>
      <Plate as="div" title={m.status.legend} meta={[m.status.sheet]} cells="tight" className="mt-8" bodyClassName="flex flex-col gap-3.5">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-5 w-full max-w-measure" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-5 w-full max-w-prose" />
      </Plate>
      <div className="mt-[28px] grid items-start gap-[28px] lg:grid-cols-[1.25fr_.75fr]">
        <Plate as="div" title={m.passengers.legend} cells="tight" bodyClassName="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </Plate>
        <Plate as="div" title={m.journey.legend} cells="tight">
          <Skeleton className="h-28 w-full" />
        </Plate>
      </div>
      <Plate as="div" title={m.provenance.legend} cells="tight" className="mt-[28px]" bodyClassName="flex flex-col gap-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-8 w-56" />
      </Plate>
    </SkeletonGroup>
  );
}
