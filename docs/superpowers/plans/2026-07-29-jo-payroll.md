# Job Order Payroll (Spec 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Job Order payroll on top of `hris.job_order_employees` (Spec 1's roster), replacing the orphaned `/jo-payroll` module that still reads the dormant `employment_type = 'jo'` rows in `hris.employees`.

**Architecture:** Two new tables — `hris.job_order_payrolls` and `hris.job_order_payroll_members` — where each member row carries a **frozen snapshot** of everything the printables need (name, area, rate, SSS, ATM, community tax). Payrolls have a `draft` → `finalized` lifecycle enforced in the server actions. Migration 023's unused `jo_payroll` tables are dropped; the ten existing PDF generators are preserved and rewired through a single mapper.

**Tech Stack:** Next.js 16.2 App Router (React 19), Supabase Postgres + PostgREST, TypeScript strict, Tailwind v4, shadcn/ui, react-hook-form + zod, @tanstack/react-table via `<DataTable>`, `node --experimental-strip-types --test` for both test tiers.

> **Printables are NOT `@react-pdf/renderer`.** Corrected during execution.
> That library is used only by `src/components/pdf/**.tsx`. The Job Order
> payroll printables live in `src/lib/pdf/generateJobOrderPayroll.ts`, a
> **`.ts` file** that builds HTML strings and prints them through a hidden
> iframe (`printHTMLContent()` → `contentWindow.print()`). JSX cannot parse in
> a `.ts` file, so any instruction below that shows react-pdf JSX is wrong —
> use the file's own HTML-string idiom. Task 8's print menu must therefore
> trigger the browser print dialog, not a PDF download.

**Spec:** `docs/superpowers/specs/2026-07-29-jo-payroll-design.md`

## Global Constraints

