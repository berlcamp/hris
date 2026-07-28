"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/data-table";
import { cosTemplateColumns } from "@/components/tables/columns/cos-template-columns";
import type { CosContractTemplate } from "@/lib/actions/cos-contract-template-actions";

interface CosTemplateListClientProps {
  templates: CosContractTemplate[];
  canCreate: boolean;
}

export function CosTemplateListClient({
  templates,
  canCreate,
}: CosTemplateListClientProps) {
  return (
    <DataTable
      columns={cosTemplateColumns()}
      data={templates}
      searchableColumns={[{ id: "name", title: "template name" }]}
      filterableColumns={[
        {
          id: "status",
          title: "Status",
          options: [
            { label: "Active", value: "Active" },
            { label: "Inactive", value: "Inactive" },
          ],
        },
      ]}
      toolbar={
        canCreate ? (
          <Link href="/cos/templates/new">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              New Template
            </Button>
          </Link>
        ) : null
      }
    />
  );
}
