# Job Orders Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Job Orders module foundation — Area Assignments CRUD, Job Order Employee CRUD, the `jo_manager` role, and a CSV importer that loads the legacy Laravel/MySQL JO roster into dedicated Supabase tables.

**Architecture:** Two new tables in the `hris` schema (`job_order_areas`, `job_order_employees`) completely separate from `hris.employees`. Server actions in `src/lib/actions/` are the data layer, using the admin client with role checks in TypeScript. Pages under `src/app/(dashboard)/job-orders/` are server components composing the existing `<DataTable>`. A CSV importer at `/admin/job-order-import` maps the legacy `jos` table, keyed on `legacy_id` for idempotency.

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript strict, Supabase (Postgres + PostgREST), Tailwind v4, shadcn/ui (`base-nova`), react-hook-form + zod, @tanstack/react-table, node:test with `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-07-26-job-orders-foundation-design.md`

## Global Constraints

- Every Supabase query MUST call `.schema("hris")` before `.from(...)`. Omitting it silently queries `public`.
- New migrations keep the numeric prefix sequence. The last existing migration is `054_attendance_reason_off.sql`, so this plan adds `055` and `056`.
- Every migration touching the `hris` schema starts with `SET search_path TO hris, public, auth, extensions;`.
- **Do NOT apply migrations to production.** No `supabase db push`, no Supabase dashboard, no "now run this migration" instruction in your report. Writing the migration file completes the production database work — the developer applies it directly. Do not add reminders to apply it.
- **The LOCAL stack is different and is expected.** `npm run db:start` / `npm run db:reset` / `npx supabase status` operate on the local Docker stack and are the documented way to run `npm run test:db`. Use them freely.
- Migration 020 already set default privileges for new tables in the `hris` schema. No `GRANT` statements are needed.
- `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block, and a newly added enum value cannot be referenced in the same transaction that adds it. The role and the tables MUST be separate migration files.
- Server actions live in `src/lib/actions/*.ts` with `"use server"` at the top, use `createAdminClient()`, and call `revalidatePath(...)` after writes.
- Every mutating action calls `logAudit()` from `src/lib/audit.ts` after the write.
- Soft delete is `deleted_at TIMESTAMPTZ`. Every read filters `.is("deleted_at", null)`.
- The `updated_at` trigger function already exists: `hris.update_updated_at()` (migration 006).
- UI primitives under `src/components/ui/` are auto-generated — do not hand-edit them.
- Tests require Node 22 (`nvm use`). `npm run test:db` requires the local stack (`colima start && npm run db:start`).
- **Test output standard: no NEW KINDS of warning.** Node emits a
  `MODULE_TYPELESS_PACKAGE_JSON` warning for every `.ts` file loaded under
  `--experimental-strip-types`. This is pre-existing repo behaviour (it already
  fires for `attendance-schedule.ts`) and is ACCEPTED — do not add `"type":
  "module"` to package.json or rename files to `.mts` to silence it. Any other
  warning or stray output is still a defect.
- Run `npm run lint && npm run build` before closing any change.
- **Lint baseline: `npm run lint` ALREADY FAILS on `main`** with 41 problems
  (2 errors, 39 warnings) in `reports/plantilla/page.tsx`, `nosi/nosi-form.tsx`
  and others. Verified identical on main and on this branch. The standard is
  therefore **no NEW lint problems**, not a clean run. Do NOT fix unrelated
  pre-existing lint errors — that is scope creep. `npm run build` MUST pass.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `supabase/migrations/055_add_jo_manager_role.sql` | Adds the `jo_manager` enum value, alone |
| `supabase/migrations/056_job_orders_module.sql` | Both tables, indexes, constraints, triggers, `Unassigned` area seed |
| `src/lib/job-order-helpers.ts` | Pure functions: `deriveSortName`, `formatJoAddress`, `normalizeAreaName` |
| `src/lib/csv-import-helpers.ts` | Shared CSV primitives extracted from `salary-csv-import-actions.ts` |
| `src/lib/validations/job-order-schema.ts` | zod schemas for area and employee forms |
| `src/lib/actions/job-order-area-actions.ts` | Area CRUD server actions |
| `src/lib/actions/job-order-actions.ts` | JO employee CRUD server actions |
| `src/lib/actions/job-order-csv-import-actions.ts` | Legacy CSV import |
| `src/components/tables/columns/job-order-area-columns.tsx` | Area table column defs |
| `src/components/tables/columns/job-order-columns.tsx` | Employee table column defs |
| `src/components/job-orders/job-order-area-manager.tsx` | Area list + create/edit/delete dialogs |
| `src/components/job-orders/job-order-form.tsx` | Employee create/edit form |
| `src/components/job-orders/job-order-list-client.tsx` | Employee list, filters, dialogs |
| `src/components/admin/job-order-import-client.tsx` | Import screen |
| `src/app/(dashboard)/job-orders/page.tsx` | Employee list page |
| `src/app/(dashboard)/job-orders/areas/page.tsx` | Areas page |
| `src/app/(dashboard)/admin/job-order-import/page.tsx` | Import page |
| `supabase/tests/job-orders.test.mts` | Real-stack tests |
| `supabase/tests/job-order-helpers.test.mts` | Pure unit tests |

**Modified:**

| File | Change |
|---|---|
| `src/lib/types.ts` | Add `jo_manager` to `UserRole`; add `JobOrderArea` / `JobOrderEmployee` interfaces |
| `src/lib/constants.ts` | Add `JO_MANAGER` to `USER_ROLES` |
| `src/lib/auth-helpers.ts` | Add `canManageJobOrders()` |
| `src/lib/validations/user-schema.ts` | Add `jo_manager` to the role enum |
| `src/components/forms/user-form.tsx` | Add the `jo_manager` option |
| `src/components/tables/columns/user-columns.tsx` | Add the `jo_manager` label |
| `src/components/layout/app-sidebar.tsx` | Add the Job Orders group + import link |
| `src/lib/actions/salary-csv-import-actions.ts` | Import the extracted CSV helpers instead of defining them |
| `package.json` | Wire both new test files into `test:dtr` / `test:db` |

**Task dependency order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9. Task 3 (role) is independent of Tasks 1–2 and may be done in parallel by a second worker.

---

### Task 1: Database schema

**Files:**
- Create: `supabase/migrations/055_add_jo_manager_role.sql`
- Create: `supabase/migrations/056_job_orders_module.sql`

**Interfaces:**
- Consumes: nothing
- Produces: tables `hris.job_order_areas` and `hris.job_order_employees`; enum value `hris.user_role.jo_manager`; a seeded area row named `Unassigned`

- [ ] **Step 1: Write the role migration**

Create `supabase/migrations/055_add_jo_manager_role.sql`:

```sql
-- Migration 055: Add "jo_manager" role.
--
-- JO Manager is a dedicated Job Orders role: it manages Job Order employees and
-- Area Assignments, and (from Specs 2 and 3) creates payrolls, memos and special
-- orders. It carries NO other access — no employees, attendance/DTR, leave,
-- CTO/COC, RSP, regular payroll, reports or administration tools.
-- App-side authorization treats jo_manager via canManageJobOrders()
-- (src/lib/auth-helpers.ts).
--
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction block, and a
-- newly added enum value cannot be referenced in the same transaction in which
-- it is added. That is why the Job Orders tables live in migration 056.
SET search_path TO hris, public, auth, extensions;

ALTER TYPE hris.user_role
  ADD VALUE IF NOT EXISTS 'jo_manager';
```

- [ ] **Step 2: Write the tables migration**

Create `supabase/migrations/056_job_orders_module.sql`:

```sql
-- Migration 056: Job Orders module — Area Assignments and JO employees.
--
-- Job Order personnel are deliberately NOT stored in hris.employees. They are a
-- separate population with their own fields (daily rate, community tax
-- certificate, LandBank ATM, area assignment) and none of the plantilla
-- machinery (salary grade, step increment, leave credits, DTR).
--
-- The legacy Laravel/MySQL `jos` table is the source of truth for the initial
-- load. legacy_id holds jos.id so the CSV import is idempotent: re-running it
-- updates in place instead of duplicating the roster.
--
-- Legacy stores dates and numbers as char/varchar columns, so the importer
-- parses tolerantly and writes NULL on failure rather than rejecting a person.
--
-- Grants: not needed — migration 020 set default privileges for new tables in
-- the hris schema.

SET search_path TO hris, public, auth, extensions;

-- ── Area Assignments ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hris.job_order_areas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  -- Generated so it can never drift from name, whichever code path writes it.
  normalized_name TEXT GENERATED ALWAYS AS
                    (lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))) STORED,
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID,
  updated_by      UUID,
  deleted_at      TIMESTAMPTZ
);

-- Partial: soft-deleting an area frees its name for reuse.
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_order_areas_normalized_name
  ON hris.job_order_areas(normalized_name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_job_order_areas_is_active
  ON hris.job_order_areas(is_active);

CREATE TRIGGER trg_job_order_areas_updated_at
  BEFORE UPDATE ON hris.job_order_areas
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

-- ── Job Order employees ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hris.job_order_employees (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Authoritative name. Fed verbatim to the payroll printables; never rewritten.
  full_name                  TEXT NOT NULL,
  -- Derived surname-first ordering key. A wrong guess misorders a list row but
  -- can never corrupt a printed name.
  sort_name                  TEXT,
  sex                        TEXT CHECK (sex IN ('male', 'female')),
  purok                      TEXT,
  barangay                   TEXT,
  area_id                    UUID NOT NULL
                               REFERENCES hris.job_order_areas(id) ON DELETE RESTRICT,
  sub_area                   TEXT,
  daily_rate                 NUMERIC(10,2),
  previous_daily_rate        NUMERIC(10,2),
  working_hours              NUMERIC(4,2),
  date_started               DATE,
  eligibility                TEXT,
  recommended_by             TEXT,
  remarks                    TEXT,
  remarks_2                  TEXT,
  has_atm                    BOOLEAN NOT NULL DEFAULT false,
  landbank_account_number    TEXT,
  sss_no                     TEXT,
  sss_ss                     NUMERIC(10,2),
  sss_ec                     NUMERIC(10,2),
  community_tax_number       TEXT,
  community_tax_date         DATE,
  community_tax_place_issued TEXT,
  status                     TEXT NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'inactive')),
  legacy_id                  BIGINT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                 UUID,
  updated_by                 UUID,
  deleted_at                 TIMESTAMPTZ,
  -- Mirrors the zod refinement: no account number without an ATM.
  CONSTRAINT chk_job_order_atm_account CHECK (
    has_atm = true OR landbank_account_number IS NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_job_order_employees_legacy_id
  ON hris.job_order_employees(legacy_id) WHERE legacy_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_order_employees_area
  ON hris.job_order_employees(area_id);
CREATE INDEX IF NOT EXISTS idx_job_order_employees_status
  ON hris.job_order_employees(status);
CREATE INDEX IF NOT EXISTS idx_job_order_employees_sort_name
  ON hris.job_order_employees(sort_name);
CREATE INDEX IF NOT EXISTS idx_job_order_employees_deleted_at
  ON hris.job_order_employees(deleted_at);

CREATE TRIGGER trg_job_order_employees_updated_at
  BEFORE UPDATE ON hris.job_order_employees
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

-- ── Seed ─────────────────────────────────────────────────────────────────
-- area_id is NOT NULL because every JO belongs to exactly one area, but legacy
-- rows may have a blank area_assigned. The importer routes those here. This is
-- for migrated data only — the employee form requires an explicit area.
INSERT INTO hris.job_order_areas (name, description)
SELECT 'Unassigned', 'Placeholder for migrated records with no area in the legacy system.'
WHERE NOT EXISTS (
  SELECT 1 FROM hris.job_order_areas WHERE normalized_name = 'unassigned'
);
```

- [ ] **Step 3: Verify the migrations apply**

```bash
colima start && npm run db:start && npm run db:reset
```

Expected: `db reset` completes without error and prints the seed output. If Docker is unavailable, skip this step — Task 8 verifies the schema against the real stack.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/055_add_jo_manager_role.sql supabase/migrations/056_job_orders_module.sql
git commit -m "feat(jo): add job_order_areas and job_order_employees tables"
```

---

### Task 2: Pure helpers

**Files:**
- Create: `src/lib/job-order-helpers.ts`
- Test: `supabase/tests/job-order-helpers.test.mts`
- Modify: `package.json` (test script)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `deriveSortName(fullName: string): string`
  - `formatJoAddress(purok: string | null, barangay: string | null): string`
  - `normalizeAreaName(name: string): string`
  - `parseJoBoolean(raw: string): boolean`

- [ ] **Step 1: Write the failing tests**

Create `supabase/tests/job-order-helpers.test.mts`:

```typescript
// Unit tests for the pure Job Order helpers (`src/lib/job-order-helpers.ts`).
//
// These functions run on every import row and every form save, so their edge
// cases are worth pinning down here rather than discovering them in a 578-row
// production import. The legacy `jos` table stores has_atm as char(50) and
// names in inconsistent order, which is what most of these cases encode.
//
// Requires Node >= 22 for --experimental-strip-types.
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveSortName,
  formatJoAddress,
  normalizeAreaName,
  parseJoBoolean,
} from "../../src/lib/job-order-helpers.ts";

// ── deriveSortName ──────────────────────────────────────────────────

test("already surname-first (comma) is kept in order", () => {
  assert.equal(deriveSortName("Dela Cruz, Juan P."), "dela cruz, juan p.");
});

test("first-name-first moves the last token to the front", () => {
  assert.equal(deriveSortName("Juan Dela Cruz"), "cruz juan dela");
});

test("single-token name is returned as-is", () => {
  assert.equal(deriveSortName("Madonna"), "madonna");
});

test("collapses runs of whitespace", () => {
  assert.equal(deriveSortName("Juan   Cruz"), "cruz juan");
});

test("empty name yields empty string, never throws", () => {
  assert.equal(deriveSortName("   "), "");
});

// ── formatJoAddress ─────────────────────────────────────────────────

test("joins purok and barangay with a comma", () => {
  assert.equal(formatJoAddress("Purok 3", "Poblacion"), "Purok 3, Poblacion");
});

test("omits the missing part rather than leaving a dangling comma", () => {
  assert.equal(formatJoAddress(null, "Poblacion"), "Poblacion");
  assert.equal(formatJoAddress("Purok 3", null), "Purok 3");
});

test("legacy empty-string defaults are treated as absent", () => {
  assert.equal(formatJoAddress("", ""), "");
});

// ── normalizeAreaName ───────────────────────────────────────────────

test("normalization matches the DB generated column", () => {
  assert.equal(normalizeAreaName("  Mayor's   Office "), "mayor's office");
});

// ── parseJoBoolean ──────────────────────────────────────────────────

test("accepts every has_atm spelling the legacy char column holds", () => {
  for (const yes of ["1", "Yes", "YES", "y", "true", "TRUE"]) {
    assert.equal(parseJoBoolean(yes), true, `expected true for ${yes}`);
  }
  for (const no of ["0", "No", "n", "false", "", "  "]) {
    assert.equal(parseJoBoolean(no), false, `expected false for ${no}`);
  }
});

test("unrecognized has_atm value falls back to false, never throws", () => {
  assert.equal(parseJoBoolean("maybe"), false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --experimental-strip-types --test supabase/tests/job-order-helpers.test.mts
```

Expected: FAIL — `Cannot find module '../../src/lib/job-order-helpers.ts'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/job-order-helpers.ts`:

```typescript
/**
 * Pure helpers for the Job Orders module.
 *
 * Kept free of Supabase and React imports so they can be unit-tested directly
 * with node:test (see supabase/tests/job-order-helpers.test.mts).
 */

