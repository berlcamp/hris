// Pure renewal-chain ordering for the COS contract timeline. Lives in its own
// dependency-light module (no JSX, no next/link) so it is importable both by
// the React component and directly by supabase/tests/cos-contract-unit.test.mts
// under `node --experimental-strip-types`, which cannot load a component file
// that pulls in next/link or JSX.

import type { CosContractWithEmployee } from "@/lib/actions/cos-contract-actions";

export interface ChainRow {
  contract: CosContractWithEmployee;
  depth: number;
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
export function toChains(
  contracts: CosContractWithEmployee[],
): ChainRow[] {
  const successorOf = new Map<string, CosContractWithEmployee>();
  for (const c of contracts) {
    if (c.renewed_from_id) successorOf.set(c.renewed_from_id, c);
  }

  const rows: ChainRow[] = [];
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
