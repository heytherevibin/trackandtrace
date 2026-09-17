import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { messages } from "@/messages";

/** Ghost of the result layout while the source is queried. */
export function PnrResultSkeleton() {
  return (
    <SkeletonGroup label={messages.states.loadingResult} className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-5 w-64" />
      </div>
      <div className="panel p-6 sm:p-8">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-4 h-7 w-32" />
        <Skeleton className="mt-4 h-10 w-56" />
        <Skeleton className="mt-3 h-4 w-full max-w-prose" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="panel p-6">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-4 h-10 w-full" />
          <Skeleton className="mt-2 h-10 w-full" />
        </div>
        <div className="panel p-6">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-4 h-5 w-full" />
          <Skeleton className="mt-2 h-5 w-full" />
          <Skeleton className="mt-2 h-5 w-3/4" />
        </div>
      </div>
      <div className="panel p-6">
        <Skeleton className="h-4 w-56" />
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </div>
    </SkeletonGroup>
  );
}
