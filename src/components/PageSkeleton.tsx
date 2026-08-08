import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fallback for a lazily-loaded page, shown inside the persistent shell (#118).
 *
 * The old fallback was a full-screen centred spinner, which made sense when
 * the whole tree was replaced. Inside the shell it would imply the entire app
 * was reloading, when in fact only the content area is waiting on a chunk.
 */
export function PageSkeleton() {
  return (
    <div className="p-4 lg:p-6 space-y-4" aria-busy="true" aria-label="Loading page">
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
