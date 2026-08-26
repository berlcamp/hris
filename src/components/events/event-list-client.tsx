"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/data-table";
import { eventColumns } from "@/components/tables/columns/event-columns";
import { EventFormDialog } from "@/components/events/event-form-dialog";
import type { EventListRow } from "@/lib/types";

export function EventListClient({
  events,
  totalCount,
  canManage,
}: {
  events: EventListRow[];
  totalCount: number;
  canManage: boolean;
}) {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <DataTable
        columns={eventColumns({ canManage })}
        data={events}
        totalCount={totalCount}
        searchableColumns={[{ id: "title", title: "event" }]}
        toolbar={
          canManage ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              New Event
            </Button>
          ) : null
        }
      />
      <EventFormDialog open={createOpen} onOpenChange={setCreateOpen} event={null} />
    </>
  );
}
