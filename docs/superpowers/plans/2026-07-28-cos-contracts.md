# COS-3 Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every COS employee a contract history — contracts with unlimited renewals, reusable boilerplate templates, early termination, a profile timeline, and a printable PDF.

**Architecture:** Two new `hris` tables (`cos_contract_templates`, `cos_contracts`) following migration 058's conventions. A Postgres exclusion constraint is the single authority on "no two contracts for one employee cover the same day". Contract bodies are stored as Tiptap JSON, snapshotted from a template at creation with merge tokens left unresolved; tokens resolve at print time against the contract's own columns. Printing walks that JSON into `@react-pdf/renderer` primitives — no HTML anywhere on the print path.

**Tech Stack:** Next.js 16.2 (App Router, React 19), Supabase (Postgres + PostgREST), TypeScript strict, Tailwind v4, shadcn/ui, react-hook-form + zod, `@tanstack/react-table` via `<DataTable>`, `@react-pdf/renderer`, Tiptap.

**Spec:** `docs/superpowers/specs/2026-07-28-cos-contracts-design.md`

## Global Constraints

- Every Supabase query calls `.schema("hris")` before `.from(...)`. The JS client does not honour the database `search_path`; omitting it silently queries `public`.
- New migrations keep the numeric prefix sequence and start with `SET search_path TO hris, public, auth, extensions;`.
- **Migration files are written, not applied.** The developer applies them to production directly. Never suggest `supabase db push`, the CLI, or the dashboard, and never add a reminder to run one.
- Server actions live in `src/lib/actions/`, carry `"use server"` at the top, and use `createAdminClient()` (service role, bypasses RLS). Role filtering is re-implemented in TypeScript.
- Every mutating action calls `logAudit()` from `src/lib/audit.ts` after the write, then `revalidatePath(...)`. `logAudit` swallows its own errors — keep that property.
- Reads of a soft-deleted table go through one private `baseQuery()` per action file applying `.is("deleted_at", null)`. No other `.from("cos_contracts")` / `.from("cos_contract_templates")` call appears in the module.
- Destructive deletes are `super_admin` only and are always `UPDATE ... SET deleted_at`, never `DELETE FROM`.
- Route params and `searchParams` are async in Next 16 — `await` before destructuring.
- Tests run under Node 22 (`--experimental-strip-types`). Modules imported by `supabase/tests/*.test.mts` must use **relative** imports with the `.ts` extension, not the `@/` alias — the Node test runner cannot resolve the alias.
- No DOM APIs (`DOMParser`, `document`, `window`) in any module a unit test imports.
- Dates are compared as `YYYY-MM-DD` strings, never as `Date` objects and never via `toISOString()`. Migration 035 exists because a timezone bug bit this project.
- `npm run lint && npm run build` must pass before any task is considered done. The repo has 4 pre-existing lint errors in `src/app/(dashboard)/reports/plantilla/page.tsx` and `src/components/nosi/nosi-form.tsx`; do not fix them here, but do not add a fifth.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/063_cos_contracts_module.sql` | Both tables, constraints, RLS |
| `src/lib/cos-constants.ts` *(modify)* | Contract status constants + derived-status helper |
| `src/lib/cos-number-to-words.ts` | Amount-in-words, ported from adm-v26 |
| `src/lib/cos-merge-fields.ts` | Token → value resolution |
| `src/lib/cos-contract-doc.ts` | Tiptap JSON → react-pdf primitives |
| `src/lib/validations/cos-contract-schema.ts` | zod schemas for both forms |
| `src/lib/auth-helpers.ts` *(modify)* | `canManageCosTemplates` |
| `src/lib/actions/cos-contract-template-actions.ts` | Template CRUD |
| `src/lib/actions/cos-contract-actions.ts` | Contract CRUD + renew + terminate |
| `src/components/cos/cos-rich-text-editor.tsx` | Tiptap editor, constrained toolbar |
| `src/components/cos/cos-template-form.tsx` | Template create/edit form |
| `src/components/cos/cos-contract-form.tsx` | Contract create/edit form |
| `src/components/cos/cos-contract-timeline.tsx` | Renewal chain on the profile page |
| `src/components/cos/cos-contract-pdf-button.tsx` | Client `pdf().toBlob()` trigger |
| `src/components/pdf/cos-contract-pdf.tsx` | The PDF document |
| `src/components/tables/columns/cos-contract-columns.tsx` | Contract list columns |
| `src/components/tables/columns/cos-template-columns.tsx` | Template list columns |
| 8 route files under `src/app/(dashboard)/cos/` | Pages |
| `supabase/tests/cos-contracts.test.mts` | Real-stack constraint tests |
| `supabase/tests/cos-contract-unit.test.mts` | Pure unit tests |

Ten tasks. Each ends with something independently testable and committed.

---

### Task 1: Migration and schema constraints

**Files:**
- Create: `supabase/migrations/063_cos_contracts_module.sql`
- Create: `supabase/tests/cos-contracts.test.mts`
- Modify: `package.json` (`test:cos-db` script)

**Interfaces:**
- Consumes: `hris.cos_employees` (migration 058), `hris.update_updated_at()` trigger function, `hris.get_user_role()` (migration 007).
- Produces: tables `hris.cos_contracts` and `hris.cos_contract_templates` with the exact column names used by every later task.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/063_cos_contracts_module.sql`:

```sql
-- Migration 063: Contract of Service — contracts and contract templates.
--
-- Fills the "Contract History" placeholder COS-1 left on the employee profile.
--
-- BODY STORAGE
-- ------------
-- `body` holds a Tiptap (ProseMirror) JSON document, not HTML. PDFs in this app
-- are produced client-side via pdf(<Doc/>).toBlob(), so an HTML body would put
-- an HTML parser on the print path and its unit tests would need a DOM that
-- `node --experimental-strip-types` does not provide. JSON is already a tree
-- over a known node vocabulary.
--
-- Creating a contract COPIES the chosen template's body. Editing a template
-- afterwards must never alter a contract already issued. The copy keeps its
-- {{merge_tokens}} UNRESOLVED; they resolve at print time against this row's
-- own columns, so an edited rate shows up on the next printout instead of
-- leaving stale text frozen in the body.
--
-- EXPIRY IS DERIVED, NEVER STORED
-- -------------------------------
-- A stored 'expired' status needs a cron to stay truthful and drifts the moment
-- that job fails. `period_end < today` is computed at read time. Only
-- 'terminated' -- an explicit human act with a date and a reason -- is stored.
SET search_path TO hris, public, auth, extensions;

-- btree_gist supplies the `uuid WITH =` operator class the exclusion
-- constraint below needs. gist alone cannot handle equality on uuid.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- ── Templates ────────────────────────────────────────────────────────────
CREATE TABLE hris.cos_contract_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  -- Tiptap JSON. NOT NULL: an empty template stores the editor's empty
  -- document so the print path has one shape to handle, never two.
  body        JSONB NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,

  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_by  UUID REFERENCES hris.user_profiles(id),
  updated_by  UUID REFERENCES hris.user_profiles(id),
  deleted_at  TIMESTAMPTZ
);

-- Partial, matching 058's uq_cos_employees_cos_no: soft-deleting a template
-- frees its name for reuse.
CREATE UNIQUE INDEX uq_cos_contract_templates_name
  ON hris.cos_contract_templates(lower(btrim(name))) WHERE deleted_at IS NULL;

CREATE INDEX idx_cos_contract_templates_active
  ON hris.cos_contract_templates(is_active) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_cos_contract_templates_updated_at
  BEFORE UPDATE ON hris.cos_contract_templates
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

-- ── Contracts ────────────────────────────────────────────────────────────
CREATE TABLE hris.cos_contracts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- RESTRICT, not CASCADE: contract history must outlive nothing. The app
  -- never hard-deletes an employee (deleteCosEmployee soft-deletes), so this
  -- is the backstop that makes that discipline safe.
  cos_employee_id    UUID NOT NULL
                       REFERENCES hris.cos_employees(id) ON DELETE RESTRICT,

  period_start       DATE NOT NULL,
  period_end         DATE NOT NULL,

  -- Copied onto the contract rather than read through to the employee: both
  -- legitimately differ between engagements, and a printed contract must not
  -- change when the registry is corrected later.
  monthly_rate       NUMERIC(12,2),
  position_title     TEXT,

  scope_of_work      TEXT,

  signatory_name     TEXT,
  signatory_position TEXT,
  witness_name       TEXT,
  witness_position   TEXT,

  body               JSONB NOT NULL,

  -- Provenance only. Never used to render: the body above is the snapshot.
  template_id        UUID REFERENCES hris.cos_contract_templates(id)
                       ON DELETE SET NULL,

  -- UNIQUE so a renewal chain cannot fork into two successors.
  renewed_from_id    UUID REFERENCES hris.cos_contracts(id) ON DELETE RESTRICT,

  status             TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'terminated')),
  terminated_on      DATE,
  termination_reason TEXT,

  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),
  created_by         UUID REFERENCES hris.user_profiles(id),
  updated_by         UUID REFERENCES hris.user_profiles(id),
  deleted_at         TIMESTAMPTZ,

  CONSTRAINT cos_contracts_period_order
    CHECK (period_end >= period_start),

  -- Both directions: status and date move together or not at all.
  CONSTRAINT cos_contracts_termination_consistent
    CHECK ((status = 'terminated') = (terminated_on IS NOT NULL)),

  CONSTRAINT cos_contracts_terminated_within_period
    CHECK (
      terminated_on IS NULL
      OR (terminated_on >= period_start AND terminated_on <= period_end)
    ),

  CONSTRAINT uq_cos_contracts_renewed_from UNIQUE (renewed_from_id)
);

-- One employee cannot hold two contracts covering the same day.
--
-- COALESCE(terminated_on, period_end) is load-bearing: it releases the unused
-- tail of a terminated contract so a replacement can start the next day.
-- Without it, ending someone early would block re-engaging them for the rest
-- of the original period.
--
-- WHERE (deleted_at IS NULL) keeps soft-deleted rows from blocking reuse,
-- matching the partial unique indexes in 058.
ALTER TABLE hris.cos_contracts
  ADD CONSTRAINT cos_contracts_no_overlap
  EXCLUDE USING gist (
    cos_employee_id WITH =,
    daterange(period_start, COALESCE(terminated_on, period_end), '[]') WITH &&
  ) WHERE (deleted_at IS NULL);

CREATE INDEX idx_cos_contracts_employee
  ON hris.cos_contracts(cos_employee_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_cos_contracts_period
  ON hris.cos_contracts(period_start, period_end) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_cos_contracts_updated_at
  BEFORE UPDATE ON hris.cos_contracts
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

-- ============================================================
-- RLS — same shape as 058, including the deliberate REVOKE.
--
-- Migration 020 installed ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO
-- authenticated, which auto-grants ALL the instant CREATE TABLE runs above.
-- A bare GRANT SELECT would be additive on top of that and narrow nothing, so
-- the ALL grant must be revoked first. Restricting `authenticated` to SELECT
-- forces every write through the server actions, which hold the soft-delete
-- rule, the super_admin delete gate and logAudit. Do NOT "fix" this back to
-- GRANT ALL — it is deliberate.
-- ============================================================
ALTER TABLE hris.cos_contract_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.cos_contracts          ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cos_manager_all_cos_contract_templates"
  ON hris.cos_contract_templates
  FOR ALL USING (
    hris.get_user_role() IN ('super_admin', 'hr_admin', 'cos_manager')
  );

CREATE POLICY "cos_manager_all_cos_contracts" ON hris.cos_contracts
  FOR ALL USING (
    hris.get_user_role() IN ('super_admin', 'hr_admin', 'cos_manager')
  );

REVOKE ALL ON hris.cos_contract_templates FROM authenticated;
REVOKE ALL ON hris.cos_contracts          FROM authenticated;
GRANT SELECT ON hris.cos_contract_templates TO authenticated;
GRANT SELECT ON hris.cos_contracts          TO authenticated;
GRANT ALL    ON hris.cos_contract_templates TO service_role;
GRANT ALL    ON hris.cos_contracts          TO service_role;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply it locally and confirm it lands**

Run:

```bash
colima start && npm run db:start && npm run db:reset
```

Expected: the tail of the output shows `Applying migration 063_cos_contracts_module.sql...` with no error, then `Finished supabase db reset`.

- [ ] **Step 3: Write the failing real-stack test**

Create `supabase/tests/cos-contracts.test.mts`. This mirrors `supabase/tests/cos-employees.test.mts` — read it first for the credential and cleanup pattern.

```typescript
// Schema-level tests for hris.cos_contracts against the LOCAL Supabase stack
// (real Postgres + real PostgREST).
//
// These prove the constraints the app relies on but cannot enforce itself:
// the exclusion constraint on overlapping periods, the renew-once UNIQUE, the
// termination CHECKs, and ON DELETE RESTRICT from contract to employee.
//
// Requires Node >= 22 (--experimental-strip-types) and a running stack:
//   npm run db:start && npm run test:cos-db

