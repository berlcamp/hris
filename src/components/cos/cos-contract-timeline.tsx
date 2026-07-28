import Link from "next/link";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CosContractWithEmployee } from "@/lib/actions/cos-contract-actions";
import { toChains } from "@/lib/cos-contract-chains";
import {
  COS_CONTRACT_STATUS_LABELS,
  COS_CONTRACT_STATUS_VARIANT,
  deriveCosContractStatus,
} from "@/lib/cos-constants";

function formatDay(iso: string): string {
  return format(new Date(`${iso}T00:00:00`), "MMM d, yyyy");
}

interface CosContractTimelineProps {
  /** Oldest-first, as returned by getContractsForEmployee. */
  contracts: CosContractWithEmployee[];
}

export function CosContractTimeline({ contracts }: CosContractTimelineProps) {
  if (contracts.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No contracts recorded for this employee yet.
      </p>
    );
  }

  const rows = toChains(contracts);
  const hasSuccessor = new Set(
    contracts.map((c) => c.renewed_from_id).filter((id): id is string => !!id),
  );

  return (
    <div className="flex flex-col gap-2">
      {rows.map(({ contract, depth }) => {
        const derived = deriveCosContractStatus(contract);
        // Mirrors the settled canRenew in cos/contracts/[id]/page.tsx: not
        // terminated, not already renewed, and the employee still active.
        // contract.cos_employees carries that employee's CURRENT status (it's
        // a live join, not a snapshot), so this stays in lockstep with the
        // detail page without the timeline needing an extra prop.
        const canRenew =
          derived !== "terminated" &&
          !hasSuccessor.has(contract.id) &&
          contract.cos_employees?.status === "active";

        return (
          <div
            key={contract.id}
            className="flex flex-wrap items-center gap-3 rounded-md border p-3"
            style={{ marginLeft: `${depth * 24}px` }}
          >
            <div className="flex-1 min-w-[220px]">
              <p className="text-sm font-medium">
                {formatDay(contract.period_start)} – {formatDay(contract.period_end)}
                {contract.renewed_from_id ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (renewal)
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-muted-foreground">
                {contract.position_title ?? "—"}
                {contract.monthly_rate !== null
                  ? ` · ${contract.monthly_rate.toLocaleString("en-PH", {
                      style: "currency",
                      currency: "PHP",
                      minimumFractionDigits: 2,
                    })}`
                  : ""}
              </p>
            </div>

            <Badge variant={COS_CONTRACT_STATUS_VARIANT[derived]}>
              {COS_CONTRACT_STATUS_LABELS[derived]}
            </Badge>

            <div className="flex gap-2">
              <Link href={`/cos/contracts/${contract.id}`}>
                <Button variant="outline" size="sm">
                  View
                </Button>
              </Link>
              {canRenew ? (
                <Link href={`/cos/contracts/new?renew=${contract.id}`}>
                  <Button variant="outline" size="sm">
                    Renew
                  </Button>
                </Link>
              ) : null}
              <Link href={`/cos/contracts/new?duplicate=${contract.id}`}>
                <Button variant="outline" size="sm">
                  Duplicate
                </Button>
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