- Every Supabase query must call `.schema("hris")` before `.from(...)`. Omitting it silently queries `public`.
- All server actions use `createAdminClient()` (service role, bypasses RLS) and re-implement role checks in TypeScript. Never import `@/lib/supabase/admin` from a `"use client"` module.
- New migrations keep the numeric prefix sequence and start with `SET search_path TO hris, public, auth, extensions;`. **The developer applies migrations to production directly — never suggest `supabase db push` or any other "apply this" step.**
- `numeric` columns come back from PostgREST as **strings**, not numbers. Every numeric field must go through a `toNumber()` conversion before reaching a caller, or numeric comparisons silently fail. (See `job-order-actions.ts:39`.)
- **`legacy_id` unique indexes must be non-partial.** A `WHERE legacy_id IS NOT NULL` predicate cannot be inferred by PostgREST's `.upsert({ onConflict })` and fails with `42P10`. This broke the entire Spec 1 importer (fixed in migration 059). Postgres already treats NULLs as distinct.
- **The snapshot lookup must never filter `deleted_at`.** 5,893 of 11,015 legacy member rows point at soft-deleted JOs.
- RLS must be enabled on every new `hris` table. Migration 020 grants `SELECT` to `anon` and `ALL` to `authenticated` by default, and the anon key ships in the browser bundle.
- Every mutating action calls `logAudit()` from `@/lib/audit` after the write, and `revalidatePath()` for affected routes.
- Roles: `canManageJobOrders()` (`src/lib/auth-helpers.ts:176`) = `super_admin | hr_admin | jo_manager`. Reopen and delete are `super_admin` only.
- `hours` on a payroll member is **overtime hours**. It is unrelated to `job_order_employees.working_hours`, which is a TEXT shift descriptor (`"7:00 PM - 7:00 AM"`) per migration 061.
- Verification order per CLAUDE.md: real-stack tests, then pure unit tests, then `npm run lint && npm run build`.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/064_job_order_payrolls.sql` | Drop 023's unused tables; create both new tables, indexes, triggers, RLS |
| `src/lib/job-order-payroll-helpers.ts` | Pure: amount math (moved), weekday count, snapshot mapper, print-row mapper. No I/O. |
| `src/lib/job-order-payroll-queries.ts` | Select-column constants and sync row shapers. Plain module, **not** `"use server"` — those may only export async functions. |
| `src/lib/types.ts` | `JobOrderPayroll`, `JobOrderPayrollMember`, `JobOrderAreaOption` |
| `src/lib/validations/job-order-payroll-schema.ts` | zod schemas for payroll metadata, creation, member edits |
| `src/lib/actions/job-order-payroll-actions.ts` | Payroll-level reads and writes + lifecycle |
| `src/lib/actions/job-order-payroll-member-actions.ts` | Member add/update/remove/refresh |
| `src/lib/actions/job-order-payroll-import-actions.ts` | Legacy two-CSV import |
| `src/lib/pdf/generateJobOrderPayroll.ts` | The ten print variants (moved), + DRAFT watermark |
| `src/components/tables/columns/job-order-payroll-columns.tsx` | List column defs |
| `src/components/job-orders/payroll/*` | List client, create dialog, detail client, members table |
| `src/app/(dashboard)/job-orders/payroll/page.tsx`, `[id]/page.tsx` | Server components |
| `src/app/(dashboard)/admin/job-order-payroll-import/page.tsx` | Import screen |
| `supabase/tests/job-order-payroll-helpers.test.mts` | Pure unit tier |
| `supabase/tests/job-order-payroll.test.mts` | Real-stack tier |

Actions are split payroll-level vs member-level because they are the two things a reviewer gates separately, and because one combined file would run past 600 lines.

---

### Task 1: Database schema and retiring the old module

Migration 064 drops `hris.jo_payroll`, which is the only table `/jo-payroll` reads. The old module therefore cannot survive this task and is deleted in the same commit — leaving it would ship a page that 500s.

**Files:**
- Create: `supabase/migrations/064_job_order_payrolls.sql`
- Delete: `src/app/(dashboard)/jo-payroll/`, `src/components/jo-payroll/`, `src/lib/actions/jo-payroll-actions.ts`, `src/lib/validations/jo-payroll-schema.ts`
- Rename: `src/lib/utils/joPayrollAmount.ts` → `src/lib/job-order-payroll-helpers.ts`; `src/lib/pdf/generateJoPayroll.ts` → `src/lib/pdf/generateJobOrderPayroll.ts`
- Modify: `src/lib/pdf/generateJobOrderPayroll.ts:26` (import path), `src/components/layout/app-sidebar.tsx:236` (remove entry)

**Interfaces:**
- Consumes: `hris.job_order_employees`, `hris.job_order_areas` (migration 056), `hris.update_updated_at()` (migration 003), `hris.get_user_role()` (migration 007)
- Produces: tables `hris.job_order_payrolls`, `hris.job_order_payroll_members`; module path `@/lib/job-order-payroll-helpers`; module path `@/lib/pdf/generateJobOrderPayroll`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/064_job_order_payrolls.sql`:

```sql
-- Migration 064: Job Order payroll, rebuilt on hris.job_order_employees.
--
-- Migration 023 created hris.jo_payroll / jo_payroll_members against
-- hris.employees filtered to employment_type = 'jo'. Spec 1 moved Job Order
-- personnel into hris.job_order_employees and left that population dormant, so
-- the old tables point at people the roster no longer manages. They were never
-- used in production (confirmed with the developer), so they are dropped and
-- rebuilt rather than migrated.
--
-- Each member row carries a FROZEN SNAPSHOT of everything the printables need.
-- A payroll is a record of what was paid; editing or deleting a JO afterwards
-- must not alter a document that was already issued. The roster is joined only
-- when a member is added or explicitly refreshed.
--
-- Grants: not needed — migration 020 set default privileges for new tables in
-- the hris schema. That is exactly why RLS below is mandatory.

SET search_path TO hris, public, auth, extensions;

DROP TABLE IF EXISTS hris.jo_payroll_members;
DROP TABLE IF EXISTS hris.jo_payroll;

-- ── Payrolls ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hris.job_order_payrolls (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start     DATE NOT NULL,
  period_end       DATE NOT NULL,
  -- Default working days for the period. Members may each override it.
  days             NUMERIC(5,2),
  description      TEXT,
  particulars      TEXT,
  -- Denormalized display/print label, recomputed from the members'
  -- area_name whenever membership changes. Members are the source of truth.
  areas            TEXT,
  payroll_date     DATE,
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'finalized')),
  finalized_at     TIMESTAMPTZ,
  finalized_by     UUID,
  -- True for payrolls imported from the legacy system. Legacy
  -- jopayroll_members had no rate column — it joined live to jos.rate — so
  -- migrated amounts are priced at the JO's CURRENT rate and are
  -- reconstructions, not records. The UI badges them.
  is_reconstructed BOOLEAN NOT NULL DEFAULT false,
  legacy_id        BIGINT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID,
  updated_by       UUID,
  deleted_at       TIMESTAMPTZ,
  CONSTRAINT chk_job_order_payroll_period CHECK (period_end >= period_start)
);

-- NON-PARTIAL on purpose. A `WHERE legacy_id IS NOT NULL` predicate cannot be
-- inferred by PostgREST's .upsert({onConflict}) and fails with 42P10 — the
-- defect migration 059 had to fix for job_order_employees. Postgres already
-- treats NULLs as distinct, so hand-created payrolls are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_order_payrolls_legacy_id
  ON hris.job_order_payrolls(legacy_id);
CREATE INDEX IF NOT EXISTS idx_job_order_payrolls_period
  ON hris.job_order_payrolls(period_start DESC, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_job_order_payrolls_status
  ON hris.job_order_payrolls(status);
CREATE INDEX IF NOT EXISTS idx_job_order_payrolls_deleted_at
  ON hris.job_order_payrolls(deleted_at);

CREATE TRIGGER trg_job_order_payrolls_updated_at
  BEFORE UPDATE ON hris.job_order_payrolls
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

-- ── Payroll members ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hris.job_order_payroll_members (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_id            UUID NOT NULL
                          REFERENCES hris.job_order_payrolls(id) ON DELETE CASCADE,
  -- Nullable with ON DELETE SET NULL: deleting a JO must never destroy
  -- payroll history. The snapshot below carries the printout on its own.
  job_order_employee_id UUID
                          REFERENCES hris.job_order_employees(id) ON DELETE SET NULL,

  -- Editable inputs.
  days                  NUMERIC(5,2),
  -- OVERTIME hours. NOT job_order_employees.working_hours, which migration 061
  -- retyped to TEXT because it holds shift descriptors ("7:00 PM - 7:00 AM").
  hours                 NUMERIC(5,2),

  -- Frozen snapshot: every field the ten printables read.
  full_name                  TEXT NOT NULL,
  area_name                  TEXT,
  sub_area                   TEXT,
  daily_rate                 NUMERIC(10,2),
  sss_no                     TEXT,
  sss_ss                     NUMERIC(10,2),
  sss_ec                     NUMERIC(10,2),
  has_atm                    BOOLEAN NOT NULL DEFAULT false,
  landbank_account_number    TEXT,
  community_tax_number       TEXT,
  community_tax_date         DATE,
  community_tax_place_issued TEXT,

  legacy_id             BIGINT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Plain, not partial: NULLs compare as distinct, so this blocks adding the
  -- same JO twice while still allowing any number of unlinked manual rows.
  CONSTRAINT uq_job_order_payroll_members UNIQUE (payroll_id, job_order_employee_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_job_order_payroll_members_legacy_id
  ON hris.job_order_payroll_members(legacy_id);
CREATE INDEX IF NOT EXISTS idx_job_order_payroll_members_payroll
  ON hris.job_order_payroll_members(payroll_id);
CREATE INDEX IF NOT EXISTS idx_job_order_payroll_members_employee
  ON hris.job_order_payroll_members(job_order_employee_id);

CREATE TRIGGER trg_job_order_payroll_members_updated_at
  BEFORE UPDATE ON hris.job_order_payroll_members
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Mandatory. Migration 020 grants SELECT on new hris tables to `anon` and ALL
-- to `authenticated`; the anon key ships in the browser bundle. These rows
-- carry LandBank account numbers and SSS numbers. Spec 1's identical omission
-- (migrations 055/056) left Job Order PII world-readable until migration 060.
ALTER TABLE hris.job_order_payrolls        ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.job_order_payroll_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_job_order_payrolls" ON hris.job_order_payrolls
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin', 'jo_manager'));

CREATE POLICY "admin_all_job_order_payroll_members" ON hris.job_order_payroll_members
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin', 'jo_manager'));
```

- [ ] **Step 2: Retire the old module**

```bash
git rm -r "src/app/(dashboard)/jo-payroll" src/components/jo-payroll
git rm src/lib/actions/jo-payroll-actions.ts src/lib/validations/jo-payroll-schema.ts
git mv src/lib/utils/joPayrollAmount.ts src/lib/job-order-payroll-helpers.ts
git mv src/lib/pdf/generateJoPayroll.ts src/lib/pdf/generateJobOrderPayroll.ts
```

Then fix the one import in `src/lib/pdf/generateJobOrderPayroll.ts` (line 26):

```ts
} from "@/lib/job-order-payroll-helpers";
```

And delete the sidebar entry at `src/components/layout/app-sidebar.tsx:236`:

```tsx
      { title: "Job Order Payroll", href: "/jo-payroll", icon: Hammer, roles: adminRoles },
```

If `Hammer` is now an unused import in that file, remove it from the `lucide-react` import list — the lint config will flag it otherwise. Task 8 adds the replacement entry under the Job Orders group.

- [ ] **Step 3: Verify the migration applies and the app still builds**

```bash
colima start && npm run db:start   # if the stack is not already up
npm run db:reset
npm run lint && npm run build
```

Expected: `db:reset` runs all migrations through 064 with no error; lint shows no NEW errors versus the **measured baseline of 92 problems (4 errors, 88 warnings)**; build succeeds. Confirm the tables exist:

```bash
npx supabase status -o json   # read DB_URL, then:
psql "$DB_URL" -c "\d hris.job_order_payroll_members" \
  -c "select relname, relrowsecurity from pg_class where relname like 'job_order_payroll%';"
```

Expected: both tables report `relrowsecurity = t`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/064_job_order_payrolls.sql src/lib/pdf/generateJobOrderPayroll.ts src/components/layout/app-sidebar.tsx
git commit -m "feat(jo): add payroll schema and retire the orphaned /jo-payroll module"
```

---

### Task 2: Pure helpers

TDD. These functions decide every printed peso figure and every default working-day count, so they get pinned before anything calls them.

**Files:**
- Modify: `src/lib/job-order-payroll-helpers.ts`
- Create: `supabase/tests/job-order-payroll-helpers.test.mts`
- Modify: `package.json` (`test:dtr`)

**Interfaces:**
- Consumes: `JobOrderEmployee` from `@/lib/types`
- Produces: `countWeekdays(startIso, endIso): number`; `toPayrollMemberSnapshot(jo): JobOrderPayrollSnapshot`; `toPrintRow(m): JobOrderPayrollPrintRow`; `summarizeMembers(ms): { gross, sss, net }`; `deriveAreasLabel(ms): string | null`; plus the existing `computeJoGross`, `computeJoOvertimeGross`, `computeJoSssDeduction`, `computeJoNetAmount`, `computeJoOvertimeNet`, `groupMembersByRate`, and the `JobOrderPayrollPrintRow` interface (moved here from the PDF module so it can be tested without importing `@react-pdf/renderer`)

- [ ] **Step 1: Write the failing tests**

Create `supabase/tests/job-order-payroll-helpers.test.mts`:

```ts
// Unit tests for the pure Job Order payroll helpers
// (`src/lib/job-order-payroll-helpers.ts`).
//
// countWeekdays sets the default `days` on every payroll, and the legacy
// system's value is the reconciliation target: legacy payroll
// 07/01/2022–07/15/2022 carries days = 11, which is exactly the Mon–Fri count
// for that range. If this function drifts, the first payroll created in the
// new system stops reconciling against the last one created in the old.
//
// Requires Node >= 22 for --experimental-strip-types.
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import {
  countWeekdays,
  computeJoGross,
  computeJoNetAmount,
  deriveAreasLabel,
  groupMembersByRate,
  summarizeMembers,
  toPayrollMemberSnapshot,
  toPrintRow,
} from "../../src/lib/job-order-payroll-helpers.ts";
import type { JobOrderEmployee } from "../../src/lib/types.ts";

// ── countWeekdays ───────────────────────────────────────────────────

test("matches the real legacy value for 2022-07-01..2022-07-15", () => {
  // Jul 1 (Fri) + Jul 4-8 + Jul 11-15 = 11
  assert.equal(countWeekdays("2022-07-01", "2022-07-15"), 11);
});

test("counts a single weekday as 1", () => {
  assert.equal(countWeekdays("2026-07-29", "2026-07-29"), 1); // Wednesday
});

test("counts a single weekend day as 0", () => {
  assert.equal(countWeekdays("2026-08-01", "2026-08-01"), 0); // Saturday
});

test("a Saturday-to-Sunday range is 0", () => {
  assert.equal(countWeekdays("2026-08-01", "2026-08-02"), 0);
});

test("spans a month boundary", () => {
  // 2026-07-29 Wed, 30 Thu, 31 Fri, Aug 3 Mon = 4
  assert.equal(countWeekdays("2026-07-29", "2026-08-03"), 4);
});

test("spans a year boundary", () => {
  // 2025-12-31 Wed, 2026-01-01 Thu, 01-02 Fri = 3 (01-03/04 are the weekend)
  assert.equal(countWeekdays("2025-12-31", "2026-01-04"), 3);
});

test("counts a leap day when it is a weekday", () => {
  assert.equal(countWeekdays("2028-02-29", "2028-02-29"), 1); // Tuesday
});

test("end before start yields 0 rather than throwing or going negative", () => {
  assert.equal(countWeekdays("2026-07-15", "2026-07-01"), 0);
});

test("an unparseable date yields 0 rather than NaN", () => {
  assert.equal(countWeekdays("not-a-date", "2026-07-15"), 0);
});

// ── toPayrollMemberSnapshot ─────────────────────────────────────────

function jo(overrides: Partial<JobOrderEmployee> = {}): JobOrderEmployee {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    full_name: "Dela Cruz, Juan P.",
    sort_name: "dela cruz, juan p.",
    sex: "male",
    purok: "Purok 1",
    barangay: "Molicay",
    area_id: "22222222-2222-2222-2222-222222222222",
    area_name: "City Health Office",
    sub_area: "Driver",
    daily_rate: 450,
    previous_daily_rate: 400,
    working_hours: "7:00 PM - 7:00 AM",
    date_started: "2020-02-01",
    eligibility: null,
    recommended_by: null,
    remarks: null,
    remarks_2: null,
    has_atm: true,
    landbank_account_number: "0817-0798-73",
    sss_no: "34-1234567-8",
    sss_ss: 180,
    sss_ec: 10,
    community_tax_number: "CTC-9",
    community_tax_date: "2026-01-05",
    community_tax_place_issued: "Ozamiz City",
    status: "active",
    legacy_id: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

test("snapshot copies every field the printables need", () => {
  assert.deepEqual(toPayrollMemberSnapshot(jo()), {
    full_name: "Dela Cruz, Juan P.",
    area_name: "City Health Office",
    sub_area: "Driver",
    daily_rate: 450,
    sss_no: "34-1234567-8",
    sss_ss: 180,
    sss_ec: 10,
    has_atm: true,
    landbank_account_number: "0817-0798-73",
    community_tax_number: "CTC-9",
    community_tax_date: "2026-01-05",
    community_tax_place_issued: "Ozamiz City",
  });
});

test("snapshot never carries working_hours, which is a shift descriptor", () => {
  // Routed through `unknown`: JobOrderPayrollSnapshot has no index signature,
  // so a direct cast is a TS2352 error. node --experimental-strip-types does
  // not typecheck, so this only surfaces under `npx tsc --noEmit`.
  const snap = toPayrollMemberSnapshot(jo()) as unknown as Record<string, unknown>;
  assert.equal("working_hours" in snap, false);
});

test("snapshot tolerates a JO with every optional field null", () => {
  const snap = toPayrollMemberSnapshot(
    jo({
      area_name: null,
      sub_area: null,
      daily_rate: null,
      sss_no: null,
      sss_ss: null,
      sss_ec: null,
      has_atm: false,
      landbank_account_number: null,
      community_tax_number: null,
      community_tax_date: null,
      community_tax_place_issued: null,
    }),
  );
  assert.equal(snap.full_name, "Dela Cruz, Juan P.");
  assert.equal(snap.daily_rate, null);
  assert.equal(snap.has_atm, false);
});

// ── toPrintRow ──────────────────────────────────────────────────────

test("print row maps snapshot columns onto the legacy print field names", () => {
  const row = toPrintRow({
    id: "m1",
    payroll_id: "p1",
    job_order_employee_id: null,
    days: 11,
    hours: 4,
    full_name: "Dela Cruz, Juan P.",
    area_name: "City Health Office",
    sub_area: "Driver",
    daily_rate: 450,
    sss_no: "34-1234567-8",
    sss_ss: 180,
    sss_ec: 10,
    has_atm: true,
    landbank_account_number: "0817-0798-73",
    community_tax_number: "CTC-9",
    community_tax_date: "2026-01-05",
    community_tax_place_issued: "Ozamiz City",
    legacy_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  });

  assert.equal(row.fullname, "Dela Cruz, Juan P.");
  assert.equal(row.area_assigned, "City Health Office");
  assert.equal(row.rate, 450);
  assert.equal(row.account_number, "0817-0798-73");
  assert.equal(row.tax_number, "CTC-9");
  assert.equal(row.tax_date, "2026-01-05");
  assert.equal(row.tax_issued, "Ozamiz City");
});

// ── summarizeMembers / deriveAreasLabel ─────────────────────────────

const member = (
  rate: number | null,
  days: number | null,
  ss: number | null,
  ec: number | null,
  area: string | null = "A",
) => ({
  rate,
  days,
  hours: null,
  sss_ss: ss,
  sss_ec: ec,
  area_name: area,
});

test("summarize adds gross and SSS across members", () => {
  const out = summarizeMembers([
    member(450, 11, 180, 10),
    member(400, 10, 160, 10),
  ]);
  assert.equal(out.gross, 450 * 11 + 400 * 10);
  assert.equal(out.sss, 360);
  assert.equal(out.net, out.gross - 360);
});

test("summarize treats nulls as zero rather than producing NaN", () => {
  const out = summarizeMembers([member(null, null, null, null)]);
  assert.deepEqual(out, { gross: 0, sss: 0, net: 0 });
});

test("summarize of an empty payroll is all zeroes", () => {
  assert.deepEqual(summarizeMembers([]), { gross: 0, sss: 0, net: 0 });
});

test("areas label is unique, sorted and comma-joined", () => {
  assert.equal(
    deriveAreasLabel([
      member(1, 1, 0, 0, "City Health Office"),
      member(1, 1, 0, 0, "CDRRMO"),
      member(1, 1, 0, 0, "City Health Office"),
    ]),
    "CDRRMO, City Health Office",
  );
});

test("areas label ignores null area names", () => {
  assert.equal(deriveAreasLabel([member(1, 1, 0, 0, null)]), null);
});

// ── preserved behaviour of the moved amount helpers ──────────────────

test("gross is rate times days, nulls treated as zero", () => {
  assert.equal(computeJoGross(450, 11), 4950);
  assert.equal(computeJoGross(null, 11), 0);
  assert.equal(computeJoGross(450, null), 0);
});

test("net subtracts the SSS shares from gross", () => {
  assert.equal(
    computeJoNetAmount({ rate: 450, days: 11, sss_ss: 180, sss_ec: 10 }),
    4760,
  );
});

test("groupMembersByRate sorts ascending by rate", () => {
  const groups = groupMembersByRate([
    { rate: 500, days: 1, hours: null, sss_ss: null, sss_ec: null },
    { rate: 400, days: 1, hours: null, sss_ss: null, sss_ec: null },
  ]);
  assert.deepEqual(
    groups.map((g) => g.rate),
    [400, 500],
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --experimental-strip-types --test supabase/tests/job-order-payroll-helpers.test.mts
```

Expected: FAIL — `countWeekdays`, `toPayrollMemberSnapshot`, `toPrintRow`, `summarizeMembers` and `deriveAreasLabel` are not exported yet. The `computeJoGross` / `groupMembersByRate` tests should already pass, proving the `git mv` in Task 1 kept those intact.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/job-order-payroll-helpers.ts` (keep the existing amount helpers exactly as they are), and add the imports at the top of the file:

```ts
import type { JobOrderEmployee, JobOrderPayrollMember } from "@/lib/types";
```

> **Ordering caveat, recorded retroactively.** `JobOrderPayrollMember` is added
> to `src/lib/types.ts` by **Task 3**, so this one import runs ahead of its
> defining task. This was discovered during execution: the original structural
> parameter type on `toPrintRow` tripped TS2353 excess-property checking, and
> because `node --experimental-strip-types` does not typecheck, the tests passed
> green while `npx tsc --noEmit` failed. If you are executing this plan from
> scratch, do Task 3's `src/lib/types.ts` additions before this step, or the
> import will not resolve.

```ts
// ---------------------------------------------------------------------------
// Working days
// ---------------------------------------------------------------------------

/**
 * Mon–Fri count in an inclusive date range, both ends `YYYY-MM-DD`.
 *
 * This reproduces the legacy system's `days` exactly: legacy payroll
 * 07/01/2022–07/15/2022 carries days = 11, the plain weekday count, with no
 * holiday deduction. Holidays are surfaced in the UI as an advisory the user
 * subtracts deliberately — see the spec's "Working days" decision.
 *
 * Dates are constructed at T12:00:00 so a DST or timezone shift can never
 * move a date across a day boundary. Invalid input yields 0 rather than NaN,
 * because this value seeds a form field.
 */