/** Collapse whitespace runs and trim. */
function squash(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Derive a surname-first ordering key from a full name.
 *
 * A name containing a comma is assumed to already be surname-first and is only
 * normalized. Otherwise the last whitespace-separated token is moved to the
 * front. The rule is heuristic: `full_name` is never rewritten, so a wrong
 * guess misorders a row but can never corrupt a name on a printed payroll.
 */
export function deriveSortName(fullName: string): string {
  const s = squash(fullName).toLowerCase();
  if (!s) return "";
  if (s.includes(",")) return s;

  const parts = s.split(" ");
  if (parts.length < 2) return s;

  const last = parts[parts.length - 1];
  const rest = parts.slice(0, -1);
  return [last, ...rest].join(" ");
}

/**
 * Render the two legacy address parts as one display string. The legacy columns
 * default to '' rather than NULL, so blanks are treated as absent.
 */
export function formatJoAddress(
  purok: string | null,
  barangay: string | null,
): string {
  return [purok, barangay]
    .map((p) => (p ?? "").trim())
    .filter((p) => p.length > 0)
    .join(", ");
}

/**
 * Must produce the same value as the `normalized_name` generated column on
 * hris.job_order_areas, so the importer can match areas before inserting.
 */
export function normalizeAreaName(name: string): string {
  return squash(name).toLowerCase();
}

/**
 * Legacy `jos.has_atm` is char(50) and holds any of 1/0/Yes/No/Y/N/true/false.
 * Anything unrecognized is false — an unknown value must not silently grant
 * someone an ATM account number they do not have.
 */
export function parseJoBoolean(raw: string): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "1" || v === "yes" || v === "y" || v === "true";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --experimental-strip-types --test supabase/tests/job-order-helpers.test.mts
```

Expected: PASS — all 11 tests.

- [ ] **Step 5: Wire into the npm test script**

In `package.json`, change the `test:dtr` line to run both unit suites:

```json
    "test:dtr": "node --experimental-strip-types --test supabase/tests/dtr-bucketing.test.mts supabase/tests/job-order-helpers.test.mts",
```

Run `npm run test:dtr` and confirm both suites pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/job-order-helpers.ts supabase/tests/job-order-helpers.test.mts package.json
git commit -m "feat(jo): add pure job order helpers with unit tests"
```

---

### Task 3: The `jo_manager` role

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/constants.ts`
- Modify: `src/lib/auth-helpers.ts`
- Modify: `src/lib/validations/user-schema.ts`
- Modify: `src/components/forms/user-form.tsx`
- Modify: `src/components/tables/columns/user-columns.tsx`

**Interfaces:**
- Consumes: enum value `jo_manager` from Task 1
- Produces: `canManageJobOrders(role: UserRole | null | undefined): boolean`

- [ ] **Step 1: Add the role to the UserRole union**

In `src/lib/types.ts`, add `| "jo_manager"` to the `UserRole` union (after `"dtr_manager"`).

- [ ] **Step 2: Add the role constant**

In `src/lib/constants.ts`, add to `USER_ROLES`:

```typescript
  JO_MANAGER: "jo_manager",
```

- [ ] **Step 3: Add the authorization helper**

Append to `src/lib/auth-helpers.ts`:

```typescript
// Roles that can manage the Job Orders module: JO employees, Area Assignments,
// and (from Specs 2 and 3) payrolls, memos and special orders. "jo_manager" is
// a dedicated role with no reach outside Job Orders. super_admin and hr_admin
// are included because they hold this access today under the /jo-payroll guard
// (ADMIN_ROLES in jo-payroll-actions.ts) — this preserves it rather than
// silently removing it.
const JOB_ORDER_ROLES: readonly UserRole[] = [
  "super_admin",
  "hr_admin",
  "jo_manager",
] as const;

export function canManageJobOrders(
  role: UserRole | null | undefined,
): boolean {
  return !!role && JOB_ORDER_ROLES.includes(role);
}
```

- [ ] **Step 4: Add the role to the user form schema and UI**

In `src/lib/validations/user-schema.ts`, add `"jo_manager"` to the role enum.

In `src/components/forms/user-form.tsx`, add a `jo_manager` option to the role select, matching the shape of the existing `dtr_manager` option, labelled `JO Manager`.

In `src/components/tables/columns/user-columns.tsx`, add a `jo_manager: "JO Manager"` entry to the role label map, matching the existing `hr_record_manager` entry.

- [ ] **Step 5: Verify it compiles**

```bash
npm run lint && npm run build
```

Expected: both succeed. A TypeScript error naming an unhandled `jo_manager` case means a role switch or label map was missed — fix it before committing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/constants.ts src/lib/auth-helpers.ts src/lib/validations/user-schema.ts src/components/forms/user-form.tsx src/components/tables/columns/user-columns.tsx
git commit -m "feat(jo): add jo_manager role and canManageJobOrders helper"
```

---

### Task 4: Validation schemas

**Files:**
- Create: `src/lib/validations/job-order-schema.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `jobOrderAreaSchema` / `JobOrderAreaValues`
  - `jobOrderEmployeeSchema` / `JobOrderEmployeeValues`

- [ ] **Step 1: Write the schemas**

Create `src/lib/validations/job-order-schema.ts`:

```typescript
import { z } from "zod";

export const jobOrderAreaSchema = z.object({
  name: z.string().trim().min(1, "Area name is required").max(255),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  is_active: z.boolean().default(true),
});

export type JobOrderAreaValues = z.infer<typeof jobOrderAreaSchema>;

const optionalText = z.string().trim().max(255).optional().or(z.literal(""));

// zod v4: the v3 `invalid_type_error` option was removed — use `{ message }`.
// `z.coerce` matches how employee-schema.ts handles numeric inputs, which
// arrive from <Input type="number"> as strings.
const optionalMoney = z.coerce
  .number({ message: "Must be a number" })
  .nonnegative("Must be zero or more")
  .nullable()
  .optional();

export const jobOrderEmployeeSchema = z
  .object({
    full_name: z.string().trim().min(1, "Full name is required").max(255),
    sex: z.enum(["male", "female"]).nullable().optional(),
    purok: optionalText,
    barangay: optionalText,
    area_id: z.string().uuid("Area Assignment is required"),
    sub_area: optionalText,
    daily_rate: optionalMoney,
    working_hours: optionalMoney,
    date_started: z.string().optional().or(z.literal("")),
    eligibility: optionalText,
    recommended_by: optionalText,
    remarks: z.string().trim().max(1000).optional().or(z.literal("")),
    remarks_2: z.string().trim().max(1000).optional().or(z.literal("")),
    has_atm: z.boolean().default(false),
    landbank_account_number: optionalText,
    sss_no: optionalText,
    sss_ss: optionalMoney,
    sss_ec: optionalMoney,
    community_tax_number: optionalText,
    community_tax_date: z.string().optional().or(z.literal("")),
    community_tax_place_issued: optionalText,
    status: z.enum(["active", "inactive"]).default("active"),
  })
  // Mirrors the chk_job_order_atm_account constraint in migration 056. Keeping
  // both means a bad payload is rejected by the form AND by the database.
  .refine(
    (v) => v.has_atm || !v.landbank_account_number,
    {
      message: "Clear the account number, or set Has ATM to Yes",
      path: ["landbank_account_number"],
    },
  )
  .refine(
    (v) => !v.has_atm || !!v.landbank_account_number?.trim(),
    {
      message: "LandBank account number is required when Has ATM is Yes",
      path: ["landbank_account_number"],
    },
  );

export type JobOrderEmployeeValues = z.infer<typeof jobOrderEmployeeSchema>;
```

- [ ] **Step 2: Verify it compiles**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/validations/job-order-schema.ts
git commit -m "feat(jo): add job order zod schemas"
```

---

### Task 5: Area server actions

**Files:**
- Create: `src/lib/actions/job-order-area-actions.ts`
- Modify: `src/lib/types.ts` (add the `JobOrderArea` interface)

**Interfaces:**
- Consumes: `canManageJobOrders` (Task 3), `jobOrderAreaSchema` (Task 4), tables from Task 1
- Produces:
  - `getJobOrderAreas(opts?: { includeInactive?: boolean }): Promise<JobOrderArea[]>`
  - `createJobOrderArea(input: JobOrderAreaValues): Promise<{ data?: JobOrderArea; error?: string }>`
  - `updateJobOrderArea(id: string, input: JobOrderAreaValues): Promise<{ data?: JobOrderArea; error?: string }>`
  - `deleteJobOrderArea(id: string): Promise<{ success?: true; error?: string }>`

- [ ] **Step 1: Add the shared type**

In `src/lib/types.ts`, add:

```typescript
export interface JobOrderArea {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  employee_count: number;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Write the actions**

Create `src/lib/actions/job-order-area-actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageJobOrders } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import {
  jobOrderAreaSchema,
  type JobOrderAreaValues,
} from "@/lib/validations/job-order-schema";
import type { JobOrderArea } from "@/lib/types";

