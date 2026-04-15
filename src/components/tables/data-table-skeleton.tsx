import { Skeleton } from "@/components/ui/skeleton";

interface DataTableSkeletonProps {
  columns?: number;
  rows?: number;
}

export function DataTableSkeleton({ columns = 6, rows = 8 }: DataTableSkeletonProps) {
  return (
    <div className="space-y-4">
      {/* Toolbar skeleton */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
        <div className="flex-1" />
        <Skeleton className="h-9 w-28" />
      </div>

      {/* Table skeleton */}
      <div className="rounded-md border">
        {/* Header */}
        <div className="flex items-center border-b px-4 h-10 bg-muted/50">
          {Array.from({ length: columns }).map((_, i) => (
            <div key={i} className="flex-1 px-2">
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>

        {/* Rows */}
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center border-b px-4 h-12">
            {Array.from({ length: columns }).map((_, j) => (
              <div key={j} className="flex-1 px-2">
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Pagination skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
        </div>
      </div>
    </div>
  );
}