export function countWeekdays(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T12:00:00`);
  const end = new Date(`${endIso}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  if (end < start) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

/**
 * The frozen columns on hris.job_order_payroll_members. Everything the ten
 * printables read, and nothing else — notably NOT working_hours, which is a
 * TEXT shift descriptor ("7:00 PM - 7:00 AM") per migration 061 and has no
 * relationship to the payroll's overtime `hours`.
 */
export interface JobOrderPayrollSnapshot {
  full_name: string;
  area_name: string | null;
  sub_area: string | null;
  daily_rate: number | null;
  sss_no: string | null;
  sss_ss: number | null;
  sss_ec: number | null;
  has_atm: boolean;
  landbank_account_number: string | null;
  community_tax_number: string | null;
  community_tax_date: string | null;
  community_tax_place_issued: string | null;
}

/** Copy a roster row into the columns a payroll member freezes. */
export function toPayrollMemberSnapshot(
  jo: JobOrderEmployee,
): JobOrderPayrollSnapshot {
  return {
    full_name: jo.full_name,
    area_name: jo.area_name,
    sub_area: jo.sub_area,
    daily_rate: jo.daily_rate,
    sss_no: jo.sss_no,
    sss_ss: jo.sss_ss,
    sss_ec: jo.sss_ec,
    has_atm: jo.has_atm,
    landbank_account_number: jo.landbank_account_number,
    community_tax_number: jo.community_tax_number,
    community_tax_date: jo.community_tax_date,
    community_tax_place_issued: jo.community_tax_place_issued,
  };
}

// ---------------------------------------------------------------------------
// Print row
// ---------------------------------------------------------------------------

/**
 * Flattened row consumed by every payroll PDF. The field names are the legacy
 * Laravel ones and are load-bearing across ten generators, so they are mapped
 * here rather than renamed there.
 *
 * Declared in this module (not the PDF module) so it can be unit-tested
 * without pulling in @react-pdf/renderer.
 */
export interface JobOrderPayrollPrintRow {
  fullname: string;
  area_assigned: string | null;
  rate: number | null;
  days: number | null;
  hours: number | null;
  sss_no: string | null;
  sss_ss: number | null;
  sss_ec: number | null;
  account_number: string | null;
  tax_number: string | null;
  tax_date: string | null;
  tax_issued: string | null;
}

/**
 * Shape a stored member row into the flat struct the PDFs expect.
 *
 * Takes the full `JobOrderPayrollMember` rather than a structural subset: the
 * subset version tripped TypeScript's excess-property check the moment a
 * caller passed a whole member row as an object literal (TS2353), which is
 * exactly what the tests and Task 8 do.
 */
export function toPrintRow(m: JobOrderPayrollMember): JobOrderPayrollPrintRow {
  return {
    fullname: m.full_name,
    area_assigned: m.area_name,
    rate: m.daily_rate,
    days: m.days,
    hours: m.hours,
    sss_no: m.sss_no,
    sss_ss: m.sss_ss,
    sss_ec: m.sss_ec,
    account_number: m.landbank_account_number,
    tax_number: m.community_tax_number,
    tax_date: m.community_tax_date,
    tax_issued: m.community_tax_place_issued,
  };
}

// ---------------------------------------------------------------------------
// Totals and labels
// ---------------------------------------------------------------------------

export interface JobOrderPayrollTotals {
  gross: number;
  sss: number;
  net: number;
}

/** Payroll totals. Null inputs count as zero so a half-filled draft still adds up. */
export function summarizeMembers(
  members: {
    rate: number | null;
    days: number | null;
    sss_ss: number | null;
    sss_ec: number | null;
  }[],
): JobOrderPayrollTotals {
  let gross = 0;
  let sss = 0;
  for (const m of members) {
    gross += computeJoGross(m.rate, m.days);
    sss += computeJoSssDeduction(m.sss_ss, m.sss_ec);
  }
  return { gross, sss, net: gross - sss };
}

/**
 * The denormalized `areas` label stored on the payroll: unique, sorted,
 * comma-joined member area names. Returns null when no member has an area,
 * so the column stays NULL rather than an empty string.
 */
export function deriveAreasLabel(
  members: { area_name: string | null }[],
): string | null {
  const names = Array.from(
    new Set(
      members
        .map((m) => m.area_name)
        .filter((n): n is string => typeof n === "string" && n.trim() !== ""),
    ),
  ).sort();
  return names.length === 0 ? null : names.join(", ");
}
```

Then update `src/lib/pdf/generateJobOrderPayroll.ts` to import the print-row type instead of declaring it. Replace its local `JoPayrollPrintRow` interface (around line 44) with a re-export so the ten generators keep compiling unchanged:

```ts
import type { JobOrderPayrollPrintRow } from "@/lib/job-order-payroll-helpers";

/** @deprecated alias kept so the ten generator signatures below stay untouched. */
export type JoPayrollPrintRow = JobOrderPayrollPrintRow;
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --experimental-strip-types --test supabase/tests/job-order-payroll-helpers.test.mts
```

Expected: PASS, 21 tests — the exact number written in Step 1. If your count differs, you added or dropped a case; reconcile before moving on.

- [ ] **Step 5: Wire into the npm test script**

In `package.json`, append the new file to `test:dtr`:

```json
"test:dtr": "node --experimental-strip-types --test supabase/tests/dtr-bucketing.test.mts supabase/tests/job-order-helpers.test.mts supabase/tests/parse-csv.test.mts supabase/tests/csv-import-helpers.test.mts supabase/tests/job-order-payroll-helpers.test.mts",
```

Run `npm run test:dtr` and confirm the whole unit tier is green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/job-order-payroll-helpers.ts src/lib/pdf/generateJobOrderPayroll.ts supabase/tests/job-order-payroll-helpers.test.mts package.json
git commit -m "feat(jo): add payroll working-day, snapshot and print-row helpers"
```

---

### Task 3: Types and validation schemas

**Files:**
- Modify: `src/lib/types.ts` (append after `JobOrderEmployee`, which ends at line 513)
- Create: `src/lib/validations/job-order-payroll-schema.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks beyond the DB shape
- Produces: `JobOrderPayrollStatus`, `JobOrderPayroll`, `JobOrderPayrollMember`, `JobOrderAreaOption`; `jobOrderPayrollMetadataSchema`, `jobOrderPayrollCreateSchema`, `jobOrderPayrollMemberSchema` and their inferred value types

- [ ] **Step 1: Add the types**

Append to `src/lib/types.ts`:

```ts
export type JobOrderPayrollStatus = "draft" | "finalized";

export interface JobOrderPayroll {
  id: string;
  period_start: string;
  period_end: string;
  days: number | null;
  description: string | null;
  particulars: string | null;
  areas: string | null;
  payroll_date: string | null;
  status: JobOrderPayrollStatus;
  finalized_at: string | null;
  finalized_by: string | null;
  // Imported from the legacy system, priced at the JO's rate at import time
  // rather than the rate actually paid — legacy jopayroll_members had no rate
  // column. Displayed as a "Reconstructed" badge.
  is_reconstructed: boolean;
  legacy_id: number | null;
  created_at: string;
  updated_at: string;
  // Aggregates computed in the action, not stored.
  member_count: number;
  total_gross: number;
  total_sss: number;
  total_net: number;
}

export interface JobOrderPayrollMember {
  id: string;
  payroll_id: string;
  // Null when the linked JO was deleted (ON DELETE SET NULL) or when the row
  // was added manually. The snapshot below is what prints either way.
  job_order_employee_id: string | null;
  days: number | null;
  // Overtime hours. Unrelated to JobOrderEmployee.working_hours.
  hours: number | null;
  full_name: string;
  area_name: string | null;
  sub_area: string | null;
  daily_rate: number | null;
  sss_no: string | null;
  sss_ss: number | null;
  sss_ec: number | null;
  has_atm: boolean;
  landbank_account_number: string | null;
  community_tax_number: string | null;
  community_tax_date: string | null;
  community_tax_place_issued: string | null;
  legacy_id: number | null;
  created_at: string;
  updated_at: string;
}

/** An active area plus its active-JO count, for the payroll area picker. */
export interface JobOrderAreaOption {
  id: string;
  name: string;
  active_employee_count: number;
}
```

- [ ] **Step 2: Write the schemas**

Create `src/lib/validations/job-order-payroll-schema.ts`:

```ts
import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .nullable()
  .transform((v) => (v == null || v === "" ? null : v));

/** Non-negative money/quantity field that accepts "" from an empty input. */
const optionalNonNegative = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((v) => {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  })
  .refine((v) => v == null || v >= 0, "Must be zero or more");

export const jobOrderPayrollMetadataSchema = z
  .object({
    period_start: isoDate,
    period_end: isoDate,
    days: optionalNonNegative,
    description: optionalText,
    particulars: optionalText,
    payroll_date: isoDate.optional().nullable().or(z.literal("")).transform(
      (v) => (v == null || v === "" ? null : v),
    ),
  })
  // Mirrors chk_job_order_payroll_period so the user sees a field error
  // instead of a raw Postgres constraint violation.
  .refine((v) => v.period_end >= v.period_start, {
    message: "Period end must not be before period start",
    path: ["period_end"],
  });

export type JobOrderPayrollMetadataValues = z.infer<
  typeof jobOrderPayrollMetadataSchema
>;

export const jobOrderPayrollCreateSchema = z
  .object({
    period_start: isoDate,
    period_end: isoDate,
    days: optionalNonNegative,
    description: optionalText,
    particulars: optionalText,
    payroll_date: isoDate.optional().nullable().or(z.literal("")).transform(
      (v) => (v == null || v === "" ? null : v),
    ),
    area_ids: z.array(z.string().uuid()).min(1, "Select at least one area"),
  })
  .refine((v) => v.period_end >= v.period_start, {
    message: "Period end must not be before period start",
    path: ["period_end"],
  });

export type JobOrderPayrollCreateValues = z.infer<
  typeof jobOrderPayrollCreateSchema
>;

/**
 * The three per-row editable values. `daily_rate` is editable because it is a
 * snapshot — correcting a wrongly stamped rate before finalizing is
 * legitimate, and it never writes back to hris.job_order_employees.
 */
export const jobOrderPayrollMemberSchema = z.object({
  days: optionalNonNegative,
  hours: optionalNonNegative,
  daily_rate: optionalNonNegative,
});

export type JobOrderPayrollMemberValues = z.infer<
  typeof jobOrderPayrollMemberSchema
>;
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/validations/job-order-payroll-schema.ts
git commit -m "feat(jo): add payroll types and validation schemas"
```

---

### Task 4: Payroll-level server actions

**Files:**
- Create: `src/lib/job-order-payroll-queries.ts`
- Create: `src/lib/actions/job-order-payroll-actions.ts`

**Interfaces:**
- Consumes: `countWeekdays`, `summarizeMembers`, `deriveAreasLabel`, `toPayrollMemberSnapshot` from `@/lib/job-order-payroll-helpers`; `canManageJobOrders` from `@/lib/auth-helpers`; schemas from Task 3; types from Task 3
- Produces: from `@/lib/job-order-payroll-queries` — `PAYROLL_SELECT`, `MEMBER_SELECT`, `JO_SELECT_FOR_SNAPSHOT`, `toNumber`, `shapeMember`; from the actions module — `getJobOrderPayrolls`, `getJobOrderPayrollById`, `getJobOrderAreasForPicker`, `createJobOrderPayroll`, `updateJobOrderPayroll`, `duplicateJobOrderPayroll`, `finalizeJobOrderPayroll`, `reopenJobOrderPayroll`, `deleteJobOrderPayroll`, plus the async helpers `loadMembers`, `recomputeAreas`, `assertDraft`, `loadJobOrdersForSnapshot` reused by Task 5

- [ ] **Step 1: Write the query module**

A `"use server"` module may only export **async functions** — Next rejects exported constants and sync functions at build time. The select strings and row shapers therefore live in a plain module that both action files import.

Create `src/lib/job-order-payroll-queries.ts`:

```ts
import type { JobOrderPayrollMember } from "@/lib/types";

export const PAYROLL_SELECT = `
  id, period_start, period_end, days, description, particulars, areas,
  payroll_date, status, finalized_at, finalized_by, is_reconstructed,
  legacy_id, created_at, updated_at
`;

export const MEMBER_SELECT = `
  id, payroll_id, job_order_employee_id, days, hours, full_name, area_name,
  sub_area, daily_rate, sss_no, sss_ss, sss_ec, has_atm,
  landbank_account_number, community_tax_number, community_tax_date,
  community_tax_place_issued, legacy_id, created_at, updated_at
`;

export const JO_SELECT_FOR_SNAPSHOT = `
  id, full_name, sort_name, sex, purok, barangay, area_id, sub_area,
  daily_rate, previous_daily_rate, working_hours, date_started, eligibility,
  recommended_by, remarks, remarks_2, has_atm, landbank_account_number,
  sss_no, sss_ss, sss_ec, community_tax_number, community_tax_date,
  community_tax_place_issued, status, legacy_id, created_at, updated_at,
  job_order_areas(name)
`;

// PostgREST serializes numeric(...) as a STRING to avoid float precision loss.
// Without this, `rate * days` becomes string concatenation and every total is
// garbage. Same defect class as job-order-actions.ts:39.
export function toNumber(v: unknown): number | null {
  return v == null ? null : Number(v);
}

export function shapeMember(r: Record<string, unknown>): JobOrderPayrollMember {
  return {
    ...(r as unknown as JobOrderPayrollMember),
    days: toNumber(r.days),
    hours: toNumber(r.hours),
    daily_rate: toNumber(r.daily_rate),
    sss_ss: toNumber(r.sss_ss),
    sss_ec: toNumber(r.sss_ec),
  };
}
```

- [ ] **Step 2: Write the actions**

Create `src/lib/actions/job-order-payroll-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageJobOrders } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import {
  deriveAreasLabel,
  summarizeMembers,
  toPayrollMemberSnapshot,
} from "@/lib/job-order-payroll-helpers";
import {
  jobOrderPayrollCreateSchema,
  jobOrderPayrollMetadataSchema,
  type JobOrderPayrollCreateValues,
  type JobOrderPayrollMetadataValues,
} from "@/lib/validations/job-order-payroll-schema";
import {
  JO_SELECT_FOR_SNAPSHOT,
  MEMBER_SELECT,
  PAYROLL_SELECT,
  shapeMember,
  toNumber,
} from "@/lib/job-order-payroll-queries";
import type {
  JobOrderAreaOption,
  JobOrderEmployee,
  JobOrderPayroll,
  JobOrderPayrollMember,
} from "@/lib/types";