function trimNullable(s: string | null | undefined): string | null {
  if (s == null) return null;
  const v = s.trim();
  return v.length === 0 ? null : v;
}

export async function getJobOrderAreas(
  opts: { includeInactive?: boolean } = {},
): Promise<JobOrderArea[]> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return [];

  const supabase = createAdminClient();

  let query = supabase
    .schema("hris")
    .from("job_order_areas")
    .select("id, name, description, is_active, created_at, updated_at")
    .is("deleted_at", null)
    .order("name");

  if (!opts.includeInactive) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) throw error;

  // Counts drive the "N employees" column and the delete guard. Fetched in one
  // extra round trip rather than per-row.
  const { data: members } = await supabase
    .schema("hris")
    .from("job_order_employees")
    .select("area_id")
    .is("deleted_at", null);

  const counts = new Map<string, number>();
  for (const m of members ?? []) {
    counts.set(m.area_id, (counts.get(m.area_id) ?? 0) + 1);
  }

  return (data ?? []).map((a) => ({
    ...a,
    employee_count: counts.get(a.id) ?? 0,
  }));
}

export async function createJobOrderArea(input: JobOrderAreaValues) {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

  const parsed = jobOrderAreaSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().formErrors[0] ?? "Invalid area" };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("job_order_areas")
    .insert({
      name: parsed.data.name,
      description: trimNullable(parsed.data.description),
      is_active: parsed.data.is_active,
      created_by: user!.id,
      updated_by: user!.id,
    })
    .select("id, name, description, is_active, created_at, updated_at")
    .single();

  // 23505 = unique_violation on uq_job_order_areas_normalized_name.
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "An area with that name already exists"
          : error.message,
    };
  }

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "create",
    tableName: "job_order_areas",
    recordId: data.id,
    newValues: data,
  });

  revalidatePath("/job-orders/areas");
  revalidatePath("/job-orders");
  return { data: { ...data, employee_count: 0 } };
}

