import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="mx-auto w-full max-w-page px-4 py-8 sm:px-6">
      <SkeletonGroup className="flex flex-col gap-6">
        <Skeleton className="h-10 w-48" />
        <div className="panel p-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="mt-2 h-10 w-full" />
          <Skeleton className="mt-2 h-10 w-full" />
        </div>
      </SkeletonGroup>
    </section>
  );
}