/** Every member of a payroll, ordered by area then name. */
export async function loadMembers(
  supabase: ReturnType<typeof createAdminClient>,
  payrollId: string,
): Promise<JobOrderPayrollMember[]> {
  const { data, error } = await supabase
    .schema("hris")
    .from("job_order_payroll_members")
    .select(MEMBER_SELECT)
    .eq("payroll_id", payrollId)
    .order("area_name", { ascending: true, nullsFirst: false })
    .order("full_name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => shapeMember(r as Record<string, unknown>));
}

/**
 * Recompute the denormalized `areas` label after any membership change.
 *
 * Logs rather than throws: a stale label must not fail the membership change
 * that triggered it. But it cannot be silent — `areas` is one of the three
 * columns `getJobOrderPayrolls` searches (`areas.ilike.…`), so a dropped
 * update makes a payroll unfindable by area with no other symptom.
 */
export async function recomputeAreas(
  supabase: ReturnType<typeof createAdminClient>,
  payrollId: string,
): Promise<void> {
  const members = await loadMembers(supabase, payrollId);
  const { error } = await supabase
    .schema("hris")
    .from("job_order_payrolls")
    .update({ areas: deriveAreasLabel(members) })
    .eq("id", payrollId);
  if (error) {
    console.error(
      `recomputeAreas failed for payroll ${payrollId}: ${error.message}`,
    );
  }
}

/**
 * Roll back a payroll whose member insert failed, so no half-built row is
 * left behind. Logs its own failure: a stranded zero-member draft cannot be
 * finalized (finalizeJobOrderPayroll rejects an empty payroll), so it would
 * sit inert in the list until someone deleted it by hand.
 */
async function cleanupOrphanedPayroll(
  supabase: ReturnType<typeof createAdminClient>,
  payrollId: string,
): Promise<void> {
  const { error } = await supabase
    .schema("hris")
    .from("job_order_payrolls")
    .delete()
    .eq("id", payrollId);
  if (error) {
    console.error(
      `cleanupOrphanedPayroll failed for payroll ${payrollId}: ${error.message}`,
    );
  }
}

/**
 * Shared draft guard. Returns an error string when the payroll is missing or
 * already finalized, otherwise null. A finalized payroll is an issued record;
 * only `reopenJobOrderPayroll` (super_admin) can unlock it.
 */
export async function assertDraft(
  supabase: ReturnType<typeof createAdminClient>,
  payrollId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .schema("hris")
    .from("job_order_payrolls")
    .select("id, status, deleted_at")
    .eq("id", payrollId)
    .maybeSingle();
  if (error) return error.message;
  if (!data || data.deleted_at) return "Payroll not found";
  if (data.status !== "draft") {
    return "This payroll is finalized. Reopen it before making changes.";
  }
  return null;
}

// ── Reads ────────────────────────────────────────────────────────────

export interface JobOrderPayrollFilters {
  status?: "draft" | "finalized" | "all";
  periodFrom?: string | null;
  periodTo?: string | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
}

/**
 * Server-side pagination, unlike the Spec 1 roster which paginates inside
 * <DataTable>. This table starts at ~805 migrated payrolls and grows every
 * cutoff, so shipping every row to the browser is not viable.
 */
export async function getJobOrderPayrolls(
  filters: JobOrderPayrollFilters = {},
): Promise<{ rows: JobOrderPayroll[]; totalCount: number }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { rows: [], totalCount: 0 };

  const supabase = createAdminClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const from = (page - 1) * pageSize;

  let query = supabase
    .schema("hris")
    .from("job_order_payrolls")
    .select(PAYROLL_SELECT, { count: "exact" })
    .is("deleted_at", null)
    .order("period_start", { ascending: false })
    .order("period_end", { ascending: false });

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.periodFrom) query = query.gte("period_end", filters.periodFrom);
  if (filters.periodTo) query = query.lte("period_start", filters.periodTo);
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    query = query.or(
      `description.ilike.${term},particulars.ilike.${term},areas.ilike.${term}`,
    );
  }

  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw error;
  if (!data || data.length === 0) return { rows: [], totalCount: count ?? 0 };

  const ids = data.map((r) => (r as { id: string }).id);
  const { data: members, error: memErr } = await supabase
    .schema("hris")
    .from("job_order_payroll_members")
    .select("payroll_id, daily_rate, days, sss_ss, sss_ec")
    .in("payroll_id", ids);
  if (memErr) throw memErr;

  const byPayroll = new Map<
    string,
    { rate: number | null; days: number | null; sss_ss: number | null; sss_ec: number | null }[]
  >();
  for (const m of members ?? []) {
    const row = m as Record<string, unknown>;
    const key = row.payroll_id as string;
    const list = byPayroll.get(key) ?? [];
    list.push({
      rate: toNumber(row.daily_rate),
      days: toNumber(row.days),
      sss_ss: toNumber(row.sss_ss),
      sss_ec: toNumber(row.sss_ec),
    });
    byPayroll.set(key, list);
  }

  const rows: JobOrderPayroll[] = data.map((raw) => {
    const p = raw as unknown as JobOrderPayroll;
    const list = byPayroll.get(p.id) ?? [];
    const totals = summarizeMembers(list);
    return {
      ...p,
      days: toNumber((raw as Record<string, unknown>).days),
      member_count: list.length,
      total_gross: totals.gross,
      total_sss: totals.sss,
      total_net: totals.net,
    };
  });

  return { rows, totalCount: count ?? 0 };
}

export async function getJobOrderPayrollById(id: string): Promise<{
  payroll: JobOrderPayroll | null;
  members: JobOrderPayrollMember[];
}> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { payroll: null, members: [] };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("job_order_payrolls")
    .select(PAYROLL_SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { payroll: null, members: [] };

  const members = await loadMembers(supabase, id);
  const totals = summarizeMembers(
    members.map((m) => ({
      rate: m.daily_rate,
      days: m.days,
      sss_ss: m.sss_ss,
      sss_ec: m.sss_ec,
    })),
  );

  return {
    payroll: {
      ...(data as unknown as JobOrderPayroll),
      days: toNumber((data as Record<string, unknown>).days),
      member_count: members.length,
      total_gross: totals.gross,
      total_sss: totals.sss,
      total_net: totals.net,
    },
    members,
  };
}

export async function getJobOrderAreasForPicker(): Promise<JobOrderAreaOption[]> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return [];

  const supabase = createAdminClient();
  const { data: areas, error } = await supabase
    .schema("hris")
    .from("job_order_areas")
    .select("id, name")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("name");
  if (error) throw error;

  const { data: emps, error: empErr } = await supabase
    .schema("hris")
    .from("job_order_employees")
    .select("area_id")
    .eq("status", "active")
    .is("deleted_at", null);
  if (empErr) throw empErr;

  const counts = new Map<string, number>();
  for (const e of emps ?? []) {
    const key = (e as { area_id: string }).area_id;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return (areas ?? []).map((a) => {
    const area = a as { id: string; name: string };
    return {
      id: area.id,
      name: area.name,
      active_employee_count: counts.get(area.id) ?? 0,
    };
  });
}

// ── Writes ───────────────────────────────────────────────────────────

/**
 * Roster rows shaped for snapshotting. Numerics converted; area flattened.
 *
 * Paged with .range() in chunks of 1000 because supabase/config.toml caps
 * PostgREST's max_rows at 1000. An unpaginated select would silently truncate
 * once the roster passes that — it is ~578 rows today. `getAddableJobOrders`
 * calls this with no filter at all, so it is the first caller that would hit
 * the cap. Same pattern and same reason as job-order-actions.ts:104.
 * `full_name` does not uniquely order rows, so `id` is the tiebreaker that
 * keeps page boundaries stable.
 */