export async function updateJobOrderArea(
  id: string,
  input: JobOrderAreaValues,
) {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

  const parsed = jobOrderAreaSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().formErrors[0] ?? "Invalid area" };
  }

  const supabase = createAdminClient();

  const { data: before } = await supabase
    .schema("hris")
    .from("job_order_areas")
    .select("id, name, description, is_active")
    .eq("id", id)
    .maybeSingle();

  const { data, error } = await supabase
    .schema("hris")
    .from("job_order_areas")
    .update({
      name: parsed.data.name,
      description: trimNullable(parsed.data.description),
      is_active: parsed.data.is_active,
      updated_by: user!.id,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, name, description, is_active, created_at, updated_at")
    .single();

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "An area with that name already exists"
          : error.message,
    };
  }

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "update",
    tableName: "job_order_areas",
    recordId: id,
    oldValues: before,
    newValues: data,
  });

  revalidatePath("/job-orders/areas");
  revalidatePath("/job-orders");
  return { data };
}

export async function deleteJobOrderArea(id: string) {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

  const supabase = createAdminClient();

  // Guard before soft-deleting: an area with members would leave those rows
  // pointing at a deleted area. The FK is ON DELETE RESTRICT, but this is a
  // soft delete so the FK would not fire.
  const { count } = await supabase
    .schema("hris")
    .from("job_order_employees")
    .select("id", { count: "exact", head: true })
    .eq("area_id", id)
    .is("deleted_at", null);

  if ((count ?? 0) > 0) {
    return {
      error: `Cannot delete: ${count} employee${count === 1 ? "" : "s"} still assigned to this area. Reassign them first.`,
    };
  }

  const { error } = await supabase
    .schema("hris")
    .from("job_order_areas")
    .update({ deleted_at: new Date().toISOString(), updated_by: user!.id })
    .eq("id", id);

  if (error) return { error: error.message };

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "delete",
    tableName: "job_order_areas",
    recordId: id,
  });

  revalidatePath("/job-orders/areas");
  return { success: true as const };
}
```

- [ ] **Step 3: Verify it compiles**

```bash
npm run lint && npm run build
```

Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/job-order-area-actions.ts src/lib/types.ts
git commit -m "feat(jo): add area assignment server actions"
```

---

### Task 6: Employee server actions

**Files:**
- Create: `src/lib/actions/job-order-actions.ts`
- Modify: `src/lib/types.ts` (add the `JobOrderEmployee` interface)

**Interfaces:**
- Consumes: `canManageJobOrders` (Task 3), `jobOrderEmployeeSchema` (Task 4), `deriveSortName` (Task 2)
- Produces:
  - `getJobOrderEmployees(filters?: JobOrderFilters): Promise<JobOrderEmployee[]>`
  - `getJobOrderEmployeeById(id: string): Promise<JobOrderEmployee | null>`
  - `createJobOrderEmployee(input: JobOrderEmployeeValues): Promise<{ data?: JobOrderEmployee; error?: string }>`
  - `updateJobOrderEmployee(id: string, input: JobOrderEmployeeValues): Promise<{ data?: JobOrderEmployee; error?: string }>`
  - `deleteJobOrderEmployee(id: string): Promise<{ success?: true; error?: string }>`

- [ ] **Step 1: Add the shared type**

In `src/lib/types.ts`, add:

```typescript
export interface JobOrderEmployee {
  id: string;
  full_name: string;
  sort_name: string | null;
  sex: "male" | "female" | null;
  purok: string | null;
  barangay: string | null;
  area_id: string;
  area_name: string | null;
  sub_area: string | null;
  daily_rate: number | null;
  previous_daily_rate: number | null;
  working_hours: number | null;
  date_started: string | null;
  eligibility: string | null;
  recommended_by: string | null;
  remarks: string | null;
  remarks_2: string | null;
  has_atm: boolean;
  landbank_account_number: string | null;
  sss_no: string | null;
  sss_ss: number | null;
  sss_ec: number | null;
  community_tax_number: string | null;
  community_tax_date: string | null;
  community_tax_place_issued: string | null;
  status: "active" | "inactive";
  legacy_id: number | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Write the actions**

Create `src/lib/actions/job-order-actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageJobOrders } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { deriveSortName } from "@/lib/job-order-helpers";
import {
  jobOrderEmployeeSchema,
  type JobOrderEmployeeValues,
} from "@/lib/validations/job-order-schema";
import type { JobOrderEmployee } from "@/lib/types";

export interface JobOrderFilters {
  status?: "active" | "inactive" | "all";
  areaId?: string | null;
  hasAtm?: boolean | null;
}

const SELECT_COLUMNS = `
  id, full_name, sort_name, sex, purok, barangay, area_id, sub_area,
  daily_rate, previous_daily_rate, working_hours, date_started, eligibility,
  recommended_by, remarks, remarks_2, has_atm, landbank_account_number,
  sss_no, sss_ss, sss_ec, community_tax_number, community_tax_date,
  community_tax_place_issued, status, legacy_id, created_at, updated_at,
  job_order_areas(name)
`;

type RawRow = Omit<JobOrderEmployee, "area_name"> & {
  job_order_areas: { name: string } | null;
};

function toNumber(v: unknown): number | null {
  return v == null ? null : Number(v);
}

function shape(r: RawRow): JobOrderEmployee {
  const { job_order_areas, ...rest } = r;
  return {
    ...rest,
    area_name: job_order_areas?.name ?? null,
    daily_rate: toNumber(rest.daily_rate),
    previous_daily_rate: toNumber(rest.previous_daily_rate),
    working_hours: toNumber(rest.working_hours),
    sss_ss: toNumber(rest.sss_ss),
    sss_ec: toNumber(rest.sss_ec),
  };
}

/** Blank strings from the form become NULL, not ''. */
function nullable(s: string | null | undefined): string | null {
  if (s == null) return null;
  const v = s.trim();
  return v.length === 0 ? null : v;
}

function toRow(input: JobOrderEmployeeValues) {
  return {
    full_name: input.full_name.trim(),
    sort_name: deriveSortName(input.full_name),
    sex: input.sex ?? null,
    purok: nullable(input.purok),
    barangay: nullable(input.barangay),
    area_id: input.area_id,
    sub_area: nullable(input.sub_area),
    daily_rate: input.daily_rate ?? null,
    working_hours: input.working_hours ?? null,
    date_started: nullable(input.date_started),
    eligibility: nullable(input.eligibility),
    recommended_by: nullable(input.recommended_by),
    remarks: nullable(input.remarks),
    remarks_2: nullable(input.remarks_2),
    has_atm: input.has_atm,
    // Enforced by chk_job_order_atm_account as well; clearing here keeps the
    // DB from rejecting an otherwise valid save.
    landbank_account_number: input.has_atm
      ? nullable(input.landbank_account_number)
      : null,
    sss_no: nullable(input.sss_no),
    sss_ss: input.sss_ss ?? null,
    sss_ec: input.sss_ec ?? null,
    community_tax_number: nullable(input.community_tax_number),
    community_tax_date: nullable(input.community_tax_date),
    community_tax_place_issued: nullable(input.community_tax_place_issued),
    status: input.status,
  };
}

export async function getJobOrderEmployees(
  filters: JobOrderFilters = {},
): Promise<JobOrderEmployee[]> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return [];

  const supabase = createAdminClient();

  let query = supabase
    .schema("hris")
    .from("job_order_employees")
    .select(SELECT_COLUMNS)
    .is("deleted_at", null)
    .order("sort_name", { nullsFirst: false });

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.areaId) query = query.eq("area_id", filters.areaId);
  if (filters.hasAtm != null) query = query.eq("has_atm", filters.hasAtm);

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as unknown as RawRow[]).map(shape);
}

export async function getJobOrderEmployeeById(
  id: string,
): Promise<JobOrderEmployee | null> {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("job_order_employees")
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  return data ? shape(data as unknown as RawRow) : null;
}

export async function createJobOrderEmployee(input: JobOrderEmployeeValues) {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

  const parsed = jobOrderEmployeeSchema.safeParse(input);
  if (!parsed.success) {
    const f = parsed.error.flatten();
    return {
      error:
        f.formErrors[0] ??
        Object.values(f.fieldErrors).flat()[0] ??
        "Invalid employee data",
    };
  }

  const supabase = createAdminClient();

  // An inactive area must not be assignable to a NEW record. Editing an
  // existing record whose area has since gone inactive stays allowed, so this
  // check lives here rather than in update.
  const { data: area } = await supabase
    .schema("hris")
    .from("job_order_areas")
    .select("is_active")
    .eq("id", parsed.data.area_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!area) return { error: "Area Assignment not found" };
  if (!area.is_active) {
    return { error: "That Area Assignment is inactive and cannot be assigned" };
  }

  const { data, error } = await supabase
    .schema("hris")
    .from("job_order_employees")
    .insert({
      ...toRow(parsed.data),
      created_by: user!.id,
      updated_by: user!.id,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) return { error: error.message };

  const shaped = shape(data as unknown as RawRow);

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "create",
    tableName: "job_order_employees",
    recordId: shaped.id,
    newValues: shaped,
  });

  revalidatePath("/job-orders");
  return { data: shaped };
}

export async function updateJobOrderEmployee(
  id: string,
  input: JobOrderEmployeeValues,
) {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

  const parsed = jobOrderEmployeeSchema.safeParse(input);
  if (!parsed.success) {
    const f = parsed.error.flatten();
    return {
      error:
        f.formErrors[0] ??
        Object.values(f.fieldErrors).flat()[0] ??
        "Invalid employee data",
    };
  }

  const supabase = createAdminClient();

  const { data: before } = await supabase
    .schema("hris")
    .from("job_order_employees")
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (!before) return { error: "Employee not found" };

  const beforeShaped = shape(before as unknown as RawRow);

  // Preserve rate history the way the legacy system did: when the daily rate
  // changes, the old value moves to previous_daily_rate.
  const rateChanged =
    (parsed.data.daily_rate ?? null) !== beforeShaped.daily_rate;

  const { data, error } = await supabase
    .schema("hris")
    .from("job_order_employees")
    .update({
      ...toRow(parsed.data),
      previous_daily_rate: rateChanged
        ? beforeShaped.daily_rate
        : beforeShaped.previous_daily_rate,
      updated_by: user!.id,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select(SELECT_COLUMNS)
    .single();

  if (error) return { error: error.message };

  const shaped = shape(data as unknown as RawRow);

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "update",
    tableName: "job_order_employees",
    recordId: id,
    oldValues: beforeShaped,
    newValues: shaped,
  });

  revalidatePath("/job-orders");
  return { data: shaped };
}

export async function deleteJobOrderEmployee(id: string) {
  const user = await getCurrentUser();
  if (!canManageJobOrders(user?.role)) return { error: "Unauthorized" };

  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("hris")
    .from("job_order_employees")
    .update({ deleted_at: new Date().toISOString(), updated_by: user!.id })
    .eq("id", id);

  if (error) return { error: error.message };

  await logAudit({
    userId: user!.id,
    userEmail: user!.email,
    action: "delete",
    tableName: "job_order_employees",
    recordId: id,
  });

  revalidatePath("/job-orders");
  return { success: true as const };
}
```

- [ ] **Step 3: Verify it compiles**

```bash
npm run lint && npm run build
```

Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/job-order-actions.ts src/lib/types.ts
git commit -m "feat(jo): add job order employee server actions"
```

