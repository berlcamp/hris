"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/data-table";
import { cosContractColumns } from "@/components/tables/columns/cos-contract-columns";
import type { CosContractWithEmployee } from "@/lib/actions/cos-contract-actions";
import {
  COS_CONTRACT_DERIVED_STATUSES,
  COS_CONTRACT_STATUS_LABELS,
} from "@/lib/cos-constants";

interface CosContractListClientProps {
  contracts: CosContractWithEmployee[];
  /** Department names, matching the "department" column's accessor value. */
  departmentOptions: { label: string; value: string }[];
  canCreate: boolean;
}

export function CosContractListClient({
  contracts,
  departmentOptions,
  canCreate,
}: CosContractListClientProps) {
  return (
    <DataTable
      columns={cosContractColumns()}
      data={contracts}
      searchableColumns={[{ id: "employee", title: "employee name or COS no." }]}
      filterableColumns={[
        { id: "department", title: "Department", options: departmentOptions },
        {
          id: "status",
          title: "Status",
          options: COS_CONTRACT_DERIVED_STATUSES.map((s) => ({
            label: COS_CONTRACT_STATUS_LABELS[s],
            value: s,
          })),
        },
      ]}
      toolbar={
        canCreate ? (
          <Link href="/cos/contracts/new">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              New Contract
            </Button>
          </Link>
        ) : null
      }
    />
  );
}