export async function loadJobOrdersForSnapshot(
  supabase: ReturnType<typeof createAdminClient>,
  where: { areaIds?: string[]; ids?: string[] },
): Promise<JobOrderEmployee[]> {
  const PAGE_SIZE = 1000;
  const collected: Record<string, unknown>[] = [];
  let from = 0;

  for (;;) {
    let query = supabase
      .schema("hris")
      .from("job_order_employees")
      .select(JO_SELECT_FOR_SNAPSHOT)
      .eq("status", "active")
      .is("deleted_at", null);

    if (where.areaIds) query = query.in("area_id", where.areaIds);
    if (where.ids) query = query.in("id", where.ids);

    const { data, error } = await query
      .order("full_name")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const batch = (data ?? []) as Record<string, unknown>[];
    collected.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return collected.map((raw) => {
    const r = raw as Record<string, unknown>;
    const area = r.job_order_areas as { name: string } | null;
    const { job_order_areas: _drop, ...rest } = r;
    return {
      ...(rest as unknown as JobOrderEmployee),
      area_name: area?.name ?? null,
      daily_rate: toNumber(r.daily_rate),
      previous_daily_rate: toNumber(r.previous_daily_rate),
      sss_ss: toNumber(r.sss_ss),
      sss_ec: toNumber(r.sss_ec),
    };
  });
}

export async function createJobOrderPayroll(
  input: JobOrderPayrollCreateValues,
): Promise<{ data?: { id: string }; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

  const parsed = jobOrderPayrollCreateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? "Invalid payroll data",
    };
  }
  const v = parsed.data;

  const supabase = createAdminClient();
  const roster = await loadJobOrdersForSnapshot(supabase, {
    areaIds: v.area_ids,
  });
  if (roster.length === 0) {
    return { error: "The selected areas have no active Job Order employees" };
  }

  const { data: created, error } = await supabase
    .schema("hris")
    .from("job_order_payrolls")
    .insert({
      period_start: v.period_start,
      period_end: v.period_end,
      days: v.days,
      description: v.description,
      particulars: v.particulars,
      payroll_date: v.payroll_date,
      status: "draft",
      created_by: user!.id,
      updated_by: user!.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const payrollId = (created as { id: string }).id;

  // Members inherit the payroll's `days` (10,971 of 11,015 legacy member rows
  // carry one); `hours` starts NULL because overtime is the exception — only
  // 83 legacy rows have it.
  const rows = roster.map((jo) => ({
    payroll_id: payrollId,
    job_order_employee_id: jo.id,
    days: v.days,
    hours: null,
    ...toPayrollMemberSnapshot(jo),
  }));

  const { error: memErr } = await supabase
    .schema("hris")
    .from("job_order_payroll_members")
    .insert(rows);
  if (memErr) {
    await cleanupOrphanedPayroll(supabase, payrollId);
    return { error: memErr.message };
  }

  await recomputeAreas(supabase, payrollId);

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "create",
    tableName: "job_order_payrolls",
    recordId: payrollId,
    newValues: { period: `${v.period_start}..${v.period_end}`, members: rows.length },
  });

  revalidatePath("/job-orders/payroll");
  return { data: { id: payrollId } };
}

export async function updateJobOrderPayroll(
  id: string,
  input: JobOrderPayrollMetadataValues,
): Promise<{ success?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

  const parsed = jobOrderPayrollMetadataSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid payroll data" };
  }

  const supabase = createAdminClient();
  const blocked = await assertDraft(supabase, id);
  if (blocked) return { error: blocked };

  const v = parsed.data;
  const { error } = await supabase
    .schema("hris")
    .from("job_order_payrolls")
    .update({
      period_start: v.period_start,
      period_end: v.period_end,
      days: v.days,
      description: v.description,
      particulars: v.particulars,
      payroll_date: v.payroll_date,
      updated_by: user!.id,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "update",
    tableName: "job_order_payrolls",
    recordId: id,
    newValues: v as unknown as Record<string, unknown>,
  });

  revalidatePath("/job-orders/payroll");
  revalidatePath(`/job-orders/payroll/${id}`);
  return { success: true };
}

/**
 * Clone a payroll's member snapshots into a new draft for a new period. Rates
 * come from the SOURCE payroll, not the roster, so duplicating is
 * reproducible; "Refresh from roster" is the explicit way to pull current
 * values.
 */
export async function duplicateJobOrderPayroll(
  sourceId: string,
  metadata: JobOrderPayrollMetadataValues,
): Promise<{ data?: { id: string }; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

  const parsed = jobOrderPayrollMetadataSchema.safeParse(metadata);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid payroll data" };
  }
  const v = parsed.data;

  const supabase = createAdminClient();
  const { data: src, error: srcErr } = await supabase
    .schema("hris")
    .from("job_order_payrolls")
    .select("id, particulars, description")
    .eq("id", sourceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (srcErr) return { error: srcErr.message };
  if (!src) return { error: "Source payroll not found" };

  const srcMembers = await loadMembers(supabase, sourceId);

  const { data: created, error } = await supabase
    .schema("hris")
    .from("job_order_payrolls")
    .insert({
      period_start: v.period_start,
      period_end: v.period_end,
      days: v.days,
      description:
        v.description ?? (src as { description: string | null }).description,
      particulars:
        v.particulars ?? (src as { particulars: string | null }).particulars,
      payroll_date: v.payroll_date,
      status: "draft",
      created_by: user!.id,
      updated_by: user!.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const newId = (created as { id: string }).id;

  if (srcMembers.length > 0) {
    const rows = srcMembers.map((m) => ({
      payroll_id: newId,
      job_order_employee_id: m.job_order_employee_id,
      // New period, so days resets to the new payroll's default and overtime
      // starts clean — carrying either across would silently re-pay it.
      days: v.days,
      hours: null,
      full_name: m.full_name,
      area_name: m.area_name,
      sub_area: m.sub_area,
      daily_rate: m.daily_rate,
      sss_no: m.sss_no,
      sss_ss: m.sss_ss,
      sss_ec: m.sss_ec,
      has_atm: m.has_atm,
      landbank_account_number: m.landbank_account_number,
      community_tax_number: m.community_tax_number,
      community_tax_date: m.community_tax_date,
      community_tax_place_issued: m.community_tax_place_issued,
    }));
    const { error: memErr } = await supabase
      .schema("hris")
      .from("job_order_payroll_members")
      .insert(rows);
    if (memErr) {
      await cleanupOrphanedPayroll(supabase, newId);
      return { error: memErr.message };
    }
  }

  await recomputeAreas(supabase, newId);

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "duplicate",
    tableName: "job_order_payrolls",
    recordId: newId,
    newValues: { source_id: sourceId, members: srcMembers.length },
  });

  revalidatePath("/job-orders/payroll");
  return { data: { id: newId } };
}

export async function finalizeJobOrderPayroll(
  id: string,
): Promise<{ success?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

  const supabase = createAdminClient();
  const blocked = await assertDraft(supabase, id);
  if (blocked) return { error: blocked };

  const members = await loadMembers(supabase, id);
  if (members.length === 0) {
    return { error: "Cannot finalize a payroll with no members" };
  }

  const { error } = await supabase
    .schema("hris")
    .from("job_order_payrolls")
    .update({
      status: "finalized",
      finalized_at: new Date().toISOString(),
      finalized_by: user!.id,
      updated_by: user!.id,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "finalize",
    tableName: "job_order_payrolls",
    recordId: id,
    newValues: { members: members.length },
  });

  revalidatePath("/job-orders/payroll");
  revalidatePath(`/job-orders/payroll/${id}`);
  return { success: true };
}

/** super_admin only. Unlocks an issued record, so it is audited explicitly. */
export async function reopenJobOrderPayroll(
  id: string,
): Promise<{ success?: true; error?: string }> {
  const user = await getCurrentUser();
  if (user?.role !== "super_admin") return { error: "Unauthorized" };

  const supabase = createAdminClient();
  const { data: current, error: readErr } = await supabase
    .schema("hris")
    .from("job_order_payrolls")
    .select("status, finalized_at, finalized_by")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!current) return { error: "Payroll not found" };
  if ((current as { status: string }).status !== "finalized") {
    return { error: "This payroll is already a draft" };
  }

  const { error } = await supabase
    .schema("hris")
    .from("job_order_payrolls")
    .update({
      status: "draft",
      finalized_at: null,
      finalized_by: null,
      updated_by: user.id,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "reopen",
    tableName: "job_order_payrolls",
    recordId: id,
    oldValues: current as unknown as Record<string, unknown>,
  });

  revalidatePath("/job-orders/payroll");
  revalidatePath(`/job-orders/payroll/${id}`);
  return { success: true };
}

/** super_admin only, soft delete. */
export async function deleteJobOrderPayroll(
  id: string,
): Promise<{ success?: true; error?: string }> {
  const user = await getCurrentUser();
  if (user?.role !== "super_admin") return { error: "Unauthorized" };

  const supabase = createAdminClient();
  // Only soft-delete a row that is actually there and not already deleted, so
  // a stale row action cannot fabricate an audit entry for a phantom record —
  // the defect fixed for areas and employees in commit 891678f.
  const { data: existing, error: readErr } = await supabase
    .schema("hris")
    .from("job_order_payrolls")
    .select("id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!existing) return { error: "Payroll not found" };

  const { error } = await supabase
    .schema("hris")
    .from("job_order_payrolls")
    .update({ deleted_at: new Date().toISOString(), updated_by: user.id })
    .eq("id", id);
  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "delete",
    tableName: "job_order_payrolls",
    recordId: id,
  });

  revalidatePath("/job-orders/payroll");
  return { success: true };
}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

Expected: no new errors. Two things to watch:

- If `getCurrentUser()` returns a nullable user type that makes `user!.id` a lint error, replace the non-null assertions with an early `if (!user) return { error: "Unauthorized" };` before the `canManageJobOrders` check.
- `npm run build` (not just `tsc`) is what catches an illegal `"use server"` export. If it complains that a non-async value is exported from the actions module, that value belongs in `job-order-payroll-queries.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/job-order-payroll-queries.ts src/lib/actions/job-order-payroll-actions.ts
git commit -m "feat(jo): add payroll server actions with draft lifecycle"
```

---

### Task 5: Member-level server actions

**Files:**
- Create: `src/lib/actions/job-order-payroll-member-actions.ts`

**Interfaces:**
- Consumes: `assertDraft`, `loadMembers`, `recomputeAreas`, `loadJobOrdersForSnapshot`, `shapeMember`, `MEMBER_SELECT` from Task 4; `toPayrollMemberSnapshot` from Task 2; `jobOrderPayrollMemberSchema` from Task 3
- Produces: `addJobOrderPayrollMember`, `updateJobOrderPayrollMember`, `removeJobOrderPayrollMember`, `refreshMembersFromRoster`, `getAddableJobOrders`

- [ ] **Step 1: Write the actions**