---

### Task 7: UI — areas, employees, sidebar

**Files:**
- Create: `src/components/tables/columns/job-order-area-columns.tsx`
- Create: `src/components/tables/columns/job-order-columns.tsx`
- Create: `src/components/job-orders/job-order-area-manager.tsx`
- Create: `src/components/job-orders/job-order-form.tsx`
- Create: `src/components/job-orders/job-order-list-client.tsx`
- Create: `src/app/(dashboard)/job-orders/page.tsx`
- Create: `src/app/(dashboard)/job-orders/areas/page.tsx`
- Modify: `src/components/layout/app-sidebar.tsx`

**Interfaces:**
- Consumes: all actions from Tasks 5–6, `formatJoAddress` (Task 2), schemas (Task 4)
- Produces: routes `/job-orders` and `/job-orders/areas`

**Reference patterns to follow — read these first:**
- `src/components/admin/department-manager.tsx` — dialog-based CRUD manager
- `src/components/jo-payroll/jo-payroll-list-client.tsx` — list client with filters
- `src/components/forms/employee-form.tsx` — long react-hook-form + zod form, and the `watch()` pattern for conditional fields
- `src/components/tables/columns/employee-columns.tsx` — column def conventions

- [ ] **Step 1: Build the area columns and manager**

Create `src/components/tables/columns/job-order-area-columns.tsx` exporting `jobOrderAreaColumns(handlers: { onEdit: (a: JobOrderArea) => void; onDelete: (a: JobOrderArea) => void }): ColumnDef<JobOrderArea>[]` with columns: Name, Description, Status (badge — Active green / Inactive muted, matching the badge usage in `employee-columns.tsx`), Employees (`employee_count`), and a row actions menu.

Create `src/components/job-orders/job-order-area-manager.tsx` (`"use client"`) following `src/components/admin/department-manager.tsx`: a `<DataTable>` of areas, a Create button opening a shadcn `Dialog` with a `Form` bound to `jobOrderAreaSchema`, an edit dialog, and an `AlertDialog` delete confirmation. On a delete error, surface the returned message with `toast.error` — the "N employees still assigned" text is the useful part.

- [ ] **Step 2: Build the areas page**

Create `src/app/(dashboard)/job-orders/areas/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth";
import { canManageJobOrders } from "@/lib/auth-helpers";
import { getJobOrderAreas } from "@/lib/actions/job-order-area-actions";
import { JobOrderAreaManager } from "@/components/job-orders/job-order-area-manager";

export default async function JobOrderAreasPage() {
  const user = await getServerUser();
  if (!canManageJobOrders(user?.role)) redirect("/dashboard");

  const areas = await getJobOrderAreas({ includeInactive: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Area Assignments
        </h1>
        <p className="text-muted-foreground text-sm">
          Offices and locations Job Order personnel are assigned to.
        </p>
      </div>
      <JobOrderAreaManager initialAreas={areas} />
    </div>
  );
}
```

`getServerUser()` (`src/lib/auth.ts:15`) returns `{ id, email, fullName, role, departmentId, ... } | null`, so `user?.role` is correct as written.

- [ ] **Step 3: Build the employee columns**

Create `src/components/tables/columns/job-order-columns.tsx` exporting `jobOrderColumns(handlers)` with columns: Name (`full_name`, sortable), Area (`area_name`), Sub-Area, Daily Rate (right-aligned, `toLocaleString("en-PH", { style: "currency", currency: "PHP" })`), Address (`formatJoAddress(row.purok, row.barangay)`), Date Started, ATM (Yes/No badge), Status badge, row actions.

- [ ] **Step 4: Build the employee form**

Create `src/components/job-orders/job-order-form.tsx` (`"use client"`) — a `Form` bound to `jobOrderEmployeeSchema`, grouped into four `Card` sections matching the spec's field grouping: Personal Information, Employment Information, Bank Information, Community Tax Certificate. Plus a Status select.

Two behaviours that must be implemented exactly:

```tsx
// Bank Information — the account field only exists when Has ATM is Yes.
const hasAtm = form.watch("has_atm");

// ...inside the Bank Information card:
{hasAtm && (
  <FormField
    control={form.control}
    name="landbank_account_number"
    render={({ field }) => (
      <FormItem>
        <FormLabel>LandBank Account Number</FormLabel>
        <FormControl>
          <Input {...field} value={field.value ?? ""} />
        </FormControl>
        <FormMessage />
      </FormItem>
    )}
  />
)}
```

```tsx
// Area select. Inactive areas are hidden for NEW records, but an existing
// record's own area stays listed even if it has since gone inactive —
// otherwise the form cannot be saved and the record becomes uneditable.
const selectableAreas = areas.filter(
  (a) => a.is_active || a.id === defaultValues?.area_id,
);
```

When `has_atm` is switched to false, clear the account number so the value does not linger in form state:

```tsx
onCheckedChange={(checked) => {
  field.onChange(checked);
  if (!checked) form.setValue("landbank_account_number", "");
}}
```

- [ ] **Step 5: Build the list client and page**

Create `src/components/job-orders/job-order-list-client.tsx` (`"use client"`): a `<DataTable>` with `searchableColumns` on `full_name` and `filterableColumns` for Status (Active/Inactive), Area, and ATM (Yes/No), a Create button opening the form in a `Dialog`, an edit dialog, and an `AlertDialog` delete confirmation. Use `toast.success` / `toast.error` from `sonner` for every action result.

Create `src/app/(dashboard)/job-orders/page.tsx` mirroring the areas page: guard with `canManageJobOrders`, fetch `getJobOrderEmployees({ status: "all" })` and `getJobOrderAreas({ includeInactive: true })`, pass both to the client.

- [ ] **Step 6: Add the sidebar group**

In `src/components/layout/app-sidebar.tsx`, add a `jobOrderRoles` constant (`["super_admin", "hr_admin", "jo_manager"]`) and a new group after the Payroll group:

```tsx
  {
    label: "Job Orders",
    roles: jobOrderRoles,
    items: [
      { title: "Job Order Employees", href: "/job-orders", icon: HardHat, roles: jobOrderRoles },
      { title: "Area Assignments", href: "/job-orders/areas", icon: MapPin, roles: jobOrderRoles },
    ],
  },
```

Add `HardHat` and `MapPin` to the existing `lucide-react` import block (`Upload` and `Hammer` are already imported — do not re-add them). `Hammer` is deliberately NOT reused here: it still belongs to the "Job Order Payroll" item at line 219, which stays live until Spec 2 retires it, and two identical icons in adjacent groups would be confusing. Match the exact shape of the neighbouring group objects — copy one and edit it rather than writing from scratch.

- [ ] **Step 7: Verify**

```bash
npm run lint && npm run build
```

Expected: both succeed.

- [ ] **Step 8: Commit**

```bash
git add src/components/job-orders src/components/tables/columns/job-order-columns.tsx src/components/tables/columns/job-order-area-columns.tsx "src/app/(dashboard)/job-orders" src/components/layout/app-sidebar.tsx
git commit -m "feat(jo): add job order employee and area assignment UI"
```

---

### Task 8: CSV import

**Files:**
- Create: `src/lib/csv-import-helpers.ts`
- Create: `src/lib/actions/job-order-csv-import-actions.ts`
- Create: `src/components/admin/job-order-import-client.tsx`
- Create: `src/app/(dashboard)/admin/job-order-import/page.tsx`
- Modify: `src/lib/actions/salary-csv-import-actions.ts`
- Modify: `src/components/layout/app-sidebar.tsx`

