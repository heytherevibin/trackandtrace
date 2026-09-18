import { Corners } from "@/components/ui/corners";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";

/** The saved-PNR plate in outline while entries load: header row, column heads, three rows. */
export function SavedPlateSkeleton() {
  return (
    <SkeletonGroup className="blueprint mt-4">
      <Corners />
      <div className="border-b border-line px-5 py-2.5">
        <Skeleton className="h-6 w-48" />
      </div>
      <div className="border-b border-line px-5 py-2.5">
        <Skeleton className="h-4.5 w-full" />
      </div>
      {["one", "two", "three"].map((row) => (
        <div key={row} className="border-b border-line px-5 py-3">
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** The count line under the lead while entries load. */
export function CountSkeleton() {
  return <Skeleton className="mt-3 h-5 w-16" />;
}
