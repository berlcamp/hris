import Link from "next/link";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CosContractWithEmployee } from "@/lib/actions/cos-contract-actions";
import {
  COS_CONTRACT_STATUS_LABELS,
  COS_CONTRACT_STATUS_VARIANT,
  deriveCosContractStatus,
} from "@/lib/cos-constants";

function formatDay(iso: string): string {
  return format(new Date(`${iso}T00:00:00`), "MMM d, yyyy");
}

/**
 * Orders contracts as renewal chains: each root (no renewed_from_id) followed
 * by its successors, each indented one step deeper.
 *
 * Any contract not reachable from a root is appended at depth 0 rather than
 * dropped. UNIQUE (renewed_from_id) plus ON DELETE RESTRICT should make an
 * orphan impossible, so if one appears it is a data anomaly — showing it is
 * how anyone finds out.
 */
function toChains(
  contracts: CosContractWithEmployee[],
): { contract: CosContractWithEmployee; depth: number }[] {
  const successorOf = new Map<string, CosContractWithEmployee>();
  for (const c of contracts) {
    if (c.renewed_from_id) successorOf.set(c.renewed_from_id, c);
  }

  const rows: { contract: CosContractWithEmployee; depth: number }[] = [];
  const seen = new Set<string>();

  for (const root of contracts.filter((c) => !c.renewed_from_id)) {
    let current: CosContractWithEmployee | undefined = root;
    let depth = 0;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      rows.push({ contract: current, depth });
      current = successorOf.get(current.id);
      depth += 1;
    }
  }

  for (const c of contracts) {
    if (!seen.has(c.id)) rows.push({ contract: c, depth: 0 });
  }

  return rows;
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
