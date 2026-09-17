import { Skeleton } from "@/components/ui/skeleton";
import { DataTableSkeleton } from "@/components/tables/data-table-skeleton";

export default function EmployeesLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <DataTableSkeleton columns={6} rows={10} />
    </div>
  );
}