Create `src/lib/actions/job-order-payroll-member-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageJobOrders } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { toPayrollMemberSnapshot } from "@/lib/job-order-payroll-helpers";
import {
  assertDraft,
  loadJobOrdersForSnapshot,
  loadMembers,
  recomputeAreas,
} from "@/lib/actions/job-order-payroll-actions";
import {
  jobOrderPayrollMemberSchema,
  type JobOrderPayrollMemberValues,
} from "@/lib/validations/job-order-payroll-schema";
import type { JobOrderEmployee } from "@/lib/types";

function revalidate(payrollId: string) {
  revalidatePath("/job-orders/payroll");
  revalidatePath(`/job-orders/payroll/${payrollId}`);
}

/** Active JOs not already on this payroll, for the "Add member" search. */
export async function getAddableJobOrders(
  payrollId: string,
): Promise<JobOrderEmployee[]> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return [];

  const supabase = createAdminClient();
  const existing = await loadMembers(supabase, payrollId);
  const taken = new Set(
    existing
      .map((m) => m.job_order_employee_id)
      .filter((id): id is string => id != null),
  );

  const roster = await loadJobOrdersForSnapshot(supabase, {});
  return roster.filter((jo) => !taken.has(jo.id));
}

export async function addJobOrderPayrollMember(
  payrollId: string,
  jobOrderEmployeeId: string,
): Promise<{ success?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

  const supabase = createAdminClient();
  const blocked = await assertDraft(supabase, payrollId);
  if (blocked) return { error: blocked };

  const [jo] = await loadJobOrdersForSnapshot(supabase, {
    ids: [jobOrderEmployeeId],
  });
  if (!jo) return { error: "Job Order employee not found or inactive" };

  const { data: payroll, error: payrollErr } = await supabase
    .schema("hris")
    .from("job_order_payrolls")
    .select("days")
    .eq("id", payrollId)
    .maybeSingle();
  if (payrollErr) {
    // Not fatal — the member is still worth adding — but without this the
    // row silently gets days: null instead of the payroll's default.
    console.error(
      `addJobOrderPayrollMember: days lookup failed for payroll ${payrollId}: ${payrollErr.message}`,
    );
  }

  // .select() chained so the audit entry can record the member row's own id
  // rather than the payroll's — otherwise an auditor can see which payroll
  // and which employee, but not which row was created.
  const { data: inserted, error } = await supabase
    .schema("hris")
    .from("job_order_payroll_members")
    .insert({
      payroll_id: payrollId,
      job_order_employee_id: jo.id,
      days: (payroll as { days: number | string | null } | null)?.days ?? null,
      hours: null,
      ...toPayrollMemberSnapshot(jo),
    })
    .select("id")
    .single();
  if (error) {
    // uq_job_order_payroll_members — a plain UNIQUE, so this is the only way
    // a duplicate can surface.
    if (error.code === "23505") {
      return { error: "That employee is already on this payroll" };
    }
    return { error: error.message };
  }

  await recomputeAreas(supabase, payrollId);
  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "create",
    tableName: "job_order_payroll_members",
    // Falls back to the payroll id if the select somehow returned nothing;
    // a missing audit id must not fail an insert that already succeeded.
    recordId: (inserted as { id: string } | null)?.id ?? payrollId,
    newValues: { job_order_employee_id: jo.id, full_name: jo.full_name },
  });

  revalidate(payrollId);
  return { success: true };
}

export async function updateJobOrderPayrollMember(
  memberId: string,
  input: JobOrderPayrollMemberValues,
): Promise<{ success?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

  const parsed = jobOrderPayrollMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid member data" };
  }

  const supabase = createAdminClient();
  const { data: member, error: readErr } = await supabase
    .schema("hris")
    .from("job_order_payroll_members")
    .select("id, payroll_id")
    .eq("id", memberId)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!member) return { error: "Member not found" };

  const payrollId = (member as { payroll_id: string }).payroll_id;
  const blocked = await assertDraft(supabase, payrollId);
  if (blocked) return { error: blocked };

  const { error } = await supabase
    .schema("hris")
    .from("job_order_payroll_members")
    .update({
      days: parsed.data.days,
      hours: parsed.data.hours,
      // Snapshot correction only. Never written back to job_order_employees.
      daily_rate: parsed.data.daily_rate,
    })
    .eq("id", memberId);
  if (error) return { error: error.message };

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "update",
    tableName: "job_order_payroll_members",
    recordId: memberId,
    newValues: parsed.data as unknown as Record<string, unknown>,
  });

  revalidate(payrollId);
  return { success: true };
}

export async function removeJobOrderPayrollMember(
  memberId: string,
): Promise<{ success?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

  const supabase = createAdminClient();
  const { data: member, error: readErr } = await supabase
    .schema("hris")
    .from("job_order_payroll_members")
    .select("id, payroll_id, full_name")
    .eq("id", memberId)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!member) return { error: "Member not found" };

  const payrollId = (member as { payroll_id: string }).payroll_id;
  const blocked = await assertDraft(supabase, payrollId);
  if (blocked) return { error: blocked };

  const { error } = await supabase
    .schema("hris")
    .from("job_order_payroll_members")
    .delete()
    .eq("id", memberId);
  if (error) return { error: error.message };

  await recomputeAreas(supabase, payrollId);
  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "delete",
    tableName: "job_order_payroll_members",
    recordId: memberId,
    oldValues: { full_name: (member as { full_name: string }).full_name },
  });

  revalidate(payrollId);
  return { success: true };
}

/**
 * Re-copy the snapshot for members still linked to a live roster row.
 *
 * Deliberately never adds or removes members: a JO newly hired into the area
 * does not appear, and one who became inactive is not dropped. Membership
 * stays the user's explicit decision; this refreshes values only.
 */
export async function refreshMembersFromRoster(
  payrollId: string,
): Promise<{ updated?: number; skipped?: number; error?: string }> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

  const supabase = createAdminClient();
  const blocked = await assertDraft(supabase, payrollId);
  if (blocked) return { error: blocked };

  const members = await loadMembers(supabase, payrollId);
  const linked = members.filter((m) => m.job_order_employee_id != null);
  const skipped = members.length - linked.length;
  if (linked.length === 0) return { updated: 0, skipped };

  // No deleted_at filter beyond what loadJobOrdersForSnapshot applies: a
  // member whose JO was soft-deleted simply does not come back and is counted
  // as skipped, rather than being wiped.
  const roster = await loadJobOrdersForSnapshot(supabase, {
    ids: linked.map((m) => m.job_order_employee_id!),
  });
  const byId = new Map(roster.map((jo) => [jo.id, jo]));

  let updated = 0;
  let missing = 0;
  let failed = 0;
  for (const m of linked) {
    const jo = byId.get(m.job_order_employee_id!);
    if (!jo) {
      missing += 1;
      continue;
    }
    const snap = toPayrollMemberSnapshot(jo);
    const changed =
      snap.full_name !== m.full_name ||
      snap.area_name !== m.area_name ||
      snap.sub_area !== m.sub_area ||
      snap.daily_rate !== m.daily_rate ||
      snap.sss_no !== m.sss_no ||
      snap.sss_ss !== m.sss_ss ||
      snap.sss_ec !== m.sss_ec ||
      snap.has_atm !== m.has_atm ||
      snap.landbank_account_number !== m.landbank_account_number ||
      snap.community_tax_number !== m.community_tax_number ||
      snap.community_tax_date !== m.community_tax_date ||
      snap.community_tax_place_issued !== m.community_tax_place_issued;
    if (!changed) continue;

    const { error } = await supabase
      .schema("hris")
      .from("job_order_payroll_members")
      .update(snap)
      .eq("id", m.id);
    if (error) {
      // Log and continue, never early-return. Bailing here would leave the
      // members already updated in this loop carrying new snapshot values —
      // possibly a changed area_name — while skipping the recomputeAreas()
      // and logAudit() calls below, so the payroll would keep a stale
      // `areas` search label and have no audit trail for writes that did
      // land. Failures fold into `skipped` so the counts still reconcile
      // against members.length.
      console.error(
        `refreshMembersFromRoster: member ${m.id} on payroll ${payrollId} failed: ${error.message}`,
      );
      failed += 1;
      continue;
    }
    updated += 1;
  }

  await recomputeAreas(supabase, payrollId);
  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "update",
    tableName: "job_order_payroll_members",
    recordId: payrollId,
    newValues: { refreshed: updated, skipped: skipped + missing },
  });

  revalidate(payrollId);
  return { updated, skipped: skipped + missing };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

Expected: no new errors. The four helpers imported from `job-order-payroll-actions.ts` (`assertDraft`, `loadMembers`, `recomputeAreas`, `loadJobOrdersForSnapshot`) are all async, so importing them across `"use server"` boundaries is legal; the sync ones already live in `job-order-payroll-queries.ts` from Task 4.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/job-order-payroll-member-actions.ts
git commit -m "feat(jo): add payroll member actions with roster refresh"
```

---

### Task 6: PDF rewiring and the DRAFT watermark

**Files:**
- Modify: `src/lib/pdf/generateJobOrderPayroll.ts`

**Interfaces:**
- Consumes: `JobOrderPayrollPrintRow`, `toPrintRow` from Task 2
- Produces: a `draft?: boolean` option on every generator's params, rendering a diagonal DRAFT watermark

- [ ] **Step 1: Add the watermark**

In `src/lib/pdf/generateJobOrderPayroll.ts`, add to the shared params interface (`GenerateJoPayrollPrintParams`, around line 60):

```ts
  /** Renders a diagonal DRAFT watermark. Set when payroll.status === "draft". */
  draft?: boolean;
```

Add the shared element near the other shared helpers:

```tsx
const watermarkStyle = {
  position: "absolute" as const,
  top: "45%",
  left: 0,
  right: 0,
  textAlign: "center" as const,
  fontSize: 72,
  color: "#e5e5e5",
  transform: "rotate(-30deg)",
  opacity: 0.5,
};

/** Rendered first inside each Page so it sits behind the table content. */
function DraftWatermark({ show }: { show?: boolean }) {
  if (!show) return null;
  return <Text style={watermarkStyle}>DRAFT</Text>;
}
```

Then render `<DraftWatermark show={draft} />` as the first child of the `<Page>` in each of the ten generators: `generateJoPayrollPrint`, `generateJoPayrollNoSssPrint`, `generateJoPayrollByDeptPrint`, `generateJoPayrollSummaryPrint`, `generateJoPayrollNoAtmPrint`, `generateJoPayrollOvertimePrint`, `generateJoPayrollOvertimeNoAtmPrint`, `generateJoPayrollSummaryOvertimePrint`, `generateJoPayrollObrPrint`, `generateJoPayrollObrOvertimePrint`.

Several of these delegate to a shared inner renderer — add it once there and pass `draft` through rather than repeating it ten times.

- [ ] **Step 2: Verify the PDFs still render**

```bash
npx tsc --noEmit && npm run build
```

Expected: no errors. `@react-pdf/renderer` accepts `position: "absolute"` and `transform` on `Text`; if the build rejects `transform`, drop it and keep the centered grey text — the watermark's job is to be unmistakable, not rotated.

- [ ] **Step 3: Commit**

```bash
git add src/lib/pdf/generateJobOrderPayroll.ts
git commit -m "feat(jo): add DRAFT watermark to payroll printables"
```

---

### Task 7: List page, columns and the create dialog

**Files:**
- Create: `src/components/tables/columns/job-order-payroll-columns.tsx`
- Create: `src/components/job-orders/payroll/job-order-payroll-list-client.tsx`
- Create: `src/components/job-orders/payroll/job-order-payroll-create-dialog.tsx`
- Create: `src/app/(dashboard)/job-orders/payroll/page.tsx`
- Create: `src/lib/actions/holiday-lookup-actions.ts` (or reuse the existing holiday action if one already exports a range query — check `src/lib/actions/attendance-actions.ts` first and reuse rather than duplicate)

**Interfaces:**
- Consumes: `getJobOrderPayrolls`, `getJobOrderAreasForPicker`, `createJobOrderPayroll`, `deleteJobOrderPayroll` from Task 4; `countWeekdays` from Task 2; `JobOrderPayroll`, `JobOrderAreaOption` from Task 3
- Produces: route `/job-orders/payroll`; `jobOrderPayrollColumns(handlers)`

- [ ] **Step 1: Check for an existing holiday range query**

```bash
grep -rn "holidays" src/lib/actions/*.ts | head
```

If an action already selects `hris.holidays` by date range, reuse it. Only create `getHolidaysInRange(startIso, endIso)` if none exists:

```ts
"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";

export interface HolidayInRange {
  date: string;
  name: string;
  type: "full" | "half_am" | "half_pm";
}

/** Advisory only — the payroll never deducts these automatically. */
export async function getHolidaysInRange(
  startIso: string,
  endIso: string,
): Promise<HolidayInRange[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = createAdminClient();
  const { data } = await supabase
    .schema("hris")
    .from("holidays")
    .select("date, name, type")
    .gte("date", startIso)
    .lte("date", endIso)
    .order("date");
  return (data ?? []) as HolidayInRange[];
}
```

- [ ] **Step 2: Build the columns**

Create `src/components/tables/columns/job-order-payroll-columns.tsx`:

```tsx
"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { MoreHorizontal, Eye, Copy, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import type { JobOrderPayroll } from "@/lib/types";

function fmtDate(d: string | null): string {
  return d ? format(new Date(`${d}T00:00:00`), "MMM d, yyyy") : "—";
}

function fmtMoney(n: number): string {
  return n.toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

export function jobOrderPayrollColumns(handlers: {
  onView: (p: JobOrderPayroll) => void;
  onDuplicate: (p: JobOrderPayroll) => void;
  onDelete: (p: JobOrderPayroll) => void;
  canDelete: boolean;
}): ColumnDef<JobOrderPayroll>[] {
  return [
    {
      id: "period",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Period" />
      ),
      cell: ({ row }) => (
        <span className="font-medium whitespace-nowrap">
          {fmtDate(row.original.period_start)} – {fmtDate(row.original.period_end)}
        </span>
      ),
    },
    {
      id: "description",
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => row.original.description ?? "—",
    },
    {
      id: "areas",
      header: "Areas",
      cell: ({ row }) => (
        <span className="block max-w-[22rem] truncate text-muted-foreground">
          {row.original.areas ?? "—"}
        </span>
      ),
    },
    {
      id: "days",
      header: "Days",
      cell: ({ row }) => row.original.days ?? "—",
    },
    {
      id: "member_count",
      header: "Members",
      cell: ({ row }) => row.original.member_count,
    },
    {
      id: "total_net",
      header: "Net total",
      cell: ({ row }) => (
        <span className="tabular-nums">{fmtMoney(row.original.total_net)}</span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Badge
            variant={row.original.status === "finalized" ? "default" : "secondary"}
          >
            {row.original.status === "finalized" ? "Finalized" : "Draft"}
          </Badge>
          {row.original.is_reconstructed && (
            <Badge
              variant="outline"
              title="Imported from the legacy system and priced at the employee's rate at import time — a reconstruction, not the original record."
            >
              Reconstructed
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: "payroll_date",
      header: "Payroll date",
      cell: ({ row }) => fmtDate(row.original.payroll_date),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handlers.onView(row.original)}>
              <Eye className="mr-2 h-4 w-4" /> Open
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handlers.onDuplicate(row.original)}>
              <Copy className="mr-2 h-4 w-4" /> Duplicate
            </DropdownMenuItem>
            {handlers.canDelete && (
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => handlers.onDelete(row.original)}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
}
```