import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const PROJECT_DIR = fileURLToPath(new URL("../..", import.meta.url));
const status = JSON.parse(
  execSync("npx supabase status -o json", {
    cwd: PROJECT_DIR,
    encoding: "utf8",
  }),
);

const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  db: { schema: "hris" },
  auth: { autoRefreshToken: false, persistSession: false },
});

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const FK_VIOLATION = "23503";
const EXCLUSION_VIOLATION = "23P01";

const PREFIX = "TEST-CONTRACT-";
const EMPTY_DOC = { type: "doc", content: [] };

/** Creates a throwaway COS employee and returns its id. */
async function makeEmployee(suffix: string): Promise<string> {
  const { data, error } = await admin
    .from("cos_employees")
    .insert({
      cos_no: `${PREFIX}${suffix}`,
      first_name: "Test",
      last_name: "Contract",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

interface ContractOverrides {
  period_start?: string;
  period_end?: string;
  status?: string;
  terminated_on?: string | null;
  renewed_from_id?: string | null;
}

async function insertContract(
  employeeId: string,
  overrides: ContractOverrides = {},
) {
  return admin
    .from("cos_contracts")
    .insert({
      cos_employee_id: employeeId,
      period_start: overrides.period_start ?? "2026-01-01",
      period_end: overrides.period_end ?? "2026-06-30",
      body: EMPTY_DOC,
      ...overrides,
    })
    .select("id")
    .single();
}

test.after(async () => {
  const { data } = await admin
    .from("cos_employees")
    .select("id")
    .like("cos_no", `${PREFIX}%`);
  for (const row of data ?? []) {
    await admin.from("cos_contracts").delete().eq("cos_employee_id", row.id);
    await admin.from("cos_employees").delete().eq("id", row.id);
  }
});

test("overlapping periods for one employee are rejected", async () => {
  const emp = await makeEmployee("overlap");
  const first = await insertContract(emp);
  assert.equal(first.error, null);

  const second = await insertContract(emp, {
    period_start: "2026-06-30",
    period_end: "2026-12-31",
  });
  assert.equal(second.error?.code, EXCLUSION_VIOLATION);
});

test("adjacent periods are accepted", async () => {
  const emp = await makeEmployee("adjacent");
  assert.equal((await insertContract(emp)).error, null);
  const next = await insertContract(emp, {
    period_start: "2026-07-01",
    period_end: "2026-12-31",
  });
  assert.equal(next.error, null);
});

test("early termination frees the remaining period", async () => {
  const emp = await makeEmployee("terminate-frees");
  const first = await insertContract(emp);
  assert.equal(first.error, null);

  const upd = await admin
    .from("cos_contracts")
    .update({ status: "terminated", terminated_on: "2026-03-31" })
    .eq("id", first.data!.id);
  assert.equal(upd.error, null);

  const replacement = await insertContract(emp, {
    period_start: "2026-04-01",
    period_end: "2026-06-30",
  });
  assert.equal(replacement.error, null);
});

test("a soft-deleted contract does not block reusing its period", async () => {
  const emp = await makeEmployee("softdel");
  const first = await insertContract(emp);
  assert.equal(first.error, null);

  await admin
    .from("cos_contracts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", first.data!.id);

  const again = await insertContract(emp);
  assert.equal(again.error, null);
});

test("two employees may hold contracts over the same dates", async () => {
  const a = await makeEmployee("emp-a");
  const b = await makeEmployee("emp-b");
  assert.equal((await insertContract(a)).error, null);
  assert.equal((await insertContract(b)).error, null);
});

test("a contract cannot be renewed twice", async () => {
  const emp = await makeEmployee("renew-once");
  const source = await insertContract(emp);
  assert.equal(source.error, null);

  const firstRenewal = await insertContract(emp, {
    period_start: "2026-07-01",
    period_end: "2026-12-31",
    renewed_from_id: source.data!.id,
  });
  assert.equal(firstRenewal.error, null);

  const secondRenewal = await insertContract(emp, {
    period_start: "2027-01-01",
    period_end: "2027-06-30",
    renewed_from_id: source.data!.id,
  });
  assert.equal(secondRenewal.error?.code, UNIQUE_VIOLATION);
});

test("terminated status requires a termination date", async () => {
  const emp = await makeEmployee("term-nodate");
  const res = await insertContract(emp, { status: "terminated" });
  assert.equal(res.error?.code, CHECK_VIOLATION);
});

test("a termination date requires terminated status", async () => {
  const emp = await makeEmployee("date-nostatus");
  const res = await insertContract(emp, { terminated_on: "2026-03-31" });
  assert.equal(res.error?.code, CHECK_VIOLATION);
});

test("termination date outside the period is rejected", async () => {
  const emp = await makeEmployee("term-outside");
  const res = await insertContract(emp, {
    status: "terminated",
    terminated_on: "2026-09-30",
  });
  assert.equal(res.error?.code, CHECK_VIOLATION);
});

test("period_end before period_start is rejected", async () => {
  const emp = await makeEmployee("bad-order");
  const res = await insertContract(emp, {
    period_start: "2026-06-30",
    period_end: "2026-01-01",
  });
  assert.equal(res.error?.code, CHECK_VIOLATION);
});

test("hard-deleting an employee who holds a contract is blocked", async () => {
  const emp = await makeEmployee("restrict");
  assert.equal((await insertContract(emp)).error, null);

  const del = await admin.from("cos_employees").delete().eq("id", emp);
  assert.equal(del.error?.code, FK_VIOLATION);
});

test("soft-deleting an employee leaves their contracts readable", async () => {
  const emp = await makeEmployee("softdel-emp");
  assert.equal((await insertContract(emp)).error, null);

  await admin
    .from("cos_employees")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", emp);

  const { data, error } = await admin
    .from("cos_contracts")
    .select("id")
    .eq("cos_employee_id", emp)
    .is("deleted_at", null);
  assert.equal(error, null);
  assert.equal(data?.length, 1);
});
```

- [ ] **Step 4: Wire the test into the npm script**

In `package.json`, extend `test:cos-db` to include the new file:

```json
"test:cos-db": "node --experimental-strip-types --test supabase/tests/cos-employees.test.mts supabase/tests/cos-contracts.test.mts",
```

- [ ] **Step 5: Run the tests**

Run: `npm run test:cos-db`
Expected: `# pass 22` (10 from cos-employees, 12 new), `# fail 0`.

If any exclusion-constraint test errors with `operator class "uuid_ops" does not exist for access method "gist"`, the `CREATE EXTENSION btree_gist` did not run — re-check Step 1.

- [ ] **Step 6: Regenerate database types**

Run: `npm run db:types`
Expected: `src/lib/database.types.ts` gains `cos_contracts` and `cos_contract_templates` entries.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/063_cos_contracts_module.sql \
        supabase/tests/cos-contracts.test.mts \
        package.json src/lib/database.types.ts
git commit -m "feat(cos): add contracts and contract templates schema"
```

---

### Task 2: Contract status constants and derived status

**Files:**
- Modify: `src/lib/cos-constants.ts`
- Create: `supabase/tests/cos-contract-unit.test.mts`
- Modify: `package.json` (`test:cos` script)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `COS_CONTRACT_STATUSES: readonly ["active", "terminated"]`
  - `type CosContractStatus = "active" | "terminated"`
  - `type CosContractDerivedStatus = "active" | "expired" | "terminated"`
  - `deriveCosContractStatus(contract: { status: CosContractStatus; period_end: string }, today?: string): CosContractDerivedStatus`
  - `toIsoDateString(d: Date): string`
  - `COS_CONTRACT_STATUS_LABELS: Record<CosContractDerivedStatus, string>`
  - `COS_CONTRACT_STATUS_VARIANT: Record<CosContractDerivedStatus, "default" | "secondary" | "destructive">`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/cos-contract-unit.test.mts`:

```typescript
// Pure unit tests for the COS contract helpers. No database, no DOM.
//
// Imports are RELATIVE with a .ts extension: the Node test runner
// (`node --experimental-strip-types`) cannot resolve the "@/" path alias,
// which only Next.js's bundler understands.

import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveCosContractStatus,
  toIsoDateString,
} from "../../src/lib/cos-constants.ts";

test("a terminated contract reads as terminated regardless of dates", () => {
  const result = deriveCosContractStatus(
    { status: "terminated", period_end: "2099-12-31" },
    "2026-07-28",
  );
  assert.equal(result, "terminated");
});

test("an active contract ending in the future reads as active", () => {
  const result = deriveCosContractStatus(
    { status: "active", period_end: "2026-12-31" },
    "2026-07-28",
  );
  assert.equal(result, "active");
});

test("an active contract ending in the past reads as expired", () => {
  const result = deriveCosContractStatus(
    { status: "active", period_end: "2026-06-30" },
    "2026-07-28",
  );
  assert.equal(result, "expired");
});

test("a contract ending exactly today is still active", () => {
  const result = deriveCosContractStatus(
    { status: "active", period_end: "2026-07-28" },
    "2026-07-28",
  );
  assert.equal(result, "active");
});

test("toIsoDateString uses local date parts, not UTC", () => {
  // 2026-07-28 23:30 local. toISOString() would roll this to the 29th in any
  // timezone east of UTC, which is exactly the class of bug migration 035 fixed.
  const d = new Date(2026, 6, 28, 23, 30, 0);
  assert.equal(toIsoDateString(d), "2026-07-28");
});
```

- [ ] **Step 2: Wire the test into the npm script**

In `package.json`:

```json
"test:cos": "node --experimental-strip-types --test supabase/tests/cos-unit.test.mts supabase/tests/cos-contract-unit.test.mts",
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npm run test:cos`
Expected: FAIL — `SyntaxError` or `does not provide an export named 'deriveCosContractStatus'`.

- [ ] **Step 4: Implement**

Append to `src/lib/cos-constants.ts`:

```typescript
// ── Contracts (COS-3) ────────────────────────────────────────────────────
// Mirrors the CHECK constraint in
// supabase/migrations/063_cos_contracts_module.sql — keep in sync.
export const COS_CONTRACT_STATUSES = ["active", "terminated"] as const;
export type CosContractStatus = (typeof COS_CONTRACT_STATUSES)[number];

/**
 * What the UI shows. "expired" is NOT a stored status — a stored one would
 * need a cron to stay truthful and would drift the moment that job failed.
 */
export type CosContractDerivedStatus = "active" | "expired" | "terminated";

export const COS_CONTRACT_STATUS_LABELS: Record<
  CosContractDerivedStatus,
  string
> = {
  active: "Active",
  expired: "Expired",
  terminated: "Terminated",
};

export const COS_CONTRACT_STATUS_VARIANT: Record<
  CosContractDerivedStatus,
  "default" | "secondary" | "destructive"
> = {
  active: "default",
  expired: "secondary",
  terminated: "destructive",
};

/**
 * Local-calendar YYYY-MM-DD. Deliberately NOT toISOString(), which converts to
 * UTC and rolls the date over for evening times in Asia/Manila — the bug class
 * migration 035 exists to fix.
 */
export function toIsoDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The single source of truth for a contract's displayed state. List, detail
 * and timeline all call this so they cannot disagree.
 *
 * Dates are compared as YYYY-MM-DD strings, which sort lexicographically in
 * calendar order — no Date arithmetic, no timezone exposure.
 */
export function deriveCosContractStatus(
  contract: { status: CosContractStatus; period_end: string },
  today: string = toIsoDateString(new Date()),
): CosContractDerivedStatus {
  if (contract.status === "terminated") return "terminated";
  return contract.period_end < today ? "expired" : "active";
}
```

- [ ] **Step 5: Run the tests**

Run: `npm run test:cos`
Expected: PASS, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cos-constants.ts supabase/tests/cos-contract-unit.test.mts package.json
git commit -m "feat(cos): add contract status constants and derived status"
```

---

### Task 3: Amount in words

**Files:**
- Create: `src/lib/cos-number-to-words.ts`
- Modify: `supabase/tests/cos-contract-unit.test.mts`

**Interfaces:**
- Produces: `formatAmountInWords(amount: number): string`

Ported from `adm-v26/lib/pdf/generatePRUnspsc.ts:8-92`, where it is duplicated across two files. It is ported **once** here; that duplication is not carried over.

- [ ] **Step 1: Write the failing test**

Append to `supabase/tests/cos-contract-unit.test.mts`:

```typescript
import { formatAmountInWords } from "../../src/lib/cos-number-to-words.ts";

test("formatAmountInWords handles the boundaries", () => {
  assert.equal(formatAmountInWords(0), "ZERO");
  assert.equal(formatAmountInWords(1), "ONE");
  assert.equal(formatAmountInWords(19), "NINETEEN");
  assert.equal(formatAmountInWords(20), "TWENTY");
  assert.equal(formatAmountInWords(21), "TWENTY ONE");
  assert.equal(formatAmountInWords(100), "ONE HUNDRED");
  assert.equal(formatAmountInWords(999), "NINE HUNDRED NINETY NINE");
  assert.equal(formatAmountInWords(1000), "ONE THOUSAND");
  assert.equal(formatAmountInWords(24000), "TWENTY FOUR THOUSAND");
  assert.equal(formatAmountInWords(1000000), "ONE MILLION");
});

test("formatAmountInWords appends centavos as a fraction", () => {
  assert.equal(formatAmountInWords(24000.5), "TWENTY FOUR THOUSAND & 50/100");
  assert.equal(formatAmountInWords(1.25), "ONE & 25/100");
});

test("formatAmountInWords returns empty for a billion and above", () => {
  // Matches the adm-v26 original, which returns "" past 999,999,999. A COS
  // monthly rate can never reach this, and silently inventing a format would
  // be worse than an obvious blank.
  assert.equal(formatAmountInWords(1_000_000_000), "");
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test:cos`
Expected: FAIL — cannot find module `cos-number-to-words.ts`.

- [ ] **Step 3: Implement**

Create `src/lib/cos-number-to-words.ts`:

```typescript
// Amount in words for printed contracts — standard on PH government paperwork.
//
// Ported from adm-v26/lib/pdf/generatePRUnspsc.ts:8-92, where the same function
// is duplicated in generateGuaranteeLetter.ts. Ported once here; the
// duplication is not carried over.
//
// No DOM, no dependencies: supabase/tests/cos-contract-unit.test.mts imports
// this directly under `node --experimental-strip-types`.

const ONES = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];

const TENS = [
  "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty",
  "ninety",
];

function numberToWords(num: number): string {
  if (num === 0) return "zero";
  if (num < 20) return ONES[num];
  if (num < 100) {
    const ten = Math.floor(num / 10);
    const one = num % 10;
    return TENS[ten] + (one > 0 ? " " + ONES[one] : "");
  }
  if (num < 1000) {
    const hundred = Math.floor(num / 100);
    const remainder = num % 100;
    return (
      ONES[hundred] +
      " hundred" +
      (remainder > 0 ? " " + numberToWords(remainder) : "")
    );
  }
  if (num < 1_000_000) {
    const thousand = Math.floor(num / 1000);
    const remainder = num % 1000;
    return (
      numberToWords(thousand) +
      " thousand" +
      (remainder > 0 ? " " + numberToWords(remainder) : "")
    );
  }
  if (num < 1_000_000_000) {
    const million = Math.floor(num / 1_000_000);
    const remainder = num % 1_000_000;
    return (
      numberToWords(million) +
      " million" +
      (remainder > 0 ? " " + numberToWords(remainder) : "")
    );
  }
  // The original returns "" past 999,999,999. A COS monthly rate can never
  // reach this, and inventing a format silently would be worse than a blank.
  return "";
}

/** "TWENTY FOUR THOUSAND & 50/100" — uppercase, centavos as a fraction. */
export function formatAmountInWords(amount: number): string {
  const wholePart = Math.floor(amount);
  const decimalPart = Math.round((amount - wholePart) * 100);

  let words = numberToWords(wholePart).toUpperCase();
  if (decimalPart > 0) {
    words += ` & ${decimalPart}/100`;
  }
  return words;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:cos`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cos-number-to-words.ts supabase/tests/cos-contract-unit.test.mts
git commit -m "feat(cos): port amount-in-words helper from adm-v26"
```

---

### Task 4: Merge-field resolution

**Files:**
- Create: `src/lib/cos-merge-fields.ts`
- Modify: `supabase/tests/cos-contract-unit.test.mts`

**Interfaces:**
- Consumes: `formatAmountInWords` (Task 3), `formatCosEmployeeName` (existing, `src/lib/cos-constants.ts`).
- Produces:
  - `interface MergeContext` — the shape below
  - `COS_MERGE_FIELDS: readonly { token: string; label: string }[]` (drives the editor's insert menu in Task 6)
  - `resolveMergeFields(text: string, ctx: MergeContext): string`

- [ ] **Step 1: Write the failing test**

Append to `supabase/tests/cos-contract-unit.test.mts`:

```typescript
import {
  resolveMergeFields,
  type MergeContext,
} from "../../src/lib/cos-merge-fields.ts";

const CTX: MergeContext = {
  employee: {
    first_name: "Juan",
    middle_name: "Santos",
    last_name: "Dela Cruz",
    suffix: null,
    cos_no: "COS-2026001",
    address: "Bayugan City",
    departmentName: "City Mayor's Office",
  },
  contract: {
    position_title: "Accounting Aide",
    monthly_rate: 24000,
    period_start: "2026-01-01",
    period_end: "2026-06-30",
    scope_of_work: "Bookkeeping support",
    signatory_name: "Mayor Reyes",
    signatory_position: "City Mayor",
    witness_name: "Ana Cruz",
    witness_position: "HR Officer",
  },
  today: "2026-07-28",
};

test("resolveMergeFields substitutes identity tokens", () => {
  assert.equal(
    resolveMergeFields("This agreement with {{employee_name}}.", CTX),
    "This agreement with Dela Cruz, Juan Santos.",
  );
  assert.equal(resolveMergeFields("{{cos_no}}", CTX), "COS-2026001");
  assert.equal(resolveMergeFields("{{department}}", CTX), "City Mayor's Office");
});

test("resolveMergeFields formats dates and money", () => {
  assert.equal(resolveMergeFields("{{period_start}}", CTX), "January 1, 2026");
  assert.equal(resolveMergeFields("{{period_end}}", CTX), "June 30, 2026");
  assert.equal(resolveMergeFields("{{monthly_rate}}", CTX), "PHP 24,000.00");
  assert.equal(
    resolveMergeFields("{{monthly_rate_words}}", CTX),
    "TWENTY FOUR THOUSAND",
  );
  assert.equal(resolveMergeFields("{{today}}", CTX), "July 28, 2026");
});

test("resolveMergeFields replaces every occurrence, not just the first", () => {
  assert.equal(
    resolveMergeFields("{{cos_no}} and {{cos_no}}", CTX),
    "COS-2026001 and COS-2026001",
  );
});

test("a null value renders as empty, never as the raw token", () => {
  const ctx: MergeContext = {
    ...CTX,
    contract: { ...CTX.contract, monthly_rate: null, witness_name: null },
  };
  assert.equal(resolveMergeFields("[{{monthly_rate}}]", ctx), "[]");
  assert.equal(resolveMergeFields("[{{monthly_rate_words}}]", ctx), "[]");
  assert.equal(resolveMergeFields("[{{witness_name}}]", ctx), "[]");
});

test("an unknown token renders as empty, never as the raw token", () => {
  assert.equal(resolveMergeFields("[{{not_a_field}}]", CTX), "[]");
});

test("text with no tokens is returned unchanged", () => {
  assert.equal(resolveMergeFields("Plain clause text.", CTX), "Plain clause text.");
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test:cos`
Expected: FAIL — cannot find module `cos-merge-fields.ts`.

- [ ] **Step 3: Implement**

Create `src/lib/cos-merge-fields.ts`:

```typescript
// Merge-field resolution for printed COS contracts.
//
// Tokens live in the contract body as PLAIN TEXT and stay unresolved in the
// database, so an edited rate or corrected date appears on the next printout
// instead of leaving stale text frozen into the body.
//
// No DOM, no dependencies: supabase/tests/cos-contract-unit.test.mts imports
// this directly under `node --experimental-strip-types`.

import { formatAmountInWords } from "./cos-number-to-words.ts";
import { formatCosEmployeeName } from "./cos-constants.ts";

export interface MergeContext {
  employee: {
    first_name: string;
    middle_name: string | null;
    last_name: string;
    suffix: string | null;
    cos_no: string;
    address: string | null;
    departmentName: string | null;
  };
  contract: {
    position_title: string | null;
    monthly_rate: number | null;
    period_start: string;
    period_end: string;
    scope_of_work: string | null;
    signatory_name: string | null;
    signatory_position: string | null;
    witness_name: string | null;
    witness_position: string | null;
  };
  /** YYYY-MM-DD. Injected rather than read from the clock so tests are stable. */
  today: string;
}

/** Drives the editor's insert menu. Order is the order shown to the user. */
export const COS_MERGE_FIELDS = [
  { token: "employee_name", label: "Employee name" },
  { token: "employee_first_name", label: "First name" },
  { token: "employee_last_name", label: "Last name" },
  { token: "cos_no", label: "COS number" },
  { token: "position", label: "Position" },
  { token: "department", label: "Department" },
  { token: "address", label: "Address" },
  { token: "period_start", label: "Period start" },
  { token: "period_end", label: "Period end" },
  { token: "monthly_rate", label: "Monthly rate" },
  { token: "monthly_rate_words", label: "Monthly rate in words" },
  { token: "scope_of_work", label: "Scope of work" },
  { token: "signatory_name", label: "Signatory name" },
  { token: "signatory_position", label: "Signatory position" },
  { token: "witness_name", label: "Witness name" },
  { token: "witness_position", label: "Witness position" },
  { token: "today", label: "Today's date" },
] as const;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * "2026-01-01" -> "January 1, 2026". Parses the string's own parts rather than
 * constructing a Date, which would apply a timezone offset and can shift the
 * day — the bug class migration 035 exists to fix.
 */
function formatLongDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) return "";
  return `${monthName} ${Number(day)}, ${year}`;
}

function formatPhp(amount: number): string {
  return `PHP ${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function buildValues(ctx: MergeContext): Record<string, string> {
  const { employee: e, contract: c } = ctx;
  return {
    employee_name: formatCosEmployeeName(e),
    employee_first_name: e.first_name,
    employee_last_name: e.last_name,
    cos_no: e.cos_no,
    position: c.position_title ?? "",
    department: e.departmentName ?? "",
    address: e.address ?? "",
    period_start: formatLongDate(c.period_start),
    period_end: formatLongDate(c.period_end),
    monthly_rate: c.monthly_rate === null ? "" : formatPhp(c.monthly_rate),
    monthly_rate_words:
      c.monthly_rate === null ? "" : formatAmountInWords(c.monthly_rate),
    scope_of_work: c.scope_of_work ?? "",
    signatory_name: c.signatory_name ?? "",
    signatory_position: c.signatory_position ?? "",
    witness_name: c.witness_name ?? "",
    witness_position: c.witness_position ?? "",
    today: formatLongDate(ctx.today),
  };
}

const TOKEN_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/g;

/**
 * Replaces every {{token}} in `text`. An unknown token or a null value becomes
 * an empty string — a printed contract must never show raw {{...}} to a
 * signatory.
 */
export function resolveMergeFields(text: string, ctx: MergeContext): string {
  const values = buildValues(ctx);
  return text.replace(TOKEN_PATTERN, (_match, token: string) =>
    values[token] ?? "",
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:cos`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cos-merge-fields.ts supabase/tests/cos-contract-unit.test.mts
git commit -m "feat(cos): add contract merge-field resolution"
```

---

### Task 5: Tiptap JSON to react-pdf converter

**Files:**
- Create: `src/lib/cos-contract-doc.ts`
- Modify: `supabase/tests/cos-contract-unit.test.mts`

**Interfaces:**
- Consumes: `MergeContext`, `resolveMergeFields` (Task 4).
- Produces:
  - `interface TiptapNode { type: string; content?: TiptapNode[]; text?: string; marks?: { type: string }[]; attrs?: Record<string, unknown> }`
  - `interface ContractBlock { kind: "paragraph" | "listItem"; marker: string | null; runs: ContractRun[] }`
  - `interface ContractRun { text: string; bold: boolean; italic: boolean; underline: boolean }`
  - `EMPTY_CONTRACT_DOC: TiptapNode`
  - `contractDocToBlocks(doc: TiptapNode, ctx: MergeContext): ContractBlock[]`

The converter emits a **flat block list**, not react-pdf elements. Keeping it free of JSX is what lets the Node test runner import it without a React renderer; Task 9's PDF component maps blocks to `<Text>` / `<View>`.

- [ ] **Step 1: Write the failing test**

Append to `supabase/tests/cos-contract-unit.test.mts`:

```typescript
import {
  contractDocToBlocks,
  EMPTY_CONTRACT_DOC,
  type TiptapNode,
} from "../../src/lib/cos-contract-doc.ts";

test("a paragraph becomes one block with one plain run", () => {
  const doc: TiptapNode = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Hello." }] },
    ],
  };
  assert.deepEqual(contractDocToBlocks(doc, CTX), [
    {
      kind: "paragraph",
      marker: null,
      runs: [{ text: "Hello.", bold: false, italic: false, underline: false }],
    },
  ]);
});

test("marks become run flags", () => {
  const doc: TiptapNode = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Plain " },
          { type: "text", text: "bold", marks: [{ type: "bold" }] },
          { type: "text", text: "both", marks: [{ type: "italic" }, { type: "underline" }] },
        ],
      },
    ],
  };
  const [block] = contractDocToBlocks(doc, CTX);
  assert.deepEqual(block.runs, [
    { text: "Plain ", bold: false, italic: false, underline: false },
    { text: "bold", bold: true, italic: false, underline: false },
    { text: "both", bold: false, italic: true, underline: true },
  ]);
});

test("merge fields resolve inside runs", () => {
  const doc: TiptapNode = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Hired: {{employee_name}}" }],
      },
    ],
  };
  const [block] = contractDocToBlocks(doc, CTX);
  assert.equal(block.runs[0].text, "Hired: Dela Cruz, Juan Santos");
});

test("a bullet list yields one block per item with a bullet marker", () => {
  const doc: TiptapNode = {
    type: "doc",
    content: [
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "First" }] },
            ],
          },
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Second" }] },
            ],
          },
        ],
      },
    ],
  };
  const blocks = contractDocToBlocks(doc, CTX);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].kind, "listItem");
  assert.equal(blocks[0].marker, "•");
  assert.equal(blocks[1].marker, "•");
  assert.equal(blocks[1].runs[0].text, "Second");
});

test("an ordered list numbers its items from one", () => {
  const doc: TiptapNode = {
    type: "doc",
    content: [
      {
        type: "orderedList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "A" }] },
            ],
          },
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "B" }] },
            ],
          },
        ],
      },
    ],
  };
  const blocks = contractDocToBlocks(doc, CTX);
  assert.equal(blocks[0].marker, "1.");
  assert.equal(blocks[1].marker, "2.");
});

test("an unknown node type is dropped, not thrown on", () => {
  const doc: TiptapNode = {
    type: "doc",
    content: [
      { type: "horizontalRule" },
      { type: "paragraph", content: [{ type: "text", text: "Survives." }] },
    ],
  };
  const blocks = contractDocToBlocks(doc, CTX);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].runs[0].text, "Survives.");
});

test("the empty document yields no blocks", () => {
  assert.deepEqual(contractDocToBlocks(EMPTY_CONTRACT_DOC, CTX), []);
});

test("a malformed body yields no blocks instead of throwing", () => {
  assert.deepEqual(contractDocToBlocks({ type: "doc" }, CTX), []);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test:cos`
Expected: FAIL — cannot find module `cos-contract-doc.ts`.

- [ ] **Step 3: Implement**

Create `src/lib/cos-contract-doc.ts`:

```typescript
// Tiptap (ProseMirror) JSON -> flat printable blocks.
//
// Emits plain data, NOT react-pdf elements. That is deliberate: keeping this
// free of JSX lets supabase/tests/cos-contract-unit.test.mts import it under
// `node --experimental-strip-types` with no React renderer and no DOM.
// src/components/pdf/cos-contract-pdf.tsx maps the blocks to <Text>/<View>.
//
// The supported vocabulary is exactly what the editor's toolbar can author:
// paragraphs, bold/italic/underline, bulleted and numbered lists. Anything else
// is DROPPED rather than thrown on, so a document authored before a toolbar
// change still prints instead of failing at the worst possible moment.

import { resolveMergeFields, type MergeContext } from "./cos-merge-fields.ts";

export interface TiptapNode {
  type: string;
  content?: TiptapNode[];
  text?: string;
  marks?: { type: string }[];
  attrs?: Record<string, unknown>;
}

export interface ContractRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

export interface ContractBlock {
  kind: "paragraph" | "listItem";
  /** "•", "1.", … for list items; null for paragraphs. */
  marker: string | null;
  runs: ContractRun[];
}

/** What an empty body stores. The column is NOT NULL — never write SQL null. */
export const EMPTY_CONTRACT_DOC: TiptapNode = { type: "doc", content: [] };

const BULLET = "•";

function hasMark(node: TiptapNode, mark: string): boolean {
  return (node.marks ?? []).some((m) => m.type === mark);
}

/** Collects the text runs of one paragraph-like node, merge fields resolved. */
function toRuns(node: TiptapNode, ctx: MergeContext): ContractRun[] {
  const runs: ContractRun[] = [];
  for (const child of node.content ?? []) {
    if (child.type !== "text" || typeof child.text !== "string") continue;
    runs.push({
      text: resolveMergeFields(child.text, ctx),
      bold: hasMark(child, "bold"),
      italic: hasMark(child, "italic"),
      underline: hasMark(child, "underline"),
    });
  }
  return runs;
}

function listItemBlocks(
  list: TiptapNode,
  ordered: boolean,
  ctx: MergeContext,
): ContractBlock[] {
  const blocks: ContractBlock[] = [];
  let index = 0;
  for (const item of list.content ?? []) {
    if (item.type !== "listItem") continue;
    index += 1;
    // A listItem wraps one or more paragraphs; each becomes its own block, but
    // only the first carries the marker so a wrapped item is not re-numbered.
    let first = true;
    for (const child of item.content ?? []) {
      if (child.type !== "paragraph") continue;
      blocks.push({
        kind: "listItem",
        marker: first ? (ordered ? `${index}.` : BULLET) : null,
        runs: toRuns(child, ctx),
      });
      first = false;
    }
  }
  return blocks;
}

export function contractDocToBlocks(
  doc: TiptapNode,
  ctx: MergeContext,
): ContractBlock[] {
  const blocks: ContractBlock[] = [];
  for (const node of doc.content ?? []) {
    switch (node.type) {
      case "paragraph":
        blocks.push({
          kind: "paragraph",
          marker: null,
          runs: toRuns(node, ctx),
        });
        break;
      case "bulletList":
        blocks.push(...listItemBlocks(node, false, ctx));
        break;
      case "orderedList":
        blocks.push(...listItemBlocks(node, true, ctx));
        break;
      default:
        // Dropped on purpose — see the file header.
        break;
    }
  }
  return blocks;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:cos`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cos-contract-doc.ts supabase/tests/cos-contract-unit.test.mts
git commit -m "feat(cos): convert contract body JSON to printable blocks"
```

---

### Task 6: Validation schemas, permission helper, and the editor

**Files:**
- Create: `src/lib/validations/cos-contract-schema.ts`
- Modify: `src/lib/auth-helpers.ts`
- Create: `src/components/cos/cos-rich-text-editor.tsx`
- Modify: `package.json` (Tiptap dependencies)

**Interfaces:**
- Consumes: `COS_CONTRACT_STATUSES` (Task 2), `EMPTY_CONTRACT_DOC` (Task 5), `COS_MERGE_FIELDS` (Task 4).
- Produces:
  - `cosContractFormSchema` / `CosContractFormValues`
  - `cosContractTemplateFormSchema` / `CosContractTemplateFormValues`
  - `cosContractTerminationSchema` / `CosContractTerminationValues`
  - `canManageCosTemplates(role)`
  - `<CosRichTextEditor value onChange />`

- [ ] **Step 1: Install Tiptap**

Run:

```bash
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-underline
```

Expected: four packages added to `dependencies`.

- [ ] **Step 2: Add the permission helper**

Append to `src/lib/auth-helpers.ts`:

```typescript
// Roles that may create and edit contract TEMPLATES — the reusable legal
// boilerplate. Narrower than canManageCos on purpose: COS-1's requested
// permission list separated "Manage Templates" / "Edit Templates" from "Create
// Contracts", so a cos_manager USES templates when drafting a contract but
// cannot rewrite the boilerplate. Mirrors canManageSalaryGrades, where
// hr_record_manager reaches the page but cannot edit the table.
const COS_TEMPLATE_EDITOR_ROLES: readonly UserRole[] = [
  "super_admin",
  "hr_admin",
] as const;

export function canManageCosTemplates(
  role: UserRole | null | undefined,
): boolean {
  return !!role && COS_TEMPLATE_EDITOR_ROLES.includes(role);
}
```

- [ ] **Step 3: Write the validation schemas**

Create `src/lib/validations/cos-contract-schema.ts`:

```typescript
import { z } from "zod";

// No import from cos-constants here: `status` is NOT a form field. It is set
// only by terminateCosContract, never typed by a user, so importing
// COS_CONTRACT_STATUSES would be an unused import and a lint error.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const optionalText = z
  .string()
  .transform((v) => (v.trim() === "" ? null : v.trim()))
  .nullable()
  .optional();

const requiredIsoDate = z
  .string()
  .regex(ISO_DATE, "Use a valid date (YYYY-MM-DD)");

const optionalRate = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "string" && v.trim() === "" ? null : Number(v)))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0), {
    message: "Enter a valid monthly rate",
  })
  .nullable()
  .optional();

// The Tiptap document. Validated as a shape, not a schema: the editor is the
// only author, and rejecting an unrecognised node here would make a body
// unsavable that contractDocToBlocks would happily drop at print time.
const tiptapDoc = z
  .object({ type: z.literal("doc") })
  .passthrough();

export const cosContractFormSchema = z
  .object({
    cos_employee_id: z.string().uuid("Select a COS employee"),
    period_start: requiredIsoDate,
    period_end: requiredIsoDate,
    monthly_rate: optionalRate,
    position_title: optionalText,
    scope_of_work: optionalText,
    signatory_name: optionalText,
    signatory_position: optionalText,
    witness_name: optionalText,
    witness_position: optionalText,
    template_id: z
      .string()
      .uuid()
      .nullable()
      .optional()
      .or(z.literal("").transform(() => null)),
    body: tiptapDoc,
  })
  // Mirrors the cos_contracts_period_order CHECK so the user sees a field
  // error instead of a Postgres message.
  .refine((v) => v.period_end >= v.period_start, {
    message: "End date must be on or after the start date",
    path: ["period_end"],
  });

export type CosContractFormValues = z.infer<typeof cosContractFormSchema>;

export const cosContractTemplateFormSchema = z.object({
  name: z.string().trim().min(1, "Template name is required"),
  description: optionalText,
  is_active: z.boolean().default(true),
  body: tiptapDoc,
});

export type CosContractTemplateFormValues = z.infer<
  typeof cosContractTemplateFormSchema
>;

export const cosContractTerminationSchema = z.object({
  terminated_on: requiredIsoDate,
  termination_reason: z.string().trim().min(1, "A reason is required"),
});

export type CosContractTerminationValues = z.infer<
  typeof cosContractTerminationSchema
>;
```

- [ ] **Step 4: Build the editor**

Create `src/components/cos/cos-rich-text-editor.tsx`:

```typescript
"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { Bold, Italic, List, ListOrdered, Underline as UnderlineIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COS_MERGE_FIELDS } from "@/lib/cos-merge-fields";
import type { TiptapNode } from "@/lib/cos-contract-doc";
import { cn } from "@/lib/utils";

interface CosRichTextEditorProps {
  value: TiptapNode;
  onChange: (doc: TiptapNode) => void;
}

/**
 * The toolbar exposes EXACTLY the constructs src/lib/cos-contract-doc.ts can
 * print: paragraphs, bold/italic/underline, bulleted and numbered lists.
 * Do not add headings, tables or alignment without extending that converter —
 * anything it does not recognise is silently dropped from the PDF.
 */
export function CosRichTextEditor({ value, onChange }: CosRichTextEditorProps) {
  const editor = useEditor({
    // Next 16 renders this component on the server first; Tiptap must not try
    // to hydrate its own DOM before the client takes over.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Underline,
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getJSON() as TiptapNode),
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[320px] p-3 focus:outline-none",
      },
    },
  });

  if (!editor) return null;

  const insertToken = (token: string) => {
    editor.chain().focus().insertContent(`{{${token}}}`).run();
  };

  return (
    <div className="rounded-md border">
      <div className="flex flex-wrap items-center gap-1 border-b p-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Bold"
          aria-pressed={editor.isActive("bold")}
          className={cn(editor.isActive("bold") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Italic"
          aria-pressed={editor.isActive("italic")}
          className={cn(editor.isActive("italic") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Underline"
          aria-pressed={editor.isActive("underline")}
          className={cn(editor.isActive("underline") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Bulleted list"
          aria-pressed={editor.isActive("bulletList")}
          className={cn(editor.isActive("bulletList") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Numbered list"
          aria-pressed={editor.isActive("orderedList")}
          className={cn(editor.isActive("orderedList") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" />
        </Button>

        <div className="ml-auto w-56">
          <Select onValueChange={insertToken}>
            <SelectTrigger size="sm">
              <SelectValue placeholder="Insert merge field" />
            </SelectTrigger>
            <SelectContent>
              {COS_MERGE_FIELDS.map((f) => (
                <SelectItem key={f.token} value={f.token}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
```

- [ ] **Step 5: Verify it compiles**

Run: `npm run lint && npm run build`
Expected: `✓ Compiled successfully`, and still exactly 4 lint errors — the pre-existing ones listed in Global Constraints.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/auth-helpers.ts \
        src/lib/validations/cos-contract-schema.ts \
        src/components/cos/cos-rich-text-editor.tsx
git commit -m "feat(cos): add contract schemas, template permission, rich-text editor"
```

---

### Task 7: Template server actions and UI

**Files:**
- Create: `src/lib/actions/cos-contract-template-actions.ts`
- Create: `src/components/cos/cos-template-form.tsx`
- Create: `src/components/tables/columns/cos-template-columns.tsx`
- Create: `src/components/cos/cos-template-list-client.tsx`
- Create: `src/app/(dashboard)/cos/templates/page.tsx`
- Create: `src/app/(dashboard)/cos/templates/new/page.tsx`
- Create: `src/app/(dashboard)/cos/templates/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `canManageCos`, `canManageCosTemplates` (Task 6), `cosContractTemplateFormSchema` (Task 6), `EMPTY_CONTRACT_DOC` (Task 5).
- Produces:
  - `interface CosContractTemplate { id, name, description, body, is_active, created_at, updated_at, created_by, updated_by, deleted_at }`
  - `getCosContractTemplates(): Promise<CosContractTemplate[]>`
  - `getCosContractTemplate(id): Promise<CosContractTemplate | null>`
  - `createCosContractTemplate(input)`, `updateCosContractTemplate(id, input)`, `deleteCosContractTemplate(id)`

- [ ] **Step 1: Write the actions**

Create `src/lib/actions/cos-contract-template-actions.ts`. Model it on `src/lib/actions/cos-employee-actions.ts` — same `baseQuery()` discipline, same `{ error, field }` return shape.

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageCos, canManageCosTemplates } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import {
  cosContractTemplateFormSchema,
  type CosContractTemplateFormValues,
} from "@/lib/validations/cos-contract-schema";
import type { TiptapNode } from "@/lib/cos-contract-doc";

const UNIQUE_VIOLATION = "23505";

export interface CosContractTemplate {
  id: string;
  name: string;
  description: string | null;
  body: TiptapNode;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
}

/**
 * The ONLY place `cos_contract_templates` is read from. Applies the schema and
 * the soft-delete filter together so neither can be forgotten at a call site.
 */
function baseQuery() {
  return createAdminClient()
    .schema("hris")
    .from("cos_contract_templates")
    .select("*")
    .is("deleted_at", null);
}

/** Reads use canManageCos so contract authors can populate the picker. */
export async function getCosContractTemplates(): Promise<CosContractTemplate[]> {
  const user = await getCurrentUser();
  if (!user || !canManageCos(user.role)) return [];

  const { data, error } = await baseQuery().order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as CosContractTemplate[];
}

export async function getCosContractTemplate(
  id: string,
): Promise<CosContractTemplate | null> {
  const user = await getCurrentUser();
  if (!user || !canManageCos(user.role)) return null;

  const { data, error } = await baseQuery().eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as unknown as CosContractTemplate) ?? null;
}

export async function createCosContractTemplate(
  input: CosContractTemplateFormValues,
) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!canManageCosTemplates(user.role))
    return { error: "Insufficient permissions" };

  const parsed = cosContractTemplateFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { data, error } = await createAdminClient()
    .schema("hris")
    .from("cos_contract_templates")
    .insert({
      ...parsed.data,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return {
        error: `A template named "${parsed.data.name}" already exists`,
        field: "name" as const,
      };
    }
    return { error: error.message };
  }

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "cos_contract_template_created",
    tableName: "cos_contract_templates",
    recordId: data.id,
    newValues: { ...parsed.data },
  });

  revalidatePath("/cos/templates");
  return { data: data as unknown as CosContractTemplate };
}

export async function updateCosContractTemplate(
  id: string,
  input: CosContractTemplateFormValues,
) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!canManageCosTemplates(user.role))
    return { error: "Insufficient permissions" };

  const parsed = cosContractTemplateFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const before = await getCosContractTemplate(id);
  if (!before) return { error: "Template not found" };

  const { data, error } = await createAdminClient()
    .schema("hris")
    .from("cos_contract_templates")
    .update({ ...parsed.data, updated_by: user.id })
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return {
        error: `A template named "${parsed.data.name}" already exists`,
        field: "name" as const,
      };
    }
    return { error: error.message };
  }

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "cos_contract_template_updated",
    tableName: "cos_contract_templates",
    recordId: id,
    oldValues: { ...before },
    newValues: { ...parsed.data },
  });

  revalidatePath("/cos/templates");
  revalidatePath(`/cos/templates/${id}/edit`);
  return { data: data as unknown as CosContractTemplate };
}

/**
 * Soft delete. Contracts hold their own body snapshot and only a nullable
 * template_id, so retiring a template never touches contract history.
 */
export async function deleteCosContractTemplate(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "super_admin") return { error: "Insufficient permissions" };

  const before = await getCosContractTemplate(id);
  if (!before) return { error: "Template not found" };

  const { error } = await createAdminClient()
    .schema("hris")
    .from("cos_contract_templates")
    .update({ deleted_at: new Date().toISOString(), updated_by: user.id })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "cos_contract_template_deleted",
    tableName: "cos_contract_templates",
    recordId: id,
    oldValues: { ...before },
  });

  revalidatePath("/cos/templates");
  return { success: true as const };
}
```

- [ ] **Step 2: Build the template form**

Create `src/components/cos/cos-template-form.tsx`, modelled on `src/components/cos/cos-employee-form.tsx` (read it for the `useForm` + `setValue` + toast + router pattern). It renders: `name` (Input), `description` (Textarea), `is_active` (Switch), and `<CosRichTextEditor>` bound to `body` via `setValue("body", doc, { shouldValidate: true })`. On submit it calls `createCosContractTemplate` or `updateCosContractTemplate`, maps a returned `field === "name"` to `setError("name", ...)`, toasts on failure, and `router.push("/cos/templates")` on success.

Default `body` for a new template is `EMPTY_CONTRACT_DOC` from `@/lib/cos-contract-doc`.

- [ ] **Step 3: Build the list column defs**

Create `src/components/tables/columns/cos-template-columns.tsx`, modelled on `cos-employee-columns.tsx`: a `name` column linking to `/cos/templates/${id}/edit`, a `description` column falling back to `"—"`, an `is_active` `Badge` column (`Active` / `Inactive`) with a `filterFn` comparing against the accessor value, and an actions cell offering Edit plus Delete when `canDelete`.

- [ ] **Step 4: Build the list client and the three pages**

`src/components/cos/cos-template-list-client.tsx` composes `<DataTable>` exactly as `cos-employee-list-client.tsx` does — searchable on `name`, filterable on status, with a "New Template" toolbar button when `canCreate`.

Each page is a server component opening with:

```typescript
const user = await getCurrentUser();
if (!user) redirect("/login");
if (!canManageCosTemplates(user.role)) redirect("/dashboard");
```

The list page (`/cos/templates`) additionally passes `canCreate={canManageCosTemplates(user.role)}` and `canDelete={user.role === "super_admin"}`. The `[id]/edit` page awaits `params` before destructuring and calls `notFound()` when `getCosContractTemplate` returns null.

- [ ] **Step 5: Verify**

Run: `npm run lint && npm run build`
Expected: compiles; `/cos/templates`, `/cos/templates/new` and `/cos/templates/[id]/edit` appear in the route list; still exactly 4 pre-existing lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/cos-contract-template-actions.ts \
        src/components/cos/cos-template-form.tsx \
        src/components/cos/cos-template-list-client.tsx \
        src/components/tables/columns/cos-template-columns.tsx \
        "src/app/(dashboard)/cos/templates"
git commit -m "feat(cos): add contract templates CRUD"
```

---

### Task 8: Contract server actions

**Files:**
- Create: `src/lib/actions/cos-contract-actions.ts`

**Interfaces:**
- Consumes: `cosContractFormSchema`, `cosContractTerminationSchema` (Task 6), `getCosContractTemplate` (Task 7), `deriveCosContractStatus`, `toIsoDateString` (Task 2).
- Produces:
  - `interface CosContractWithEmployee` — every contract column plus `cos_employees: { id, cos_no, first_name, middle_name, last_name, suffix, address, departments: { name } | null } | null`
  - `getCosContracts()`, `getCosContract(id)`, `getContractsForEmployee(employeeId)`
  - `createCosContract(input)`, `updateCosContract(id, input)`, `renewCosContract(id, input)`, `terminateCosContract(id, input)`, `deleteCosContract(id)`

- [ ] **Step 1: Write the actions**

Create `src/lib/actions/cos-contract-actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageCos } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import {
  cosContractFormSchema,
  cosContractTerminationSchema,
  type CosContractFormValues,
  type CosContractTerminationValues,
} from "@/lib/validations/cos-contract-schema";
import type { TiptapNode } from "@/lib/cos-contract-doc";
import type { CosContractStatus } from "@/lib/cos-constants";

const UNIQUE_VIOLATION = "23505";
const EXCLUSION_VIOLATION = "23P01";
const CHECK_VIOLATION = "23514";

const SELECT_WITH_EMPLOYEE =
  "*, cos_employees(id, cos_no, first_name, middle_name, last_name, suffix, address, status, departments(name))";

export interface CosContractWithEmployee {
  id: string;
  cos_employee_id: string;
  period_start: string;
  period_end: string;
  monthly_rate: number | null;
  position_title: string | null;
  scope_of_work: string | null;
  signatory_name: string | null;
  signatory_position: string | null;
  witness_name: string | null;
  witness_position: string | null;
  body: TiptapNode;
  template_id: string | null;
  renewed_from_id: string | null;
  status: CosContractStatus;
  terminated_on: string | null;
  termination_reason: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  cos_employees: {
    id: string;
    cos_no: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    suffix: string | null;
    address: string | null;
    status: string;
    departments: { name: string } | null;
  } | null;
}

/**
 * The ONLY place `cos_contracts` is read from. Applies the schema and the
 * soft-delete filter together so neither can be forgotten at a call site.
 */
function baseQuery() {
  return createAdminClient()
    .schema("hris")
    .from("cos_contracts")
    .select(SELECT_WITH_EMPLOYEE)
    .is("deleted_at", null);
}

async function requireCosManager() {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" as const };
  if (!canManageCos(user.role)) return { error: "Insufficient permissions" as const };
  return { user };
}

/**
 * Maps the constraints in migration 063 to field errors. A signatory must never
 * see a raw Postgres message.
 */
function mapDbError(code: string | undefined, message: string) {
  if (code === EXCLUSION_VIOLATION) {
    return {
      error: "This employee already has a contract covering these dates",
      field: "period_start" as const,
    };
  }
  if (code === UNIQUE_VIOLATION) {
    return {
      error: "That contract has already been renewed",
      field: "period_start" as const,
    };
  }
  if (code === CHECK_VIOLATION) {
    return { error: "The dates on this contract are inconsistent" };
  }
  return { error: message };
}

/**
 * Returns every live contract. Filtering is deliberately NOT a parameter here:
 * `<DataTable>` filters client-side across this module (see
 * cos-employee-list-client.tsx), and a server-side filter that the table then
 * re-applied would be two sources of truth for one question.
 */
export async function getCosContracts(): Promise<CosContractWithEmployee[]> {
  const auth = await requireCosManager();
  if ("error" in auth) return [];

  const { data, error } = await baseQuery().order("period_start", {
    ascending: false,
  });
  if (error) throw error;
  return (data ?? []) as unknown as CosContractWithEmployee[];
}

export async function getCosContract(
  id: string,
): Promise<CosContractWithEmployee | null> {
  const auth = await requireCosManager();
  if ("error" in auth) return null;

  const { data, error } = await baseQuery().eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as unknown as CosContractWithEmployee) ?? null;
}

/** Oldest-first: the profile timeline renders the renewal chain in order. */
export async function getContractsForEmployee(
  employeeId: string,
): Promise<CosContractWithEmployee[]> {
  const auth = await requireCosManager();
  if ("error" in auth) return [];

  const { data, error } = await baseQuery()
    .eq("cos_employee_id", employeeId)
    .order("period_start", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as CosContractWithEmployee[];
}

/** COS-1's rule: an inactive employee cannot receive a new contract. */
async function assertEmployeeActive(employeeId: string) {
  const { data } = await createAdminClient()
    .schema("hris")
    .from("cos_employees")
    .select("status")
    .eq("id", employeeId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!data) return { error: "COS employee not found" };
  if (data.status !== "active") {
    return { error: "An inactive employee cannot receive a new contract" };
  }
  return null;
}

export async function createCosContract(input: CosContractFormValues) {
  const auth = await requireCosManager();
  if ("error" in auth) return auth;

  const parsed = cosContractFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const inactive = await assertEmployeeActive(parsed.data.cos_employee_id);
  if (inactive) return inactive;

  const { data, error } = await createAdminClient()
    .schema("hris")
    .from("cos_contracts")
    .insert({
      ...parsed.data,
      created_by: auth.user.id,
      updated_by: auth.user.id,
    })
    .select(SELECT_WITH_EMPLOYEE)
    .single();

  if (error) return mapDbError(error.code, error.message);

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "cos_contract_created",
    tableName: "cos_contracts",
    recordId: data.id,
    newValues: { ...parsed.data },
  });

  revalidatePath("/cos/contracts");
  revalidatePath(`/cos/employees/${parsed.data.cos_employee_id}`);
  return { data: data as unknown as CosContractWithEmployee };
}

export async function updateCosContract(
  id: string,
  input: CosContractFormValues,
) {
  const auth = await requireCosManager();
  if ("error" in auth) return auth;

  const parsed = cosContractFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const before = await getCosContract(id);
  if (!before) return { error: "Contract not found" };

  // The employee is fixed at creation: moving a contract between people would
  // silently rewrite two employees' histories at once.
  const { cos_employee_id: _ignored, ...editable } = parsed.data;

  const { data, error } = await createAdminClient()
    .schema("hris")
    .from("cos_contracts")
    .update({ ...editable, updated_by: auth.user.id })
    .eq("id", id)
    .is("deleted_at", null)
    .select(SELECT_WITH_EMPLOYEE)
    .single();

  if (error) return mapDbError(error.code, error.message);

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "cos_contract_updated",
    tableName: "cos_contracts",
    recordId: id,
    oldValues: { ...before },
    newValues: { ...editable },
  });

  revalidatePath("/cos/contracts");
  revalidatePath(`/cos/contracts/${id}`);
  revalidatePath(`/cos/employees/${before.cos_employee_id}`);
  return { data: data as unknown as CosContractWithEmployee };
}

export async function renewCosContract(
  sourceId: string,
  input: CosContractFormValues,
) {
  const auth = await requireCosManager();
  if ("error" in auth) return auth;

  const parsed = cosContractFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const source = await getCosContract(sourceId);
  if (!source) return { error: "Contract to renew not found" };

  const inactive = await assertEmployeeActive(source.cos_employee_id);
  if (inactive) return inactive;

  // "Effective end" is COALESCE(terminated_on, period_end) — the same
  // expression the exclusion constraint uses, so this friendly check and the
  // database can never disagree.
  const effectiveEnd = source.terminated_on ?? source.period_end;
  if (parsed.data.period_start <= effectiveEnd) {
    return {
      error: `A renewal must start after ${effectiveEnd}`,
      field: "period_start" as const,
    };
  }

  const { data, error } = await createAdminClient()
    .schema("hris")
    .from("cos_contracts")
    .insert({
      ...parsed.data,
      cos_employee_id: source.cos_employee_id,
      renewed_from_id: sourceId,
      created_by: auth.user.id,
      updated_by: auth.user.id,
    })
    .select(SELECT_WITH_EMPLOYEE)
    .single();

  if (error) return mapDbError(error.code, error.message);

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "cos_contract_renewed",
    tableName: "cos_contracts",
    recordId: data.id,
    oldValues: { renewed_from_id: sourceId },
    newValues: { ...parsed.data },
  });

  revalidatePath("/cos/contracts");
  revalidatePath(`/cos/employees/${source.cos_employee_id}`);
  return { data: data as unknown as CosContractWithEmployee };
}

export async function terminateCosContract(
  id: string,
  input: CosContractTerminationValues,
) {
  const auth = await requireCosManager();
  if ("error" in auth) return auth;

  const parsed = cosContractTerminationSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const before = await getCosContract(id);
  if (!before) return { error: "Contract not found" };
  if (before.status === "terminated") {
    return { error: "This contract is already terminated" };
  }

  const { terminated_on } = parsed.data;
  if (terminated_on < before.period_start || terminated_on > before.period_end) {
    return {
      error: "The termination date must fall inside the contract period",
      field: "terminated_on" as const,
    };
  }

  const { data, error } = await createAdminClient()
    .schema("hris")
    .from("cos_contracts")
    .update({
      status: "terminated",
      terminated_on,
      termination_reason: parsed.data.termination_reason,
      updated_by: auth.user.id,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select(SELECT_WITH_EMPLOYEE)
    .single();

  if (error) return mapDbError(error.code, error.message);

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "cos_contract_terminated",
    tableName: "cos_contracts",
    recordId: id,
    oldValues: { status: before.status },
    newValues: { ...parsed.data },
  });

  revalidatePath("/cos/contracts");
  revalidatePath(`/cos/contracts/${id}`);
  revalidatePath(`/cos/employees/${before.cos_employee_id}`);
  return { data: data as unknown as CosContractWithEmployee };
}

export async function deleteCosContract(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "super_admin") return { error: "Insufficient permissions" };

  const before = await getCosContract(id);
  if (!before) return { error: "Contract not found" };

  const { error } = await createAdminClient()
    .schema("hris")
    .from("cos_contracts")
    .update({ deleted_at: new Date().toISOString(), updated_by: user.id })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "cos_contract_deleted",
    tableName: "cos_contracts",
    recordId: id,
    oldValues: { ...before },
  });

  revalidatePath("/cos/contracts");
  revalidatePath(`/cos/employees/${before.cos_employee_id}`);
  return { success: true as const };
}
```

- [ ] **Step 2: Verify**

Run: `npm run lint && npm run build`
Expected: compiles; still exactly 4 pre-existing lint errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/cos-contract-actions.ts
git commit -m "feat(cos): add contract server actions with renewal and termination"
```

---

### Task 9: Contract UI and printing

**Files:**
- Create: `src/components/cos/cos-contract-form.tsx`
- Create: `src/components/tables/columns/cos-contract-columns.tsx`
- Create: `src/components/cos/cos-contract-list-client.tsx`
- Create: `src/components/pdf/cos-contract-pdf.tsx`
- Create: `src/components/cos/cos-contract-pdf-button.tsx`
- Create: `src/app/(dashboard)/cos/contracts/page.tsx`
- Create: `src/app/(dashboard)/cos/contracts/loading.tsx`
- Create: `src/app/(dashboard)/cos/contracts/new/page.tsx`
- Create: `src/app/(dashboard)/cos/contracts/[id]/page.tsx`
- Create: `src/app/(dashboard)/cos/contracts/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: everything from Tasks 2–8.
- Produces: `<CosContractPdfButton contract={CosContractWithEmployee} />`

- [ ] **Step 1: Build the PDF document**

Create `src/components/pdf/cos-contract-pdf.tsx`, modelled on `src/components/pdf/nosa-pdf.tsx` (read it for the `StyleSheet.create` conventions):

```typescript
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import {
  contractDocToBlocks,
  type ContractBlock,
  type TiptapNode,
} from "@/lib/cos-contract-doc";
import type { MergeContext } from "@/lib/cos-merge-fields";

const styles = StyleSheet.create({
  page: { padding: 56, fontSize: 11, fontFamily: "Times-Roman", lineHeight: 1.5 },
  title: { fontSize: 14, fontFamily: "Times-Bold", textAlign: "center", marginBottom: 24 },
  paragraph: { marginBottom: 10, textAlign: "justify" },
  listRow: { flexDirection: "row", marginBottom: 6, paddingLeft: 18 },
  listMarker: { width: 22 },
  listBody: { flex: 1, textAlign: "justify" },
  signatureSection: { marginTop: 56, flexDirection: "row", justifyContent: "space-between" },
  signatureBlock: { width: "45%", textAlign: "center" },
  signatureLine: { borderTop: "1pt solid #000", marginTop: 40, paddingTop: 4 },
  signatureRole: { fontSize: 9, color: "#444" },
});

/** One block's runs, each carrying its own bold/italic/underline flags. */
function Runs({ block }: { block: ContractBlock }) {
  return (
    <>
      {block.runs.map((run, i) => (
        <Text
          key={i}
          style={{
            fontFamily: run.bold ? "Times-Bold" : "Times-Roman",
            fontStyle: run.italic ? "italic" : "normal",
            textDecoration: run.underline ? "underline" : "none",
          }}
        >
          {run.text}
        </Text>
      ))}
    </>
  );
}

interface CosContractPdfProps {
  body: TiptapNode;
  mergeContext: MergeContext;
  employeeName: string;
}

export function CosContractPdf({
  body,
  mergeContext,
  employeeName,
}: CosContractPdfProps) {
  const blocks = contractDocToBlocks(body, mergeContext);
  const { signatory_name, signatory_position, witness_name, witness_position } =
    mergeContext.contract;

  return (
    <Document title={`Contract of Service — ${employeeName}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>CONTRACT OF SERVICE</Text>

        {blocks.map((block, i) =>
          block.kind === "paragraph" ? (
            <Text key={i} style={styles.paragraph}>
              <Runs block={block} />
            </Text>
          ) : (
            <View key={i} style={styles.listRow}>
              <Text style={styles.listMarker}>{block.marker ?? ""}</Text>
              <Text style={styles.listBody}>
                <Runs block={block} />
              </Text>
            </View>
          ),
        )}

        <View style={styles.signatureSection}>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLine}>{employeeName}</Text>
            <Text style={styles.signatureRole}>Service Provider</Text>
          </View>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLine}>{signatory_name ?? ""}</Text>
            <Text style={styles.signatureRole}>{signatory_position ?? ""}</Text>
          </View>
        </View>

        {witness_name ? (
          <View style={styles.signatureSection}>
            <View style={styles.signatureBlock}>
              <Text style={styles.signatureLine}>{witness_name}</Text>
              <Text style={styles.signatureRole}>
                {witness_position ?? "Witness"}
              </Text>
            </View>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
```

- [ ] **Step 2: Build the print button**

Create `src/components/cos/cos-contract-pdf-button.tsx`, modelled on `src/components/nosa/nosa-pdf-button.tsx`. It is a `"use client"` component that builds the `MergeContext` from the contract and its joined employee, calls `await pdf(<CosContractPdf … />).toBlob()`, then opens the blob via `URL.createObjectURL`. `today` comes from `toIsoDateString(new Date())`.

- [ ] **Step 3: Build the contract form**

Create `src/components/cos/cos-contract-form.tsx`, modelled on `cos-employee-form.tsx`. Three `Card` sections — Employee & Period, Terms, Signatories — plus the editor for Contract Body.

Behaviours the form must have:
- The employee `Select` lists only `status === "active"` employees and is **disabled** in `edit` and `renew` modes.
- Choosing a template calls `getCosContractTemplate(id)` and loads its `body` into the editor. If the editor already holds a non-empty document, confirm via `AlertDialog` before replacing it.
- `position_title` and `monthly_rate` prefill from the selected employee, and stay editable.
- A `mode` prop of `"create" | "edit" | "renew"` picks the action: `createCosContract`, `updateCosContract(id, …)`, or `renewCosContract(sourceId, …)`.
- A returned `field` maps to `setError(field, { message })`; every failure also toasts.

**Query-parameter contract for `/cos/contracts/new`** — the page reads these and passes the resulting defaults into the form. Both are optional; the plain `/cos/contracts/new` route prefills nothing.

| Param | Effect |
|---|---|
| `?employee=<uuid>` | Preselects that employee. Used by the profile page's "New Contract" button. |
| `?duplicate=<contractId>` | Loads that contract and prefills **rate, position, scope, signatories and body** — but not the period, which must be re-entered or the exclusion constraint will reject it. `renewed_from_id` is left null: a duplicate is a fresh contract, not a renewal. |
| `?renew=<contractId>` | Renders the form in `"renew"` mode, submitting to `renewCosContract`. Prefills everything a duplicate does, plus the employee. |

`duplicate` and `renew` are mutually exclusive; if both are present, `renew` wins.

- [ ] **Step 4: Build the list, columns and pages**

`cos-contract-columns.tsx` mirrors `cos-employee-columns.tsx`: employee name (linking to `/cos/contracts/${id}`), period (`MMM d, yyyy – MMM d, yyyy`), monthly rate (`tabular-nums` PHP), a status `Badge` driven by `deriveCosContractStatus`, and an actions cell.

The status column's `accessorFn` must return the **derived** status so the faceted filter and the badge agree:

```typescript
{
  id: "status",
  accessorFn: (row) => deriveCosContractStatus(row),
  header: ({ column }) => (
    <DataTableColumnHeader column={column} title="Status" />
  ),
  cell: ({ row }) => {
    const derived = deriveCosContractStatus(row.original);
    return (
      <Badge variant={COS_CONTRACT_STATUS_VARIANT[derived]}>
        {COS_CONTRACT_STATUS_LABELS[derived]}
      </Badge>
    );
  },
  filterFn: (row, id, value: string[]) =>
    value.includes(row.getValue(id) as string),
}
```

The five pages follow the COS-1 guard opening (`getCurrentUser` → `canManageCos` → `redirect`). The detail page shows the terms, the resolved status badge, the print button, and Renew / Terminate / Edit actions; Renew is hidden when the contract is terminated or already has a successor.

- [ ] **Step 5: Verify**

Run: `npm run lint && npm run build`
Expected: compiles; the five `/cos/contracts` routes appear; still exactly 4 pre-existing lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/cos src/components/pdf/cos-contract-pdf.tsx \
        src/components/tables/columns/cos-contract-columns.tsx \
        "src/app/(dashboard)/cos/contracts"
git commit -m "feat(cos): add contract UI and PDF printing"
```

---

### Task 10: Profile timeline and sidebar

**Files:**
- Create: `src/components/cos/cos-contract-timeline.tsx`
- Modify: `src/app/(dashboard)/cos/employees/[id]/page.tsx:147-158`
- Modify: `src/components/layout/app-sidebar.tsx`

**Interfaces:**
- Consumes: `getContractsForEmployee` (Task 8), `deriveCosContractStatus` (Task 2).
- Produces: nothing downstream — this is the last task.

- [ ] **Step 1: Build the timeline**

Create `src/components/cos/cos-contract-timeline.tsx`. It takes `contracts: CosContractWithEmployee[]` (oldest-first) and `employeeIsActive: boolean`.

Ordering: build a map from `renewed_from_id` to successor, start from each contract with no `renewed_from_id`, and walk the chain. Contracts are rendered chain by chain, successors indented one step under their predecessor. Any contract not reachable from a root — which the `UNIQUE (renewed_from_id)` constraint should make impossible — is appended at the end rather than dropped, so a data anomaly is visible instead of silent.

Each row shows period, monthly rate, the derived status badge, and View / Print / Renew / Duplicate links. Renew is omitted when the contract is terminated or already has a successor.

The empty state keeps COS-1's copy so an employee with no contracts reads the same as before:

```typescript
<p className="text-sm text-muted-foreground">
  No contracts recorded for this employee yet.
</p>
```

- [ ] **Step 2: Replace the placeholder**

In `src/app/(dashboard)/cos/employees/[id]/page.tsx`, fetch the contracts alongside the employee and replace the placeholder card body. The heading and the card's position on the page do not move — COS-1 fixed them so this is a drop-in.

Replace lines 147-158:

```typescript
      {/* COS-3 replaces this card's body with the contract timeline. The
          heading and its position on the page are fixed here so that lands as
          a drop-in. */}
      <Card>
        <CardHeader>
          <CardTitle>Contract History</CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Contract management arrives with the Contracts module.
          </p>
        </CardContent>
      </Card>
```

with:

```typescript
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Contract History</CardTitle>
          {employee.status === "active" ? (
            <Link href={`/cos/contracts/new?employee=${employee.id}`}>
              <Button size="sm">
                <Plus className="h-4 w-4" />
                New Contract
              </Button>
            </Link>
          ) : (
            // COS-1's rule, surfaced rather than hidden: an inactive employee
            // cannot receive a new contract.
            <Button size="sm" disabled title="Inactive employees cannot receive new contracts">
              <Plus className="h-4 w-4" />
              New Contract
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <CosContractTimeline
            contracts={contracts}
            employeeIsActive={employee.status === "active"}
          />
        </CardContent>
      </Card>
```

Add the imports (`Plus` from `lucide-react`, `CosContractTimeline`, `getContractsForEmployee`) and fetch the contracts next to the existing `getCosEmployee(id)` call:

```typescript
  const [employee, contracts] = await Promise.all([
    getCosEmployee(id),
    getContractsForEmployee(id),
  ]);
  if (!employee) notFound();
```

- [ ] **Step 3: Add the sidebar items**

In `src/components/layout/app-sidebar.tsx`, add a `cosTemplateRoles` list next to the existing `cosRoles` (line 140):

```typescript
// Templates are the narrower privilege — see canManageCosTemplates in
// src/lib/auth-helpers.ts. A cos_manager uses templates but cannot rewrite the
// legal boilerplate.
const cosTemplateRoles: UserRole[] = ["super_admin", "hr_admin"];
```

Then extend the Contract of Service group's `items` array (around line 236-245) with two entries after COS Employees:

```typescript
      {
        title: "Contracts",
        href: "/cos/contracts",
        icon: FileText,
        roles: cosRoles,
      },
      {
        title: "Contract Templates",
        href: "/cos/templates",
        icon: LayoutTemplate,
        roles: cosTemplateRoles,
      },
```

Import `LayoutTemplate` from `lucide-react`; `FileText` is already imported.

- [ ] **Step 4: Full verification**

Run:

```bash
npm run lint && npm run build && npm test
```

Expected: compiles; still exactly 4 pre-existing lint errors; all four test suites pass with `# fail 0` — the COS contract suites now contribute 12 real-stack tests and 20 unit tests.

- [ ] **Step 5: Regenerate types and confirm no drift**

Run: `npm run db:types && git diff --stat src/lib/database.types.ts`
Expected: no change — Task 1 already regenerated them.

- [ ] **Step 6: Commit**

```bash
git add src/components/cos/cos-contract-timeline.tsx \
        "src/app/(dashboard)/cos/employees/[id]/page.tsx" \
        src/components/layout/app-sidebar.tsx
git commit -m "feat(cos): add contract timeline to employee profile and sidebar items"
```

---

## Spec coverage

| Spec section | Task |
|---|---|
| Both tables, constraints, RLS | 1 |
| Exclusion constraint, all four behaviours | 1 |
| Contract status constants, derived expiry | 2 |
| `numberToWords` port | 3 |
| Merge-field system | 4 |
| Tiptap JSON → react-pdf | 5 |
| Tiptap editor, constrained toolbar | 6 |
| `canManageCosTemplates` | 6 |
| zod schemas | 6 |
| Template CRUD + routes | 7 |
| Contract actions, renewal, termination, error mapping | 8 |
| Inactive-employee rule | 8 (action) + 10 (UI) |
| Contract list, form, detail, edit routes | 9 |
| PDF document and button | 9 |
| Profile timeline | 10 |
| Sidebar items | 10 |
| Real-stack tests | 1 |
| Pure unit tests | 2, 3, 4, 5 |