**Interfaces:**
- Consumes: `parseCsvTextToRows` (`src/lib/parse-csv.ts`), `normalizeAreaName` / `parseJoBoolean` / `deriveSortName` (Task 2)
- Produces:
  - `importJobOrderAreasFromCsv(csvText: string): Promise<JoImportResult>`
  - `importJobOrderEmployeesFromCsv(csvText: string): Promise<JoImportResult>`
  - `interface JoImportResult { inserted: number; updated: number; skipped: number; errors: string[]; warnings: string[]; areasCreated: string[] }`

- [ ] **Step 1: Extract the shared CSV helpers**

Create `src/lib/csv-import-helpers.ts` by moving `normHeader`, `colIndex`, `parseMoney` and `parseFlexibleCsvDate` verbatim out of `src/lib/actions/salary-csv-import-actions.ts` (lines ~33–85), adding `export` to each. Do not change their behaviour.

Then in `salary-csv-import-actions.ts`, delete those four function bodies and import them instead:

```typescript
import {
  normHeader,
  colIndex,
  parseMoney,
  parseFlexibleCsvDate,
} from "@/lib/csv-import-helpers";
```

- [ ] **Step 2: Verify the extraction changed nothing**

```bash
npm run lint && npm run build
```

Expected: both succeed. A behaviour change here would silently corrupt the *salary* import, so if anything fails, revert and redo the move without edits.

```bash
git add src/lib/csv-import-helpers.ts src/lib/actions/salary-csv-import-actions.ts
git commit -m "refactor: extract shared CSV import helpers"
```

- [ ] **Step 3: Write the import actions**

Create `src/lib/actions/job-order-csv-import-actions.ts`. Key requirements, all of which the real-stack test in Task 9 checks:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { parseCsvTextToRows } from "@/lib/parse-csv";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { logAudit } from "@/lib/audit";
import {
  normHeader,
  colIndex,
  parseMoney,
  parseFlexibleCsvDate,
} from "@/lib/csv-import-helpers";
import {
  deriveSortName,
  normalizeAreaName,
  parseJoBoolean,
} from "@/lib/job-order-helpers";

const UPSERT_CHUNK = 200;

export interface JoImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  warnings: string[];
  areasCreated: string[];
}
```

Rules the implementation must honour:

1. **Guard on `super_admin` only** — matching the other import screens, tighter than `canManageJobOrders`.
2. **Header row is row 0**, normalized with `normHeader`. Resolve every column with `colIndex(map, "...")` so column order does not matter.
3. **Only a missing or empty `fullname` skips a row.** Every other parse failure writes `null` and pushes a warning of the form `` `Row ${n}: could not parse ${column} "${raw}" — left blank` ``.
4. **Area resolution**: `normalizeAreaName(raw)`; look up in a Map preloaded from `job_order_areas`; if absent, insert `{ name: raw.trim() }` and push the name onto `areasCreated`. A blank area resolves to the seeded `Unassigned` area.
5. **`landbank_account_number` is set to `null` whenever `has_atm` parses false**, or the `chk_job_order_atm_account` constraint rejects the row.
6. **Upsert on `legacy_id`** in chunks of `UPSERT_CHUNK`:
   ```typescript
   .upsert(chunk, { onConflict: "legacy_id", ignoreDuplicates: false })
   ```
7. **`status` is always `'active'`** — legacy has no status column.
8. **`deleted_at` from the CSV is carried across** so legacy soft deletes survive.
9. `sort_name` comes from `deriveSortName(fullname)`.
10. Call `logAudit` once per import run with `action: "import"`, `tableName: "job_order_employees"`, and the counts in `newValues`.
11. `revalidatePath("/job-orders")` and `revalidatePath("/job-orders/areas")` at the end.

Legacy → column mapping (from the spec):

| CSV header | Target | Parse |
|---|---|---|
| `id` | `legacy_id` | `Number`, skip row if not finite |
| `fullname` | `full_name`, `sort_name` | required |
| `area_assigned` | `area_id` | resolve/create; blank → `Unassigned` |
| `sub_area` | `sub_area` | trim → null |
| `rate` | `daily_rate` | `parseMoney` |
| `previous_rate` | `previous_daily_rate` | `parseMoney` |
| `gender` | `sex` | lowercase; `male`/`female` else null |
| `purok` | `purok` | trim → null |
| `barangay` | `barangay` | trim → null |
| `has_atm` | `has_atm` | `parseJoBoolean` |
| `working_hours` | `working_hours` | `parseMoney` |
| `account_number` | `landbank_account_number` | trim → null; forced null when `!has_atm` |
| `sss_no` | `sss_no` | trim → null |
| `sss_ss` / `sss_ec` | same | `parseMoney` |
| `tax_number` | `community_tax_number` | trim → null |
| `tax_date` | `community_tax_date` | `parseFlexibleCsvDate` |
| `tax_issued` | `community_tax_place_issued` | trim → null |
| `date_started` | `date_started` | `parseFlexibleCsvDate` |
| `eligibility` / `recommended_by` / `remarks` | same | trim → null |
| `remarks2` | `remarks_2` | trim → null |
| `deleted_at` | `deleted_at` | trim → null |

`importJobOrderAreasFromCsv` is the simpler sibling: maps `area_assigned` → `name`, skips names already present (matched on `normalizeAreaName`), leaves `description` null and `is_active` true.

- [ ] **Step 4: Build the import screen**

Create `src/components/admin/job-order-import-client.tsx` following `src/components/admin/salary-import-client.tsx`: two file inputs (Areas, Employees), each reading the file with `await file.text()` and calling its action, then rendering the returned `JoImportResult` — counts, then errors, then warnings, then the auto-created area list under a heading like "Areas created automatically — review for typos".

Create `src/app/(dashboard)/admin/job-order-import/page.tsx` guarded on `user?.role === "super_admin"`, redirecting to `/dashboard` otherwise.

Add a sidebar entry under the Administration group:

```tsx
      { title: "Job Order Import", href: "/admin/job-order-import", icon: Upload, roles: ["super_admin"] },
```

Match the icon import style of the neighbouring import entries.

- [ ] **Step 5: Verify**

```bash
npm run lint && npm run build
```

Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/job-order-csv-import-actions.ts src/components/admin/job-order-import-client.tsx "src/app/(dashboard)/admin/job-order-import" src/components/layout/app-sidebar.tsx
git commit -m "feat(jo): add legacy CSV import for job orders"
```

---

### Task 9: Real-stack tests

**Files:**
- Create: `supabase/tests/job-orders.test.mts`
- Modify: `package.json`

**Interfaces:**
- Consumes: everything above
- Produces: `npm run test:db` covering Job Orders

- [ ] **Step 1: Write the failing tests**

Create `supabase/tests/job-orders.test.mts`:

```typescript
// End-to-end tests for the Job Orders schema against the LOCAL Supabase stack
// (real Postgres + real PostgREST).
//
// The unit suite (job-order-helpers.test.mts) proves the pure mapping logic.
// This one proves the claims only a real database can answer:
//
//   * The chk_job_order_atm_account constraint actually rejects an account
//     number without an ATM — a CHECK constraint is only real if the database
//     enforces it.
//   * legacy_id upsert is idempotent, so re-running the import cannot double
//     the roster. This is the guarantee the whole migration strategy rests on.
//   * ON DELETE RESTRICT blocks removing an area that still has members.
//   * The normalized_name generated column matches normalizeAreaName().
//
// Credentials come from `supabase status -o json` and are never printed.
//
// Requires Node >= 22 (--experimental-strip-types) and a running stack:
//   npx supabase start && npm run test:db

import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { normalizeAreaName } from "../../src/lib/job-order-helpers.ts";

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

const TAG = `jotest-${Date.now()}`;

async function makeArea(name: string, isActive = true) {
  const { data, error } = await admin
    .from("job_order_areas")
    .insert({ name, is_active: isActive })
    .select("id, name, normalized_name, is_active")
    .single();
  assert.equal(error, null, `area insert failed: ${error?.message}`);
  return data!;
}

test.after(async () => {
  // Employees first — ON DELETE RESTRICT would block the areas otherwise.
  await admin.from("job_order_employees").delete().like("full_name", `${TAG}%`);
  await admin.from("job_order_areas").delete().like("name", `${TAG}%`);
});

test("the Unassigned area is seeded by migration 056", async () => {
  const { data } = await admin
    .from("job_order_areas")
    .select("id, name")
    .eq("normalized_name", "unassigned")
    .maybeSingle();

  assert.ok(data, "expected a seeded 'Unassigned' area");
});

test("normalized_name generated column matches normalizeAreaName()", async () => {
  const raw = `${TAG}  Mayor's   Office `;
  const area = await makeArea(raw);
  assert.equal(area.normalized_name, normalizeAreaName(raw));
});

test("duplicate area names are rejected", async () => {
  const name = `${TAG}-dup`;
  await makeArea(name);
  const { error } = await admin
    .from("job_order_areas")
    .insert({ name })
    .select()
    .single();

  assert.ok(error, "expected a unique violation");
  assert.equal(error!.code, "23505");
});

test("soft-deleting an area frees its name for reuse", async () => {
  const name = `${TAG}-reuse`;
  const first = await makeArea(name);
  await admin
    .from("job_order_areas")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", first.id);

  const { error } = await admin
    .from("job_order_areas")
    .insert({ name })
    .select()
    .single();

  assert.equal(error, null, "partial unique index should allow reuse");
});

test("account number without an ATM violates chk_job_order_atm_account", async () => {
  const area = await makeArea(`${TAG}-atm`);
  const { error } = await admin
    .from("job_order_employees")
    .insert({
      full_name: `${TAG} No Atm`,
      area_id: area.id,
      has_atm: false,
      landbank_account_number: "1234567890",
    })
    .select()
    .single();

  assert.ok(error, "expected the CHECK constraint to reject this row");
  assert.equal(error!.code, "23514");
});

test("account number with an ATM is accepted", async () => {
  const area = await makeArea(`${TAG}-atm-ok`);
  const { error } = await admin
    .from("job_order_employees")
    .insert({
      full_name: `${TAG} Has Atm`,
      area_id: area.id,
      has_atm: true,
      landbank_account_number: "1234567890",
    })
    .select()
    .single();

  assert.equal(error, null, `unexpected rejection: ${error?.message}`);
});

test("upsert on legacy_id is idempotent — re-import does not duplicate", async () => {
  const area = await makeArea(`${TAG}-idem`);
  const legacyId = Number(String(Date.now()).slice(-9));
  const row = {
    legacy_id: legacyId,
    full_name: `${TAG} Juan Cruz`,
    area_id: area.id,
    daily_rate: 400,
  };

  const first = await admin
    .from("job_order_employees")
    .upsert(row, { onConflict: "legacy_id", ignoreDuplicates: false });
  assert.equal(first.error, null, `first upsert failed: ${first.error?.message}`);

  const second = await admin
    .from("job_order_employees")
    .upsert(
      { ...row, daily_rate: 450 },
      { onConflict: "legacy_id", ignoreDuplicates: false },
    );
  assert.equal(second.error, null, `second upsert failed: ${second.error?.message}`);

  const { data } = await admin
    .from("job_order_employees")
    .select("id, daily_rate")
    .eq("legacy_id", legacyId);

  assert.equal(data!.length, 1, "re-import must not duplicate the roster");
  assert.equal(Number(data![0].daily_rate), 450, "re-import must update in place");
});

test("an area with members cannot be hard-deleted", async () => {
  const area = await makeArea(`${TAG}-restrict`);
  await admin
    .from("job_order_employees")
    .insert({ full_name: `${TAG} Member`, area_id: area.id });

  const { error } = await admin
    .from("job_order_areas")
    .delete()
    .eq("id", area.id);

  assert.ok(error, "expected ON DELETE RESTRICT to block this");
  assert.equal(error!.code, "23503");
});

test("legacy deleted_at survives insert as a soft delete", async () => {
  const area = await makeArea(`${TAG}-softdel`);
  const when = "2024-03-01T00:00:00.000Z";
  const { data, error } = await admin
    .from("job_order_employees")
    .insert({
      full_name: `${TAG} Departed`,
      area_id: area.id,
      deleted_at: when,
    })
    .select("deleted_at")
    .single();

  assert.equal(error, null);
  assert.equal(new Date(data!.deleted_at!).toISOString(), when);
});
```

- [ ] **Step 2: Run to verify they fail against an un-migrated stack**

```bash
node --experimental-strip-types --test supabase/tests/job-orders.test.mts
```

Expected: FAIL — the `job_order_areas` relation does not exist yet if `db reset` has not been run since Task 1.

- [ ] **Step 3: Apply migrations locally and re-run**

```bash
colima start && npm run db:start && npm run db:reset
node --experimental-strip-types --test supabase/tests/job-orders.test.mts
```

Expected: PASS — all 9 tests.

- [ ] **Step 4: Wire into the npm test script**

In `package.json`:

```json
    "test:db": "node --experimental-strip-types --test supabase/tests/dtr-import.test.mts supabase/tests/job-orders.test.mts",
```

- [ ] **Step 5: Full verification**

```bash
npm test && npm run lint && npm run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/tests/job-orders.test.mts package.json
git commit -m "test(jo): add real-stack tests for job orders schema"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| `job_order_areas` / `job_order_employees` schema | 1 |
| `Unassigned` seed area | 1 |
| `jo_manager` role + `canManageJobOrders` | 3 |
| Area CRUD, soft delete, delete guard | 5, 7 |
| Employee CRUD, soft delete | 6, 7 |
| Conditional ATM field (form + DB constraint) | 4, 6, 7, 9 |
| Inactive areas not assignable to new records | 6, 7 |
| Editing a record whose area went inactive | 7 |
| Search / sort / pagination / status filters | 7 |
| purok + barangay separate, joined for display | 2, 6, 7 |
| CSV import, idempotent on `legacy_id` | 8, 9 |
| Auto-created areas reported | 8 |
| Parse failures warn rather than reject | 8 |
| Shared CSV helper extraction | 8 |
| Sidebar group | 7, 8 |
| Verification order (real stack, unit, lint+build) | 2, 9 |

**Deliberately out of scope** (spec confirms): payroll, memos, special orders, retiring `/jo-payroll`, deleting dormant `employment_type='jo'` rows, `jo_logs` migration, sub-area CRUD, area scoping.

**Notes on decisions made while planning:**

- **`previous_daily_rate` is maintained on update** (Task 6), not just imported. The legacy system tracked rate changes in `jo_logs`, which we chose not to migrate; keeping the previous rate on the row preserves the single most useful part of that history at no cost.
- **The area delete guard lives in the action, not the FK.** `ON DELETE RESTRICT` cannot fire on a soft delete, so Task 5 checks the member count explicitly. Task 9 tests both paths.
- **`getJobOrderEmployees` has no server-side pagination.** The legacy roster is under 600 rows and `<DataTable>` paginates client-side, matching `/employees`. If the roster grows past a few thousand this needs revisiting.
