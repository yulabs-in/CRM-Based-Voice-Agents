import { Skeleton } from "@/components/ui/skeleton";

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading table">
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }).map((_, c) => (
          <Skeleton key={`h-${c}`} className="h-4 w-3/4 rounded" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={`r-${r}`} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }).map((__, c) => (
            <Skeleton key={`c-${r}-${c}`} className="h-9 w-full rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-label="Loading cards">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border bg-card p-5 shadow-soft">
          <Skeleton className="h-4 w-1/2 rounded" />
          <Skeleton className="mt-3 h-8 w-2/3 rounded" />
          <Skeleton className="mt-2 h-3 w-3/4 rounded" />
        </div>
      ))}
    </div>
  );
}
