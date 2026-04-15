import { Skeleton } from "@/components/ui/skeleton";
import { DataTableSkeleton } from "@/components/tables/data-table-skeleton";

export default function PerformanceLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
      <DataTableSkeleton columns={7} rows={8} />
    </div>
  );
}