- [ ] **Step 3: Build the create dialog**

Create `src/components/job-orders/payroll/job-order-payroll-create-dialog.tsx`. It is a `"use client"` component using react-hook-form + zodResolver with `jobOrderPayrollCreateSchema`. Required behaviour:

- On every change to `period_start` or `period_end`, if the user has not manually edited `days`, set `days` to `countWeekdays(period_start, period_end)`. Track "manually edited" with a `useRef<boolean>` flipped in the `days` field's `onChange`, so recomputing never clobbers a deliberate value.
- When both dates are valid, call `getHolidaysInRange` and render the results under the `days` field as: `ⓘ N holidays in this period:` then one line per holiday `MMM d — {name} ({type})`, followed by the literal sentence `Not deducted automatically.`
- Area multi-select: render `JobOrderAreaOption[]` as checkbox rows `{name} ({active_employee_count})`, with a live `→ N members` total beneath. Disable submit when the total is 0.
- On submit call `createJobOrderPayroll` and on success `router.push(\`/job-orders/payroll/${data.id}\`)`; on error `toast.error(error)`.

Follow the structure of `src/components/job-orders/job-order-form.tsx` for the shadcn `Form` + `FormField` wiring and the submit/loading pattern.

- [ ] **Step 4: Build the list client and page**

Create `src/components/job-orders/payroll/job-order-payroll-list-client.tsx` following `src/components/job-orders/job-order-list-client.tsx`: a table driven by `jobOrderPayrollColumns`, a "New payroll" button opening the create dialog, a status `Select` (All / Draft / Finalized), a period-range pair of date inputs, a search box, and an `AlertDialog` for delete. Because pagination is server-side, filter/page changes call `router.push` with updated `searchParams` rather than filtering in memory.

> **Correction, made during execution.** This step originally said to compose
> the shared `<DataTable>`. That contradicted this plan's own server-side
> pagination requirement. `src/components/tables/data-table.tsx` hardwires
> `getPaginationRowModel()` and its props are only
> `columns / data / totalCount / filterableColumns / searchableColumns /
> isLoading / toolbar / fillHeight / initialColumnVisibility` — there is no
> `manualPagination`, `pageCount`, or `onPaginationChange`. It can only
> paginate an array it already holds.
>
> Server-paginated lists in this repo already bypass it:
> `payroll-list-client.tsx` and `cos-payroll-list-client.tsx` both hand-roll
> plain shadcn `<Table>` markup with URL-driven paging. This module instead
> drives `useReactTable` + `flexRender` directly, so it still reuses the
> column definitions those two duplicate by hand.
>
> Bypassing `<DataTable>` is correct **here specifically, because the list is
> server-paginated**. The project convention still stands for every
> client-paginated list: add a columns file and compose `<DataTable>`.

Create `src/app/(dashboard)/job-orders/payroll/page.tsx`:

```tsx
import { redirect } from "next/navigation";

import { getServerUser } from "@/lib/auth";
import { canManageJobOrders } from "@/lib/auth-helpers";
import {
  getJobOrderAreasForPicker,
  getJobOrderPayrolls,
} from "@/lib/actions/job-order-payroll-actions";
import { JobOrderPayrollListClient } from "@/components/job-orders/payroll/job-order-payroll-list-client";

export default async function JobOrderPayrollPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getServerUser();
  if (!canManageJobOrders(user?.role)) redirect("/dashboard");

  // Next 16: searchParams is async — await before destructuring.
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]);

  const page = Number(one("page") ?? "1") || 1;
  const status = (one("status") ?? "all") as "all" | "draft" | "finalized";

  const [{ rows, totalCount }, areas] = await Promise.all([
    getJobOrderPayrolls({
      page,
      status,
      periodFrom: one("from") ?? null,
      periodTo: one("to") ?? null,
      search: one("q") ?? null,
    }),
    getJobOrderAreasForPicker(),
  ]);

  return (
    <JobOrderPayrollListClient
      payrolls={rows}
      totalCount={totalCount}
      page={page}
      areas={areas}
      canDelete={user?.role === "super_admin"}
    />
  );
}
```

Check `src/app/(dashboard)/job-orders/page.tsx` for the exact auth-guard idiom this project uses and match it rather than the sketch above if they differ.

- [ ] **Step 5: Verify**

```bash
npm run lint && npm run build
```

Then with the dev server running, visit `/job-orders/payroll`, create a payroll selecting two areas, and confirm: the member count preview matches, `days` auto-fills, holidays list when the period contains one, and you land on the detail route.

- [ ] **Step 6: Commit**

```bash
git add src/components/tables/columns/job-order-payroll-columns.tsx src/components/job-orders/payroll src/app/\(dashboard\)/job-orders/payroll src/lib/actions/holiday-lookup-actions.ts
git commit -m "feat(jo): add payroll list page and area-based create flow"
```

---

### Task 8: Detail page, members table and sidebar

**Files:**
- Create: `src/app/(dashboard)/job-orders/payroll/[id]/page.tsx`
- Create: `src/components/job-orders/payroll/job-order-payroll-detail-client.tsx`
- Create: `src/components/job-orders/payroll/job-order-payroll-members-table.tsx`
- Modify: `src/components/layout/app-sidebar.tsx`

**Interfaces:**
- Consumes: `getJobOrderPayrollById` (Task 4), all Task 5 member actions, the ten generators from Task 6
- Produces: route `/job-orders/payroll/[id]`; sidebar entry under the Job Orders group

- [ ] **Step 1: Build the detail page**

Create `src/app/(dashboard)/job-orders/payroll/[id]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";

import { getServerUser } from "@/lib/auth";
import { canManageJobOrders } from "@/lib/auth-helpers";
import { getJobOrderPayrollById } from "@/lib/actions/job-order-payroll-actions";
import { JobOrderPayrollDetailClient } from "@/components/job-orders/payroll/job-order-payroll-detail-client";

export default async function JobOrderPayrollDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getServerUser();
  if (!canManageJobOrders(user?.role)) redirect("/dashboard");

  // Next 16: params is async — await before destructuring.
  const { id } = await params;
  const { payroll, members } = await getJobOrderPayrollById(id);
  if (!payroll) notFound();

  return (
    <JobOrderPayrollDetailClient
      payroll={payroll}
      members={members}
      isSuperAdmin={user?.role === "super_admin"}
    />
  );
}
```

- [ ] **Step 2: Build the detail client**

Create `src/components/job-orders/payroll/job-order-payroll-detail-client.tsx`. Required behaviour:

- Header: period, `Draft`/`Finalized` badge, `Reconstructed` badge when `is_reconstructed`, and gross / SSS / net totals plus member count.
- Action bar: **Edit details** (dialog reusing `jobOrderPayrollMetadataSchema` → `updateJobOrderPayroll`), **Refresh from roster** (→ `refreshMembersFromRoster`, then `toast.success(\`Refreshed ${updated} member(s), skipped ${skipped}\`)`), **Duplicate**, **Finalize** / **Reopen**, **Delete**, and a **Print** dropdown listing the ten variants.
- `isDraft = payroll.status === "draft"`. When false, hide or disable Edit, Refresh, Finalize, Add member, and every inline input; show **Reopen** only when `isSuperAdmin`. Show **Delete** only when `isSuperAdmin`.
- Finalize and Reopen are confirmed through `AlertDialog`. Finalize's copy must state that the payroll becomes read-only and that only a super admin can reopen it.
- Every print call passes `draft: isDraft` and `members.map(toPrintRow)`.

- [ ] **Step 3: Build the members table**

Create `src/components/job-orders/payroll/job-order-payroll-members-table.tsx`. Rows are grouped under an area subheading (members arrive already ordered by `area_name` then `full_name`, so group by walking the list — do not re-sort). Each row shows name, sub-area, and inline number inputs for `days`, `hours` and `rate`, plus computed gross / SSS / net for that row using `computeJoGross`, `computeJoSssDeduction` and `computeJoNetAmount`.

Inline edits call `updateJobOrderPayrollMember` on blur (not on every keystroke) and `router.refresh()` on success. A remove button per row calls `removeJobOrderPayrollMember` behind an `AlertDialog`. An **Add member** button opens a searchable list populated by `getAddableJobOrders(payroll.id)`.

When `job_order_employee_id` is null, render a small muted note on the row reading `Roster link removed — snapshot preserved`, so it is obvious why Refresh skips it.

- [ ] **Step 4: Add the sidebar entry**

In `src/components/layout/app-sidebar.tsx`, inside the Job Orders group (the `items` array at line ~264, after "Job Order Employees" and the Areas entry), add:

```tsx
      { title: "Payroll", href: "/job-orders/payroll", icon: Hammer, roles: jobOrderRoles },
```

Re-add `Hammer` to the `lucide-react` import if Task 1 removed it. Verify the active-route highlight helper around line 396 does not now highlight "Job Order Employees" while `/job-orders/payroll` is open — that block already special-cases `/job-orders/areas`; extend the same condition to `/job-orders/payroll`.

- [ ] **Step 5: Verify**

```bash
npm run lint && npm run build
```

Manually: open a draft, edit a row's days, confirm totals update; click Finalize and confirm every input goes read-only and Edit/Refresh/Add disappear; as a non-super_admin confirm Reopen and Delete are absent; print one variant from a draft and confirm the DRAFT watermark, then finalize and confirm it is gone.

**Carried over from Task 6 — settle this here, it could not be verified there.**
Nothing called the print generators until now, so the watermark's multi-page
behaviour was untestable. In the six **non-paginated** generators
(`generateJoPayrollPrint`, `NoSss`, `ByDept`, `NoAtm`, `Overtime`,
`OvertimeNoAtm`) the watermark is `position: absolute; top: 45%` against the
whole `<body>`, so it lands once near the midpoint of the entire document
rather than once per printed page. The two paginated `.summary-page` variants
are already correct.

Build a draft payroll long enough to span **at least three printed pages**
(select the largest areas — legacy payrolls run to 130 members), open the
browser print preview, and check every page. If later pages are unmarked,
switch those six to a `position: fixed` watermark, which browsers repeat per
printed page, and re-check the preview — `fixed` has real cross-browser
variance in print, so confirm by looking, not by reasoning. Leave the two
`.summary-page` variants alone either way.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/job-orders/payroll/[id]" src/components/job-orders/payroll src/components/layout/app-sidebar.tsx
git commit -m "feat(jo): add payroll detail page, member editing and sidebar entry"
```

---

### Task 9: Legacy CSV import

**Files:**
- Create: `src/lib/actions/job-order-payroll-import-actions.ts`
- Create: `src/components/admin/job-order-payroll-import-client.tsx`
- Create: `src/app/(dashboard)/admin/job-order-payroll-import/page.tsx`
- Modify: `src/components/layout/app-sidebar.tsx` (admin group, beside "Job Order Import")

**Interfaces:**
- Consumes: `parseCsv` from `@/lib/parse-csv`; `normHeader`, `colIndex`, `parseMoney`, `parseFlexibleCsvDate` from `@/lib/csv-import-helpers`
- Produces: `importJobOrderPayrollCsv(payrollsCsv: string, membersCsv: string): Promise<JobOrderPayrollImportResult>`

- [ ] **Step 1: Write the import action**

Create `src/lib/actions/job-order-payroll-import-actions.ts`. The full mapping is in the spec's "Legacy import" section. The rules that must be implemented exactly:

```ts
export interface JobOrderPayrollImportResult {
  payrollsCreated: number;
  payrollsUpdated: number;
  payrollsSkippedEmpty: number;
  payrollsIsolated: { legacy_id: string; reason: string }[];
  membersCreated: number;
  membersUpdated: number;
  unresolvedMembers: { legacy_id: string; reason: string }[];
  warnings: string[];
}
```

1. **Parse both CSVs first**, payrolls then members. Build `membersByPayroll: Map<string, Row[]>` from the members file before deciding what to import.
2. **Selection rule:** import a payroll if it has at least one member **or** has a non-blank `deleted_at`. Everything else increments `payrollsSkippedEmpty`. This is 806 of 1,616 rows in the current export.
3. **Isolate, never fail a chunk** (commit `ca715f7`). A payroll is isolated with a reason when `parseFlexibleCsvDate` returns null for `from` or `to`, or when `period_end < period_start`. **Legacy payroll 11 (`12/06/1979` → `07/17/1979`) is the one row in today's export that hits the second rule** — it must be reported, not inserted, or the insert violates `chk_job_order_payroll_period`.
4. **Warn on out-of-range dates:** a parsed `period_start` outside 2020–2027 adds a warning naming the `legacy_id`. Exactly one row qualifies today.
5. **Warn on missing columns:** if an expected header is absent, push a warning naming the consequence (e.g. `"deleted_at column missing — legacy soft-deletes will not carry over"`). Never report a silent success.
6. Migrated payrolls set `status: "finalized"`, `is_reconstructed: true`, `payroll_date: null`, and preserve `created_at` and `deleted_at`.
7. **Upsert on `legacy_id`** with `.upsert(rows, { onConflict: "legacy_id" })` in chunks of 500. The unique indexes from Task 1 are non-partial precisely so this works.
8. **Resolve `jo_id` → `job_order_employees.id` WITHOUT a `deleted_at` filter.** Build the lookup with:

```ts
const { data: roster } = await supabase
  .schema("hris")
  .from("job_order_employees")
  .select("id, legacy_id, full_name, sub_area, daily_rate, sss_no, sss_ss, sss_ec, has_atm, landbank_account_number, community_tax_number, community_tax_date, community_tax_place_issued, job_order_areas(name)")
  .not("legacy_id", "is", null);
