import { Skeleton } from "./skeleton";

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export function TableSkeleton({
  rows = 10,
  columns = 8,
  className = ""
}: TableSkeletonProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {/* Header skeleton */}
      <div className="flex gap-2 border-b pb-2">
        {Array.from({ length: columns }).map((_, j) => (
          <Skeleton key={`header-${j}`} className="h-8 flex-1" />
        ))}
      </div>

      {/* Row skeletons */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={`row-${i}`} className="flex gap-2 py-1">
          {Array.from({ length: columns }).map((_, j) => (
            <Skeleton key={`cell-${i}-${j}`} className="h-8 flex-1" />
          ))}
        </div>
      ))}

      {/* Pagination skeleton */}
      <div className="flex items-center justify-between gap-3 pt-4 border-t">
        <Skeleton className="h-6 w-32" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
    </div>
  );
}