// NO .is("deleted_at", null) — 5,893 of 11,015 legacy member rows (54%) point
// at JOs that are soft-deleted in the roster. Filtering here would silently
// drop half the payroll history under a green summary.
```

Page through with `.range()` in chunks of 1000, because `supabase/config.toml` caps PostgREST `max_rows` at 1000 (same reason as `job-order-actions.ts:104`).

9. Each member row takes its snapshot from the resolved roster row at import time — this is what makes migrated payrolls reconstructions. A `jo_id` that does not resolve is pushed to `unresolvedMembers` and **not** inserted (`full_name` is `NOT NULL`; a nameless member cannot print). Today's export has 0 of these.
10. `weekends` and `holidays` columns are read and discarded — do not add columns for them.

- [ ] **Step 2: Build the import screen**

Create `src/components/admin/job-order-payroll-import-client.tsx` modelled on `src/components/admin/job-order-import-client.tsx`: two file inputs labelled "Payrolls CSV (`jopayrolls.csv`)" and "Members CSV (`jopayroll_members.csv`)", a single Import button, and a result panel rendering every field of `JobOrderPayrollImportResult` — including the isolated and unresolved lists, not just the counts.

Create `src/app/(dashboard)/admin/job-order-payroll-import/page.tsx` mirroring `src/app/(dashboard)/admin/job-order-import/page.tsx`, and add the sidebar entry beside "Job Order Import" (around line 302) with the same roles.

- [ ] **Step 3: Verify against the real export**

With the local stack up and the roster already imported:

```bash
npm run lint && npm run build
```

Then upload `supabase/old_jo_data/jopayrolls.csv` and `jopayroll_members.csv` on the import screen. Expected result, exactly:

- `payrollsCreated: 805`
- `payrollsSkippedEmpty: 810`
- `payrollsIsolated: 1` — legacy_id `11`, reason mentioning the period order
- `membersCreated: 11015`
- `unresolvedMembers: 0`
- warnings: one out-of-range date (legacy_id `11`)

Then **re-run the same import** and confirm idempotency: `payrollsCreated: 0`, `payrollsUpdated: 805`, `membersUpdated: 11015`, and the row counts in both tables unchanged.

```bash
psql "$DB_URL" -c "select count(*) from hris.job_order_payrolls;" \
  -c "select count(*) from hris.job_order_payroll_members;" \
  -c "select count(*) from hris.job_order_payroll_members where daily_rate is null;"
```

Expected: 805, 11015, and 0 null rates (every legacy member's JO has a rate).

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/job-order-payroll-import-actions.ts src/components/admin/job-order-payroll-import-client.tsx "src/app/(dashboard)/admin/job-order-payroll-import" src/components/layout/app-sidebar.tsx
git commit -m "feat(jo): add legacy payroll CSV import"
```

---

### Task 10: Real-stack tests

The tier that earned its keep in Spec 1 — it caught both the `42P10` upsert defect and the missing RLS that eight prior task gates had missed.

**Files:**
- Create: `supabase/tests/job-order-payroll.test.mts`
- Modify: `package.json` (`test:db`)

**Interfaces:**
- Consumes: the schema from Task 1; `countWeekdays` is already covered by the unit tier
- Produces: nothing consumed downstream

- [ ] **Step 1: Write the tests**

Create `supabase/tests/job-order-payroll.test.mts`, following the setup block of `supabase/tests/job-orders.test.mts` verbatim (credentials from `supabase status -o json`, an `admin` service-role client and an `anon` client, a `TAG` and a `freshLegacyId()` counter). Cover exactly these, one `test()` each:

```ts
// 1. RLS — the reason this file needs an anon client at all.
test("anon key cannot read job_order_payrolls", async () => {
  const { data } = await anon.from("job_order_payrolls").select("id").limit(1);
  assert.deepEqual(data, []);
});

test("anon key cannot read job_order_payroll_members", async () => {
  const { data } = await anon.from("job_order_payroll_members").select("id").limit(1);
  assert.deepEqual(data, []);
});

// 2. The migration 059 regression pin, on BOTH tables. A partial unique index
//    on legacy_id cannot be inferred by .upsert({onConflict}) and fails 42P10.
test("upserting the same payroll legacy_id twice updates in place", async () => {
  const legacyId = freshLegacyId();
  const row = {
    legacy_id: legacyId,
    period_start: "2026-01-01",
    period_end: "2026-01-15",
    description: `${TAG}-first`,
  };
  const a = await admin.from("job_order_payrolls").upsert(row, { onConflict: "legacy_id" }).select("id");
  assert.equal(a.error, null);
  const b = await admin
    .from("job_order_payrolls")
    .upsert({ ...row, description: `${TAG}-second` }, { onConflict: "legacy_id" })
    .select("id");
  assert.equal(b.error, null);
  const { data } = await admin.from("job_order_payrolls").select("id, description").eq("legacy_id", legacyId);
  assert.equal(data!.length, 1);
  assert.equal(data![0].description, `${TAG}-second`);
});

// 3. Two NULL legacy_id rows must coexist (hand-created payrolls).
// 4. chk_job_order_payroll_period rejects a reversed period — the constraint
//    that forces the importer to pre-validate legacy payroll 11.
// 5. UNIQUE (payroll_id, job_order_employee_id) rejects a double-add...
// 6. ...but permits many rows with a NULL job_order_employee_id.
// 7. Deleting a job_order_employees row leaves the member row with its
//    snapshot intact and job_order_employee_id NULL (ON DELETE SET NULL).
// 8. Deleting a payroll cascades its members away (ON DELETE CASCADE).
// 9. A SOFT-DELETED JO is still resolvable by legacy_id — the 5,893-row path
//    the importer depends on.
// 10. status CHECK rejects a value outside draft/finalized.
// 11. The `areas` label re-syncs after a membership change (requested by
//     Task 4's implementer: it is denormalized AND one of three columns the
//     list search matches, so drift is invisible until search misses).
// 12. A forced chunk failure degrades gracefully — promoted from Task 9's
//     review. The importer upserts in chunks of 500 and reports a batch-level
//     warning on failure, but cannot isolate the offending row within its
//     chunk, so one bad row can drop up to 499 valid neighbours behind a single
//     warning line. Today's export does not trigger it (0 blank created_at,
//     0 duplicate (jopayroll_id, jo_id) pairs — both verified against the raw
//     CSVs). Deliberately poison one row in a chunk, e.g. a duplicate
//     (payroll_id, job_order_employee_id) pair violating
//     uq_job_order_payroll_members, and assert the run reports the failure and
//     continues rather than aborting the whole import.
```

Write each of the commented cases out in full, following the style of cases 1–2. For case 7, insert a JO, add it to a payroll, `delete()` the JO, then assert the member row still exists with its `full_name` and `daily_rate` unchanged and `job_order_employee_id === null`.

Every test must clean up after itself, or use `TAG`-prefixed values and delete by `TAG` in a `test.after()` hook, matching `job-orders.test.mts`.

- [ ] **Step 2: Run against the local stack**

```bash
npm run db:reset
node --experimental-strip-types --test supabase/tests/job-order-payroll.test.mts
```

Expected: all pass. If the RLS tests return rows instead of `[]`, the `ENABLE ROW LEVEL SECURITY` statements in migration 064 did not apply — fix migration 064, do not weaken the test.

- [ ] **Step 3: Wire into the npm test script**

```json
"test:db": "node --experimental-strip-types --test supabase/tests/dtr-import.test.mts supabase/tests/job-orders.test.mts supabase/tests/job-order-payroll.test.mts",
```

- [ ] **Step 4: Full verification**

```bash
npm test
npm run lint && npm run build
```

Expected: every suite green; lint shows no new errors against the measured baseline of **92 problems (4 errors, 88 warnings)**; build succeeds.

Baseline recorded before Task 1, for comparison: `npm test` = 160 tests passing across four suites (62 `test:dtr`, 54 `test:cos`, 22 `test:db`, 22 `test:cos-db`). After this plan, `test:dtr` and `test:db` each gain a suite.

- [ ] **Step 5: Commit**

```bash
git add supabase/tests/job-order-payroll.test.mts package.json
git commit -m "test(jo): add real-stack tests for payroll schema, RLS and snapshots"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| `job_order_payrolls` / `job_order_payroll_members` schema | 1 |
| Drop 023's unused tables, retire `/jo-payroll` | 1 |
| RLS on both tables | 1, 10 |
| Non-partial `legacy_id` indexes (migration 059 lesson) | 1, 10 |
| Frozen snapshot columns | 1, 2 |
| Weekday count matching legacy `days` | 2 |
| Holiday advisory, not deducted | 7 |
| Types and zod schemas | 3 |
| Reads with server-side pagination | 4 |
| Create from area selection | 4, 7 |
| Draft lock / finalize / reopen / soft delete | 4, 8, 10 |
| Duplicate payroll | 4, 8 |
| Member add / edit / remove / refresh | 5, 8 |
| `jo_manager` permissions, super_admin-only reopen+delete | 4, 5, 8 |
| PDF rewiring + DRAFT watermark | 2, 6, 8 |
| Legacy import, 805 of 806, idempotent | 9 |
| Snapshot lookup ignoring `deleted_at` | 9, 10 |
| Sidebar consolidation | 1, 8 |
| Verification order (real stack → unit → lint+build) | 2, 10 |

**Type consistency checks made:** `JobOrderPayrollPrintRow` is declared once (Task 2) and aliased in the PDF module so the ten generator signatures stay untouched; `toPrintRow` is the only mapper name used in Tasks 2, 6 and 8; `assertDraft` / `loadMembers` / `recomputeAreas` / `loadJobOrdersForSnapshot` are defined in Task 4 and imported by name in Task 5; `refreshMembersFromRoster` returns `{ updated, skipped }` in Task 5 and is consumed with those exact field names in Task 8.

**Known constraint designed around, not patched:** `"use server"` modules may only export async functions, so `PAYROLL_SELECT`, `MEMBER_SELECT`, `JO_SELECT_FOR_SNAPSHOT`, `toNumber` and `shapeMember` are created in a plain `src/lib/job-order-payroll-queries.ts` in Task 4 Step 1, before anything imports them. Tasks 4 and 5 both run `npm run build`, which is what surfaces this class of error — `tsc --noEmit` alone does not.

**Remaining risk the plan cannot remove:** Tasks 7, 8 and 9 specify UI and importer behaviour in prose plus interface contracts rather than complete component source, because those files depend on shadcn primitives and existing sibling components whose exact props are best read at implementation time from `job-order-list-client.tsx` and `job-order-import-client.tsx`. Each of those steps names the sibling to copy from and lists every required behaviour, and each ends in a concrete verification with expected numbers (notably Task 9's `805 / 810 / 1 / 11015 / 0`), so a wrong implementation fails loudly rather than silently.
