# COS Module — Spec 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated Contract of Service employee registry (`hris.cos_employees`) with full CRUD, a `cos_manager` role, and the `/cos` module shell that COS-2 through COS-5 build on.

**Architecture:** Two SQL migrations create the `cos_manager` enum value and the `cos_employees` table. A single server-actions file (`cos-employee-actions.ts`) is the data layer, funnelling every read through one `baseQuery()` helper so the new `deleted_at` soft-delete filter cannot be forgotten. Pages are Next 16 server components that call those actions and compose the existing `<DataTable>`; forms are react-hook-form + zod. Nothing existing is modified except role plumbing and one new sidebar group — COS-1 is purely additive.

**Tech Stack:** Next.js 16.2 (App Router, React 19), TypeScript strict, Supabase Postgres (`hris` schema), Tailwind v4, shadcn/ui (`base-nova`), react-hook-form + zod, @tanstack/react-table, sonner, Node 22 test runner.

**Spec:** `docs/superpowers/specs/2026-07-26-cos-foundation-design.md`

## Global Constraints

- **Branch:** `feat/cos-module` (already created from `main`).
- **Every Supabase query must call `.schema("hris")` before `.from(...)`.** The JS client does not honour the database `search_path`; omitting it silently queries `public`.
- **Migrations are written, not applied.** The developer applies them to production directly. Never suggest `supabase db push`, the CLI, or the dashboard, and never add a reminder to run one. Locally, `npm run db:reset` applies them for testing.
- **Migration files start with `SET search_path TO hris, public, auth, extensions;`** when they touch the `hris` schema, and keep the numeric prefix sequence.
- **Migration numbers are 057 and 058.** The sibling `feat/job-orders-module` branch claims 055 and 056. If that branch has merged with different numbers, renumber to stay sequential before writing the files.
- **`ALTER TYPE ... ADD VALUE` cannot run inside a transaction block**, and a newly added enum value cannot be referenced in the transaction that adds it. That is why the role gets its own migration file, applied before 058.
- **Server actions use the admin client** (`createAdminClient` from `@/lib/supabase/admin`) and re-implement authorization in TypeScript. Never import that module from a `"use client"` file.
- **Every mutating action calls `logAudit()`** from `@/lib/audit` after the write, then `revalidatePath()`.
- **Next 16:** `params` and `searchParams` are async — `await` them before destructuring. Do not create a `middleware.ts`.
- **UI primitives under `src/components/ui/` are auto-generated — do not hand-edit them.**
- **Soft delete is new to this codebase.** `deleted_at` appears in none of the existing 54 migrations. Reads filter `deleted_at IS NULL`; delete is an `UPDATE`, never `DELETE FROM`.
- **Test files import source with an explicit `.ts` extension and a relative path** (e.g. `../../src/lib/cos-constants.ts`). The `@/*` path alias does **not** resolve under `node --experimental-strip-types`. Type-only imports (`import type { X } from "@/lib/types"`) are fine — they are erased.
- **Node 22 required** for tests (`nvm use`). The real-stack suite needs the local stack up: `colima start && npm run db:start`.
- **Close every change with `npm run lint && npm run build`.**

---

### Task 1: Database schema and shared constants

**Files:**
- Create: `supabase/migrations/057_add_cos_manager_role.sql`
- Create: `supabase/migrations/058_cos_module_foundation.sql`
- Create: `src/lib/cos-constants.ts`
- Create: `supabase/tests/cos-employees.test.mts`
- Modify: `package.json` (test scripts)

**Interfaces:**
- Consumes: nothing (first task)
- Produces:
  - Table `hris.cos_employees` with the columns listed below
  - `COS_EMPLOYEE_STATUSES: readonly ["active","inactive"]`, `type CosEmployeeStatus`
  - `COS_EMPLOYEE_STATUS_LABELS: Record<CosEmployeeStatus, string>`
  - `COS_EMPLOYEE_STATUS_VARIANT: Record<CosEmployeeStatus, "default" | "secondary">`
  - `COS_SEXES: readonly ["male","female"]`, `type CosSex`, `COS_SEX_LABELS`
  - `formatCosEmployeeName(e: CosEmployeeNameParts): string`
  - `type CosEmployeeNameParts = { first_name: string; middle_name?: string | null; last_name: string; suffix?: string | null }`

- [ ] **Step 1: Write the failing real-stack test**

Create `supabase/tests/cos-employees.test.mts`:

```ts
// Schema-level tests for hris.cos_employees against the LOCAL Supabase stack
// (real Postgres + real PostgREST).
//
// These prove the constraints the app relies on but cannot enforce itself:
// the partial unique index on cos_no (live rows only), the CHECK constraints,
// the ON DELETE RESTRICT on department_id, and the updated_at trigger.
//
// Credentials come from `supabase status -o json` and are never printed.
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

// Seeded by supabase/seed.sql — "Office of the City Mayor".
const DEPT = "00000000-0000-0000-0000-0000000000d1";
const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const FK_VIOLATION = "23503";

// Every row this suite creates carries a recognisable cos_no prefix so cleanup
// cannot touch anything else.
const PREFIX = "TEST-COS-";

async function cleanup() {
  await admin.from("cos_employees").delete().like("cos_no", `${PREFIX}%`);
}

function newEmployee(cosNo: string, overrides: Record<string, unknown> = {}) {
  return {
    cos_no: cosNo,
    first_name: "Juan",
    last_name: "Dela Cruz",
    department_id: DEPT,
    ...overrides,
  };
}

test.before(cleanup);
test.after(cleanup);

test("inserts a COS employee with status defaulting to active", async () => {
  const { data, error } = await admin
    .from("cos_employees")
    .insert(newEmployee(`${PREFIX}001`))
    .select()
    .single();

  assert.equal(error, null);
  assert.equal(data.status, "active");
  assert.equal(data.deleted_at, null);
});

test("rejects a duplicate cos_no among live rows", async () => {
  await admin.from("cos_employees").insert(newEmployee(`${PREFIX}002`));

  const { error } = await admin
    .from("cos_employees")
    .insert(newEmployee(`${PREFIX}002`));

  assert.equal(error?.code, UNIQUE_VIOLATION);
});

test("accepts the same cos_no once the holder is soft-deleted", async () => {
  await admin.from("cos_employees").insert(newEmployee(`${PREFIX}003`));
  await admin
    .from("cos_employees")
    .update({ deleted_at: new Date().toISOString() })
    .eq("cos_no", `${PREFIX}003`);

  const { error } = await admin
    .from("cos_employees")
    .insert(newEmployee(`${PREFIX}003`));

  assert.equal(error, null);
});

test("rejects an out-of-range sex", async () => {
  const { error } = await admin
    .from("cos_employees")
    .insert(newEmployee(`${PREFIX}004`, { sex: "unknown" }));

  assert.equal(error?.code, CHECK_VIOLATION);
});

test("rejects an out-of-range status", async () => {
  const { error } = await admin
    .from("cos_employees")
    .insert(newEmployee(`${PREFIX}005`, { status: "archived" }));

  assert.equal(error?.code, CHECK_VIOLATION);
});

test("rejects a department_id that does not exist", async () => {
  const { error } = await admin.from("cos_employees").insert(
    newEmployee(`${PREFIX}006`, {
      department_id: "00000000-0000-0000-0000-00000000dead",
    }),
  );

  assert.equal(error?.code, FK_VIOLATION);
});

test("advances updated_at on UPDATE", async () => {
  const { data: created } = await admin
    .from("cos_employees")
    .insert(newEmployee(`${PREFIX}007`))
    .select()
    .single();

  await new Promise((r) => setTimeout(r, 10));

  const { data: updated } = await admin
    .from("cos_employees")
    .update({ remarks: "touched" })
    .eq("id", created.id)
    .select()
    .single();

  assert.ok(
    new Date(updated.updated_at) > new Date(created.updated_at),
    "updated_at should advance",
  );
});
```

- [ ] **Step 2: Add the test scripts and run the test to verify it fails**

In `package.json`, add two scripts alongside the existing `test:dtr` / `test:db`, and extend `test`:

```json
"test:cos": "node --experimental-strip-types --test supabase/tests/cos-unit.test.mts",
"test:cos-db": "node --experimental-strip-types --test supabase/tests/cos-employees.test.mts",
"test": "npm run test:dtr && npm run test:cos && npm run test:db && npm run test:cos-db"
```

`test:cos` refers to a file created in Task 2. Until then run the DB suite directly.

Run: `npm run db:start && npm run test:cos-db`
Expected: FAIL — every test errors because relation `hris.cos_employees` does not exist (PostgREST returns `PGRST205`, "Could not find the table").

- [ ] **Step 3: Write the role migration**

Create `supabase/migrations/057_add_cos_manager_role.sql`:

```sql
-- Migration 057: Add "cos_manager" role.
--
-- COS Manager is a dedicated Contract of Service role: it manages the COS
-- employee registry, contracts and renewals, contract templates, and COS
-- payroll. It carries NO other access: no plantilla employees, attendance/DTR,
-- leave, CTO/COC, RSP, regular or JO payroll, reports, or any other
-- administration tool. App-side authorization treats cos_manager via
-- canManageCos() (src/lib/auth-helpers.ts).
--
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction block, and a
-- newly added enum value cannot be referenced in the same transaction in which
-- it is added. That is why this is its own migration, ahead of 058.
SET search_path TO hris, public, auth, extensions;

ALTER TYPE hris.user_role
  ADD VALUE IF NOT EXISTS 'cos_manager';
```

- [ ] **Step 4: Write the table migration**

Create `supabase/migrations/058_cos_module_foundation.sql`:

```sql
-- Migration 058: Contract of Service module — employee registry.
--
-- COS personnel get a dedicated table rather than living in hris.employees.
-- Contracts (COS-3) and the rebuilt COS payroll (COS-4) foreign-key here.
--
-- The registry starts EMPTY by design: no data is copied from hris.employees.
-- The dormant employment_type = 'cos' rows there are left untouched so their
-- attendance, DTR, leave, CTO and salary history are not cascade-deleted; they
-- are hidden from /employees in COS-4.
--
-- Soft delete: this is the first table in the schema to use deleted_at. Every
-- read must filter `deleted_at IS NULL`; the app funnels reads through a single
-- baseQuery() helper in cos-employee-actions.ts so the filter cannot be
-- forgotten.
SET search_path TO hris, public, auth, extensions;

CREATE TABLE hris.cos_employees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity. cos_no is the "CMO ID No." column on the COS payroll printable
  -- (PayrollCosRow.cmoIdNo in src/lib/pdf/generatePayroll.ts).
  cos_no          TEXT NOT NULL,
  first_name      TEXT NOT NULL,
  middle_name     TEXT,
  last_name       TEXT NOT NULL,
  suffix          TEXT,

  -- Personal information
  sex             TEXT CHECK (sex IN ('male', 'female')),
  birth_date      DATE,
  address         TEXT,
  contact_number  TEXT,
  email           TEXT,

  -- Employment information. position_title is free text: COS hires carry no
  -- plantilla item, so there is nothing to reference in hris.positions.
  department_id   UUID REFERENCES hris.departments(id) ON DELETE RESTRICT,
  position_title  TEXT,
  eligibility     TEXT,
  recommended_by  TEXT,
  remarks         TEXT,

  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive')),

  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  created_by      UUID REFERENCES hris.user_profiles(id),
  updated_by      UUID REFERENCES hris.user_profiles(id),
  deleted_at      TIMESTAMPTZ
);

-- cos_no is unique among live rows only, so a soft-deleted record never blocks
-- reissuing its number.
CREATE UNIQUE INDEX uq_cos_employees_cos_no
  ON hris.cos_employees(cos_no) WHERE deleted_at IS NULL;

CREATE INDEX idx_cos_employees_name
  ON hris.cos_employees(lower(last_name), lower(first_name));
CREATE INDEX idx_cos_employees_department
  ON hris.cos_employees(department_id);
CREATE INDEX idx_cos_employees_status
  ON hris.cos_employees(status) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_cos_employees_updated_at
  BEFORE UPDATE ON hris.cos_employees
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

GRANT ALL    ON hris.cos_employees TO service_role;
GRANT SELECT ON hris.cos_employees TO authenticated;
```

- [ ] **Step 5: Apply locally and run the test to verify it passes**

Run: `npm run db:reset && npm run test:cos-db`
Expected: PASS — all 7 tests.

If `db:reset` fails before reaching 057, that is a pre-existing problem with an earlier migration, not this task. `supabase/migrations/0115_local_legacy_staging_stubs.sql` exists to keep `db:reset` alive at migration 012; do not modify it.

- [ ] **Step 6: Write the shared constants**

Create `src/lib/cos-constants.ts`. It must not import anything at runtime — it is loaded directly by the Node test runner, which cannot resolve the `@/*` alias.

```ts
// Contract of Service shared constants.
// Value lists mirror the CHECK constraints in
// supabase/migrations/058_cos_module_foundation.sql — keep them in sync.

export const COS_EMPLOYEE_STATUSES = ["active", "inactive"] as const;
export type CosEmployeeStatus = (typeof COS_EMPLOYEE_STATUSES)[number];

export const COS_EMPLOYEE_STATUS_LABELS: Record<CosEmployeeStatus, string> = {
  active: "Active",
  inactive: "Inactive",
};

export const COS_EMPLOYEE_STATUS_VARIANT: Record<
  CosEmployeeStatus,
  "default" | "secondary"
> = {
  active: "default",
  inactive: "secondary",
};

export const COS_SEXES = ["male", "female"] as const;
export type CosSex = (typeof COS_SEXES)[number];

export const COS_SEX_LABELS: Record<CosSex, string> = {
  male: "Male",
  female: "Female",
};

export interface CosEmployeeNameParts {
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  suffix?: string | null;
}

/**
 * "Dela Cruz, Juan Santos Jr." — surname first, for list sorting and print.
 * Absent middle name and suffix collapse without leaving double spaces.
 */
export function formatCosEmployeeName(e: CosEmployeeNameParts): string {
  const given = [e.first_name, e.middle_name, e.suffix]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part)
    .join(" ");
  return given ? `${e.last_name.trim()}, ${given}` : e.last_name.trim();
}
```

- [ ] **Step 7: Verify the build and commit**

Run: `npm run lint && npm run build`
Expected: both succeed.

```bash
git add supabase/migrations/057_add_cos_manager_role.sql \
        supabase/migrations/058_cos_module_foundation.sql \
        src/lib/cos-constants.ts \
        supabase/tests/cos-employees.test.mts \
        package.json
git commit -m "feat(cos): add cos_employees table, cos_manager enum value, shared constants"
```

---

### Task 2: Role plumbing and `canManageCos`

**Files:**
- Create: `supabase/tests/cos-unit.test.mts`
- Modify: `src/lib/types.ts` (the `UserRole` union, around line 12)
- Modify: `src/lib/constants.ts` (the `USER_ROLES` map, around line 5)
- Modify: `src/lib/auth-helpers.ts` (append)
- Modify: `src/lib/validations/user-schema.ts` (the role enum, around line 16)
- Modify: `src/components/tables/columns/user-columns.tsx` (label + variant maps, around lines 24 and 36)
- Modify: `src/components/forms/user-form.tsx` (the role options array, around line 46)

**Interfaces:**
- Consumes: `formatCosEmployeeName`, `COS_EMPLOYEE_STATUS_LABELS` from `@/lib/cos-constants` (Task 1)
- Produces:
  - `UserRole` union gains `"cos_manager"`
  - `canManageCos(role: UserRole | null | undefined): boolean` exported from `@/lib/auth-helpers`

- [ ] **Step 1: Write the failing unit test**

Create `supabase/tests/cos-unit.test.mts`. Note the explicit `.ts` extensions and relative paths — the `@/*` alias does not resolve here.

```ts
// Pure unit tests for the COS module's non-database logic. No stack required.
//   npm run test:cos

import assert from "node:assert/strict";
import test from "node:test";
import { canManageCos } from "../../src/lib/auth-helpers.ts";
import { formatCosEmployeeName } from "../../src/lib/cos-constants.ts";

test("canManageCos admits the three COS roles", () => {
  assert.equal(canManageCos("super_admin"), true);
  assert.equal(canManageCos("hr_admin"), true);
  assert.equal(canManageCos("cos_manager"), true);
});

test("canManageCos rejects every other role", () => {
  for (const role of [
    "ocm_admin",
    "hr_record_manager",
    "department_head",
    "department_admin",
    "department_admin_and_department_head",
    "dtr_manager",
    "employee",
  ] as const) {
    assert.equal(canManageCos(role), false, `${role} must not manage COS`);
  }
});

test("canManageCos rejects null and undefined", () => {
  assert.equal(canManageCos(null), false);
  assert.equal(canManageCos(undefined), false);
});

test("formatCosEmployeeName puts the surname first", () => {
  assert.equal(
    formatCosEmployeeName({
      first_name: "Juan",
      middle_name: "Santos",
      last_name: "Dela Cruz",
      suffix: "Jr.",
    }),
    "Dela Cruz, Juan Santos Jr.",
  );
});

test("formatCosEmployeeName collapses an absent middle name and suffix", () => {
  assert.equal(
    formatCosEmployeeName({
      first_name: "Maria",
      middle_name: null,
      last_name: "Reyes",
      suffix: null,
    }),
    "Reyes, Maria",
  );
});

test("formatCosEmployeeName treats whitespace-only parts as absent", () => {
  assert.equal(
    formatCosEmployeeName({
      first_name: "Ana",
      middle_name: "   ",
      last_name: "Lim",
      suffix: "",
    }),
    "Lim, Ana",
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:cos`
Expected: FAIL — `canManageCos` is not exported from `auth-helpers.ts`.

- [ ] **Step 3: Add the role to the type union and constants map**

In `src/lib/types.ts`, add `"cos_manager"` to the `UserRole` union, after `"dtr_manager"`:

```ts
export type UserRole =
  | "super_admin"
  | "ocm_admin"
  | "hr_admin"
  | "hr_record_manager"
  | "department_head"
  | "department_admin"
  | "department_admin_and_department_head"
  | "dtr_manager"
  | "cos_manager"
  | "employee";
```

In `src/lib/constants.ts`, add the entry to `USER_ROLES`:

```ts
export const USER_ROLES = {
  SUPER_ADMIN: "super_admin",
  OCM_ADMIN: "ocm_admin",
  HR_ADMIN: "hr_admin",
  HR_RECORD_MANAGER: "hr_record_manager",
  COS_MANAGER: "cos_manager",
  DEPARTMENT_HEAD: "department_head",
  EMPLOYEE: "employee",
} as const;
```

This map is already incomplete — it omits `department_admin`, `department_admin_and_department_head` and `dtr_manager`. Add `COS_MANAGER` only; do not fix the pre-existing gaps in this task.

- [ ] **Step 4: Add the `canManageCos` helper**

Append to `src/lib/auth-helpers.ts`:

```ts
// Roles that manage the Contract of Service module: the COS employee registry,
// contracts and renewals, contract templates, and COS payroll. "cos_manager" is
// a dedicated role limited to exactly this reach — it has NO access to
// plantilla employees, attendance/DTR, leave, CTO/COC, RSP, regular or JO
// payroll, reports, or any other administration tool. hr_admin is included to
// preserve the access it holds today under the /cos-payroll guard.
const COS_MANAGER_ROLES: readonly UserRole[] = [
  "super_admin",
  "hr_admin",
  "cos_manager",
] as const;

export function canManageCos(role: UserRole | null | undefined): boolean {
  return !!role && COS_MANAGER_ROLES.includes(role);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:cos`
Expected: PASS — all 6 tests.

- [ ] **Step 6: Wire the role into the user-management UI**

In `src/lib/validations/user-schema.ts`, add `"cos_manager"` to the role enum list (it sits with `"hr_record_manager"` and `"dtr_manager"` around lines 16–20).

In `src/components/tables/columns/user-columns.tsx`, add to both maps:

```ts
// in the label map (near line 24)
cos_manager: "COS Manager",
// in the badge-variant map (near line 36)
cos_manager: "secondary",
```

In `src/components/forms/user-form.tsx`, add to the role options array (near line 46):

```ts
{ value: "cos_manager", label: "COS Manager" },
```

- [ ] **Step 7: Regenerate database types**

Run: `npm run db:types`
Expected: `src/lib/database.types.ts` is rewritten and now contains `cos_employees` and `cos_manager`.

`src/lib/types.ts` is the hand-maintained mirror used by app code; it was updated by hand in Step 3. Both are expected to exist.

- [ ] **Step 8: Verify and commit**

Run: `npm run lint && npm run build && npm run test:cos`
Expected: all succeed.

```bash
git add src/lib/types.ts src/lib/constants.ts src/lib/auth-helpers.ts \
        src/lib/validations/user-schema.ts \
        src/components/tables/columns/user-columns.tsx \
        src/components/forms/user-form.tsx \
        src/lib/database.types.ts \
        supabase/tests/cos-unit.test.mts
git commit -m "feat(cos): add cos_manager role and canManageCos helper"
```

---

### Task 3: Validation schema and server actions

**Files:**
- Create: `src/lib/validations/cos-employee-schema.ts`
- Create: `src/lib/actions/cos-employee-actions.ts`
- Modify: `supabase/tests/cos-employees.test.mts` (append behaviour tests)

**Interfaces:**
- Consumes: `COS_EMPLOYEE_STATUSES`, `COS_SEXES` from `@/lib/cos-constants` (Task 1); `canManageCos` from `@/lib/auth-helpers` (Task 2)
- Produces:
  - `cosEmployeeFormSchema` (zod) and `type CosEmployeeFormValues`
  - `type CosEmployeeWithDepartment` — a `cos_employees` row plus `departments: { name: string; code: string } | null`
  - `getCosEmployees(): Promise<CosEmployeeWithDepartment[]>`
  - `getCosEmployee(id: string): Promise<CosEmployeeWithDepartment | null>`
  - `createCosEmployee(input: CosEmployeeFormValues): Promise<{ data: CosEmployeeWithDepartment } | { error: string; field?: "cos_no" }>`
  - `updateCosEmployee(id: string, input: CosEmployeeFormValues): Promise<{ data: CosEmployeeWithDepartment } | { error: string; field?: "cos_no" }>`
  - `deleteCosEmployee(id: string): Promise<{ success: true } | { error: string }>`

- [ ] **Step 1: Write the failing behaviour tests**

Append to `supabase/tests/cos-employees.test.mts`. These exercise the soft-delete contract at the database level, which is what the `baseQuery()` helper depends on:

```ts
test("a soft-deleted row is invisible to a deleted_at IS NULL read", async () => {
  const { data: created } = await admin
    .from("cos_employees")
    .insert(newEmployee(`${PREFIX}010`))
    .select()
    .single();

  await admin
    .from("cos_employees")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", created.id);

  const { data: live } = await admin
    .from("cos_employees")
    .select("id")
    .is("deleted_at", null)
    .eq("id", created.id)
    .maybeSingle();

  assert.equal(live, null);
});

test("the department join returns name and code", async () => {
  await admin.from("cos_employees").insert(newEmployee(`${PREFIX}011`));

  const { data, error } = await admin
    .from("cos_employees")
    .select("id, cos_no, departments(name, code)")
    .is("deleted_at", null)
    .eq("cos_no", `${PREFIX}011`)
    .single();

  assert.equal(error, null);
  assert.equal(data.departments?.code, "OCM");
});

test("hard-deleting a referenced department is blocked", async () => {
  await admin.from("cos_employees").insert(newEmployee(`${PREFIX}012`));

  const { error } = await admin.from("departments").delete().eq("id", DEPT);

  assert.equal(error?.code, FK_VIOLATION);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:cos-db`
Expected: the department-join test FAILS — PostgREST cannot embed `departments` until it detects the foreign key from the reset in Task 1. If Task 1's `db:reset` already ran, this test passes immediately; the soft-delete and FK-restrict tests should pass too, since they test constraints Task 1 created. That is fine — they are regression cover for the actions written next, and the meaningful failure comes in Step 4.

- [ ] **Step 3: Write the validation schema**

Create `src/lib/validations/cos-employee-schema.ts`:

```ts
import { z } from "zod";
import { COS_EMPLOYEE_STATUSES, COS_SEXES } from "@/lib/cos-constants";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Blank text inputs arrive as "" from the DOM; store NULL instead so the
// database never holds an empty string alongside real absences.
const optionalText = z
  .string()
  .transform((v) => (v.trim() === "" ? null : v.trim()))
  .nullable()
  .optional();

const optionalIsoDate = z
  .string()
  .regex(ISO_DATE, "Use a valid date (YYYY-MM-DD)")
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

export const cosEmployeeFormSchema = z.object({
  cos_no: z.string().trim().min(1, "COS number is required"),
  first_name: z.string().trim().min(1, "First name is required"),
  middle_name: optionalText,
  last_name: z.string().trim().min(1, "Last name is required"),
  suffix: optionalText,

  sex: z.enum(COS_SEXES).nullable().optional(),
  birth_date: optionalIsoDate,
  address: optionalText,
  contact_number: optionalText,
  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),

  department_id: z.string().uuid("Select a department").nullable().optional(),
  position_title: optionalText,
  eligibility: optionalText,
  recommended_by: optionalText,
  remarks: optionalText,

  status: z.enum(COS_EMPLOYEE_STATUSES).default("active"),
});

export type CosEmployeeFormValues = z.infer<typeof cosEmployeeFormSchema>;
```

- [ ] **Step 4: Write the server actions**

Create `src/lib/actions/cos-employee-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageCos } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import {
  cosEmployeeFormSchema,
  type CosEmployeeFormValues,
} from "@/lib/validations/cos-employee-schema";
import type { CosEmployeeStatus, CosSex } from "@/lib/cos-constants";

const UNIQUE_VIOLATION = "23505";

const SELECT_WITH_DEPARTMENT =
  "*, departments(name, code)";

export interface CosEmployeeWithDepartment {
  id: string;
  cos_no: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  sex: CosSex | null;
  birth_date: string | null;
  address: string | null;
  contact_number: string | null;
  email: string | null;
  department_id: string | null;
  position_title: string | null;
  eligibility: string | null;
  recommended_by: string | null;
  remarks: string | null;
  status: CosEmployeeStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  departments: { name: string; code: string } | null;
}

interface AuthOk {
  user: { id: string; email: string };
}

async function requireCosManager(): Promise<AuthOk | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (!canManageCos(user.role)) return { error: "Insufficient permissions" };
  return { user: { id: user.id, email: user.email } };
}

/**
 * The ONLY place `cos_employees` is read from. Applies the schema and the
 * soft-delete filter together so neither can be forgotten at a call site.
 * Do not call `.from("cos_employees")` anywhere else in this module.
 */
function baseQuery() {
  return createAdminClient()
    .schema("hris")
    .from("cos_employees")
    .select(SELECT_WITH_DEPARTMENT)
    .is("deleted_at", null);
}

export async function getCosEmployees(): Promise<CosEmployeeWithDepartment[]> {
  const auth = await requireCosManager();
  if ("error" in auth) return [];

  const { data, error } = await baseQuery()
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as CosEmployeeWithDepartment[];
}

export async function getCosEmployee(
  id: string,
): Promise<CosEmployeeWithDepartment | null> {
  const auth = await requireCosManager();
  if ("error" in auth) return null;

  const { data, error } = await baseQuery().eq("id", id).maybeSingle();

  if (error) throw error;
  return (data as unknown as CosEmployeeWithDepartment) ?? null;
}

export async function createCosEmployee(input: CosEmployeeFormValues) {
  const auth = await requireCosManager();
  if ("error" in auth) return auth;

  const parsed = cosEmployeeFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { data, error } = await createAdminClient()
    .schema("hris")
    .from("cos_employees")
    .insert({
      ...parsed.data,
      created_by: auth.user.id,
      updated_by: auth.user.id,
    })
    .select(SELECT_WITH_DEPARTMENT)
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return {
        error: `COS number "${parsed.data.cos_no}" is already in use`,
        field: "cos_no" as const,
      };
    }
    return { error: error.message };
  }

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "cos_employee_created",
    tableName: "cos_employees",
    recordId: data.id,
    newValues: parsed.data,
  });

  revalidatePath("/cos/employees");
  return { data: data as unknown as CosEmployeeWithDepartment };
}

export async function updateCosEmployee(
  id: string,
  input: CosEmployeeFormValues,
) {
  const auth = await requireCosManager();
  if ("error" in auth) return auth;

  const parsed = cosEmployeeFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const before = await getCosEmployee(id);
  if (!before) return { error: "COS employee not found" };

  const { data, error } = await createAdminClient()
    .schema("hris")
    .from("cos_employees")
    .update({ ...parsed.data, updated_by: auth.user.id })
    .eq("id", id)
    .is("deleted_at", null)
    .select(SELECT_WITH_DEPARTMENT)
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return {
        error: `COS number "${parsed.data.cos_no}" is already in use`,
        field: "cos_no" as const,
      };
    }
    return { error: error.message };
  }

  await logAudit({
    userId: auth.user.id,
    userEmail: auth.user.email,
    action: "cos_employee_updated",
    tableName: "cos_employees",
    recordId: id,
    oldValues: before,
    newValues: parsed.data,
  });

  revalidatePath("/cos/employees");
  revalidatePath(`/cos/employees/${id}`);
  return { data: data as unknown as CosEmployeeWithDepartment };
}

/**
 * Soft delete. Contracts (COS-3) reference these rows, so a hard delete would
 * orphan contract history. super_admin only, matching the destructive-delete
 * rule the payroll actions already follow.
 */
export async function deleteCosEmployee(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };
  if (user.role !== "super_admin") return { error: "Insufficient permissions" };

  const before = await getCosEmployee(id);
  if (!before) return { error: "COS employee not found" };

  const { error } = await createAdminClient()
    .schema("hris")
    .from("cos_employees")
    .update({ deleted_at: new Date().toISOString(), updated_by: user.id })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) return { error: error.message };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "cos_employee_deleted",
    tableName: "cos_employees",
    recordId: id,
    oldValues: before,
  });

  revalidatePath("/cos/employees");
  return { success: true as const };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:cos-db && npm run test:cos`
Expected: PASS — 10 database tests, 6 unit tests.

- [ ] **Step 6: Verify and commit**

Run: `npm run lint && npm run build`
Expected: both succeed.

```bash
git add src/lib/validations/cos-employee-schema.ts \
        src/lib/actions/cos-employee-actions.ts \
        supabase/tests/cos-employees.test.mts
git commit -m "feat(cos): add COS employee validation schema and server actions"
```

---

### Task 4: List page, table columns, and sidebar entry

**Files:**
- Create: `src/components/tables/columns/cos-employee-columns.tsx`
- Create: `src/components/cos/cos-employee-list-client.tsx`
- Create: `src/app/(dashboard)/cos/employees/page.tsx`
- Create: `src/app/(dashboard)/cos/employees/loading.tsx`
- Modify: `src/components/layout/app-sidebar.tsx`

**Interfaces:**
- Consumes: `getCosEmployees`, `CosEmployeeWithDepartment` (Task 3); `formatCosEmployeeName`, `COS_EMPLOYEE_STATUS_LABELS`, `COS_EMPLOYEE_STATUS_VARIANT`, `COS_EMPLOYEE_STATUSES` (Task 1); `canManageCos` (Task 2)
- Produces:
  - `cosEmployeeColumns: ColumnDef<CosEmployeeWithDepartment>[]`
  - `<CosEmployeeListClient employees departmentOptions canCreate />`

- [ ] **Step 1: Write the column definitions**

Create `src/components/tables/columns/cos-employee-columns.tsx`:

```tsx
"use client";

import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import type { CosEmployeeWithDepartment } from "@/lib/actions/cos-employee-actions";
import {
  COS_EMPLOYEE_STATUS_LABELS,
  COS_EMPLOYEE_STATUS_VARIANT,
  formatCosEmployeeName,
} from "@/lib/cos-constants";

export const cosEmployeeColumns: ColumnDef<CosEmployeeWithDepartment>[] = [
  {
    accessorKey: "cos_no",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="COS No." />
    ),
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.cos_no}</span>
    ),
  },
  {
    id: "name",
    // The accessor value drives both sorting and the toolbar search box, so it
    // carries cos_no as well — one input matches either a name or a number.
    // The cell renders the name alone.
    accessorFn: (row) => `${formatCosEmployeeName(row)} ${row.cos_no}`,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => (
      <Link
        href={`/cos/employees/${row.original.id}`}
        className="font-medium text-primary hover:underline"
      >
        {formatCosEmployeeName(row.original)}
      </Link>
    ),
  },
  {
    id: "department",
    accessorFn: (row) => row.departments?.name ?? "—",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Office / Department" />
    ),
    // The faceted filter compares against the accessor value, so the filter
    // options must be department NAMES, not ids.
    filterFn: (row, id, value: string[]) =>
      value.includes(row.getValue(id) as string),
  },
  {
    id: "position_title",
    accessorFn: (row) => row.position_title ?? "—",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Position" />
    ),
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => (
      <Badge variant={COS_EMPLOYEE_STATUS_VARIANT[row.original.status]}>
        {COS_EMPLOYEE_STATUS_LABELS[row.original.status]}
      </Badge>
    ),
    filterFn: (row, id, value: string[]) =>
      value.includes(row.getValue(id) as string),
  },
];
```

- [ ] **Step 2: Write the list client**

Create `src/components/cos/cos-employee-list-client.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/data-table";
import { cosEmployeeColumns } from "@/components/tables/columns/cos-employee-columns";
import type { CosEmployeeWithDepartment } from "@/lib/actions/cos-employee-actions";
import {
  COS_EMPLOYEE_STATUSES,
  COS_EMPLOYEE_STATUS_LABELS,
} from "@/lib/cos-constants";

interface CosEmployeeListClientProps {
  employees: CosEmployeeWithDepartment[];
  /** Department names, matching the "department" column's accessor value. */
  departmentOptions: { label: string; value: string }[];
  canCreate: boolean;
}

export function CosEmployeeListClient({
  employees,
  departmentOptions,
  canCreate,
}: CosEmployeeListClientProps) {
  return (
    <DataTable
      columns={cosEmployeeColumns}
      data={employees}
      searchableColumns={[{ id: "name", title: "name or COS no." }]}
      filterableColumns={[
        { id: "department", title: "Department", options: departmentOptions },
        {
          id: "status",
          title: "Status",
          options: COS_EMPLOYEE_STATUSES.map((s) => ({
            label: COS_EMPLOYEE_STATUS_LABELS[s],
            value: s,
          })),
        },
      ]}
      toolbar={
        canCreate ? (
          <Link href="/cos/employees/new">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Add COS Employee
            </Button>
          </Link>
        ) : null
      }
    />
  );
}
```

- [ ] **Step 3: Write the list page**

Create `src/app/(dashboard)/cos/employees/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CosEmployeeListClient } from "@/components/cos/cos-employee-list-client";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageCos } from "@/lib/auth-helpers";
import { getCosEmployees } from "@/lib/actions/cos-employee-actions";

export default async function CosEmployeesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageCos(user.role)) redirect("/dashboard");

  const employees = await getCosEmployees();

  const total = employees.length;
  const active = employees.filter((e) => e.status === "active").length;
  const inactive = total - active;

  // Filter options are department NAMES because that is what the column's
  // accessorFn returns and what the faceted filter compares against.
  const departmentOptions = Array.from(
    new Set(
      employees
        .map((e) => e.departments?.name)
        .filter((n): n is string => !!n),
    ),
  )
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ label: name, value: name }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">COS Employees</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Contract of Service personnel. Each employee holds a contract history;
          renewals add new contracts without overwriting earlier ones.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Total", value: total },
          { label: "Active", value: active },
          { label: "Inactive", value: inactive },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {total === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="font-medium">No COS employees yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              The registry starts empty. Use “Add COS Employee” to encode the
              first record.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <CosEmployeeListClient
        employees={employees}
        departmentOptions={departmentOptions}
        canCreate={canManageCos(user.role)}
      />
    </div>
  );
}
```

- [ ] **Step 4: Write the loading skeleton**

Create `src/app/(dashboard)/cos/employees/loading.tsx`, mirroring `src/app/(dashboard)/rsp/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}
```

- [ ] **Step 5: Add the sidebar group**

In `src/components/layout/app-sidebar.tsx`:

Add `FileSignature` to the `lucide-react` import block (lines 5–35).

Add a role list beside the other role-list constants (near line 95):

```ts
// Contract of Service module. Mirrors canManageCos() in src/lib/auth-helpers.ts
// — keep the two in sync.
const cosRoles: UserRole[] = ["super_admin", "hr_admin", "cos_manager"];
```

Insert a new nav group into `navGroups` immediately after the `"Payroll"` group (which ends around line 221):

```ts
  {
    label: "Contract of Service",
    roles: cosRoles,
    items: [
      {
        title: "COS Employees",
        href: "/cos/employees",
        icon: FileSignature,
        roles: cosRoles,
      },
    ],
  },
```

Leave the existing `"COS Payroll"` item under the Payroll group untouched — it moves here in COS-4.

- [ ] **Step 6: Verify in the running app**

Run: `npm run dev`

Check, signed in as a `super_admin`:
- "Contract of Service → COS Employees" appears in the sidebar
- `/cos/employees` renders with all three stat cards at 0 and the empty-state card
- The search box and both faceted filters render in the toolbar

Then insert one row locally to confirm the table path (the department id is the seeded OCM office):

```bash
npx supabase db reset >/dev/null 2>&1 || true
psql "$(npx supabase status -o json | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).DB_URL')" \
  -c "insert into hris.cos_employees (cos_no, first_name, last_name, department_id, position_title)
      values ('COS-0001','Juan','Dela Cruz','00000000-0000-0000-0000-0000000000d1','Administrative Aide');"
```

Reload `/cos/employees`. Expected: Total 1 / Active 1 / Inactive 0, one row, name rendered "Dela Cruz, Juan" and linking to `/cos/employees/<id>` (that route 404s until Task 6 — expected). Typing `COS-0001` or `Dela` into the search box keeps the row; typing `zzz` empties the table.

- [ ] **Step 7: Verify and commit**

Run: `npm run lint && npm run build`
Expected: both succeed.

```bash
git add src/components/tables/columns/cos-employee-columns.tsx \
        src/components/cos/cos-employee-list-client.tsx \
        "src/app/(dashboard)/cos/employees/page.tsx" \
        "src/app/(dashboard)/cos/employees/loading.tsx" \
        src/components/layout/app-sidebar.tsx
git commit -m "feat(cos): add COS employees list page, columns, and sidebar group"
```

---

### Task 5: Employee form with create and edit pages

**Files:**
- Create: `src/components/cos/cos-employee-form.tsx`
- Create: `src/app/(dashboard)/cos/employees/new/page.tsx`
- Create: `src/app/(dashboard)/cos/employees/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `createCosEmployee`, `updateCosEmployee`, `getCosEmployee`, `CosEmployeeWithDepartment` (Task 3); `cosEmployeeFormSchema`, `CosEmployeeFormValues` (Task 3); `COS_SEXES`, `COS_SEX_LABELS`, `COS_EMPLOYEE_STATUSES`, `COS_EMPLOYEE_STATUS_LABELS` (Task 1); `getDepartments` from `@/lib/actions/user-actions`
- Produces: `<CosEmployeeForm mode departments employee? />`

- [ ] **Step 1: Write the form component**

Create `src/components/cos/cos-employee-form.tsx`. It follows `src/components/forms/employee-form.tsx`: react-hook-form with `zodResolver`, `register` for text inputs, `setValue`/`watch` for shadcn `Select`s.

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createCosEmployee,
  updateCosEmployee,
  type CosEmployeeWithDepartment,
} from "@/lib/actions/cos-employee-actions";
import {
  cosEmployeeFormSchema,
  type CosEmployeeFormValues,
} from "@/lib/validations/cos-employee-schema";
import {
  COS_EMPLOYEE_STATUSES,
  COS_EMPLOYEE_STATUS_LABELS,
  COS_SEXES,
  COS_SEX_LABELS,
} from "@/lib/cos-constants";

const NONE = "none";

interface CosEmployeeFormProps {
  mode: "create" | "edit";
  departments: { id: string; name: string }[];
  employee?: CosEmployeeWithDepartment;
}

export function CosEmployeeForm({
  mode,
  departments,
  employee,
}: CosEmployeeFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors },
  } = useForm<CosEmployeeFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(cosEmployeeFormSchema) as any,
    defaultValues: {
      cos_no: employee?.cos_no ?? "",
      first_name: employee?.first_name ?? "",
      middle_name: employee?.middle_name ?? null,
      last_name: employee?.last_name ?? "",
      suffix: employee?.suffix ?? null,
      sex: employee?.sex ?? null,
      birth_date: employee?.birth_date ?? null,
      address: employee?.address ?? null,
      contact_number: employee?.contact_number ?? null,
      email: employee?.email ?? null,
      department_id: employee?.department_id ?? null,
      position_title: employee?.position_title ?? null,
      eligibility: employee?.eligibility ?? null,
      recommended_by: employee?.recommended_by ?? null,
      remarks: employee?.remarks ?? null,
      status: employee?.status ?? "active",
    },
  });

  const watchSex = watch("sex");
  const watchDepartment = watch("department_id");
  const watchStatus = watch("status");

  const onSubmit = async (values: CosEmployeeFormValues) => {
    setLoading(true);
    const result =
      mode === "create"
        ? await createCosEmployee(values)
        : await updateCosEmployee(employee!.id, values);
    setLoading(false);

    if ("error" in result) {
      // A duplicate cos_no is a field problem, not a page-level failure.
      if (result.field === "cos_no") {
        setError("cos_no", { message: result.error });
      }
      toast.error(result.error);
      return;
    }

    toast.success(
      mode === "create" ? "COS employee created" : "COS employee updated",
    );
    router.push(`/cos/employees/${result.data.id}`);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="cos_no">COS No.</Label>
            <Input id="cos_no" {...register("cos_no")} />
            {errors.cos_no && (
              <p className="text-sm text-destructive">{errors.cos_no.message}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="first_name">First Name</Label>
            <Input id="first_name" {...register("first_name")} />
            {errors.first_name && (
              <p className="text-sm text-destructive">
                {errors.first_name.message}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="middle_name">Middle Name</Label>
            <Input id="middle_name" {...register("middle_name")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="last_name">Last Name</Label>
            <Input id="last_name" {...register("last_name")} />
            {errors.last_name && (
              <p className="text-sm text-destructive">
                {errors.last_name.message}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="suffix">Suffix</Label>
            <Input id="suffix" placeholder="Jr., III" {...register("suffix")} />
          </div>
          <div className="grid gap-2">
            <Label>Sex</Label>
            <Select
              value={watchSex ?? NONE}
              onValueChange={(v) =>
                setValue("sex", v === NONE ? null : (v as (typeof COS_SEXES)[number]), {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select sex" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not specified</SelectItem>
                {COS_SEXES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {COS_SEX_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="birth_date">Birthdate</Label>
            <Input id="birth_date" type="date" {...register("birth_date")} />
            {errors.birth_date && (
              <p className="text-sm text-destructive">
                {errors.birth_date.message}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="contact_number">Contact Number</Label>
            <Input id="contact_number" {...register("contact_number")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email Address</Label>
            <Input id="email" type="email" {...register("email")} />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="address">Address</Label>
            <Textarea id="address" rows={2} {...register("address")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Employment Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Office / Department</Label>
            <Select
              value={watchDepartment ?? NONE}
              onValueChange={(v) =>
                setValue("department_id", v === NONE ? null : v, {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unassigned</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="position_title">Position</Label>
            <Input id="position_title" {...register("position_title")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="eligibility">Eligibility</Label>
            <Input id="eligibility" {...register("eligibility")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="recommended_by">Recommended By</Label>
            <Input id="recommended_by" {...register("recommended_by")} />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="remarks">Remarks</Label>
            <Textarea id="remarks" rows={3} {...register("remarks")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:max-w-xs">
            <Label>Status</Label>
            <Select
              value={watchStatus}
              onValueChange={(v) =>
                setValue("status", v as (typeof COS_EMPLOYEE_STATUSES)[number], {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COS_EMPLOYEE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {COS_EMPLOYEE_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Inactive employees cannot be issued new contracts.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === "create" ? "Create COS Employee" : "Save Changes"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Write the create page**

Create `src/app/(dashboard)/cos/employees/new/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { CosEmployeeForm } from "@/components/cos/cos-employee-form";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageCos } from "@/lib/auth-helpers";
import { getDepartments } from "@/lib/actions/user-actions";

export default async function NewCosEmployeePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageCos(user.role)) redirect("/dashboard");

  const departments = await getDepartments();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          New COS Employee
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Encode a Contract of Service employee. Contracts are issued from the
          employee&apos;s profile once the record exists.
        </p>
      </div>
      <CosEmployeeForm mode="create" departments={departments ?? []} />
    </div>
  );
}
```

- [ ] **Step 3: Write the edit page**

Create `src/app/(dashboard)/cos/employees/[id]/edit/page.tsx`. `params` is async in Next 16 — await it before destructuring.

```tsx
import { notFound, redirect } from "next/navigation";
import { CosEmployeeForm } from "@/components/cos/cos-employee-form";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageCos } from "@/lib/auth-helpers";
import { getCosEmployee } from "@/lib/actions/cos-employee-actions";
import { getDepartments } from "@/lib/actions/user-actions";
import { formatCosEmployeeName } from "@/lib/cos-constants";

export default async function EditCosEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageCos(user.role)) redirect("/dashboard");

  const [employee, departments] = await Promise.all([
    getCosEmployee(id),
    getDepartments(),
  ]);
  if (!employee) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Edit {formatCosEmployeeName(employee)}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          COS No. {employee.cos_no}
        </p>
      </div>
      <CosEmployeeForm
        mode="edit"
        departments={departments ?? []}
        employee={employee}
      />
    </div>
  );
}
```

- [ ] **Step 4: Verify create and edit in the running app**

Run: `npm run dev`

1. Go to `/cos/employees/new`, fill COS No. `COS-0002`, first name `Maria`, last name `Reyes`, pick a department, submit. Expected: success toast, redirect to the profile route (404 until Task 6 — expected), and the row appears on `/cos/employees`.
2. Submit the form again with COS No. `COS-0002`. Expected: an inline error under the COS No. field reading `COS number "COS-0002" is already in use`, plus an error toast. No row is created.
3. Submit with COS No. blank. Expected: inline "COS number is required", no server call.
4. Go to `/cos/employees/<id>/edit` for the row from step 1, change the position, save. Expected: success toast and the new position on the list.

- [ ] **Step 5: Verify and commit**

Run: `npm run lint && npm run build`
Expected: both succeed.

```bash
git add src/components/cos/cos-employee-form.tsx \
        "src/app/(dashboard)/cos/employees/new/page.tsx" \
        "src/app/(dashboard)/cos/employees/[id]/edit/page.tsx"
git commit -m "feat(cos): add COS employee form with create and edit pages"
```

---

### Task 6: Profile page and delete

**Files:**
- Create: `src/components/cos/cos-employee-delete-dialog.tsx`
- Create: `src/app/(dashboard)/cos/employees/[id]/page.tsx`

**Interfaces:**
- Consumes: `getCosEmployee`, `deleteCosEmployee`, `CosEmployeeWithDepartment` (Task 3); `formatCosEmployeeName`, `COS_EMPLOYEE_STATUS_LABELS`, `COS_EMPLOYEE_STATUS_VARIANT`, `COS_SEX_LABELS` (Task 1)
- Produces: `<CosEmployeeDeleteDialog employeeId employeeName />` — the COS-1 module is complete after this task

- [ ] **Step 1: Write the delete dialog**

Create `src/components/cos/cos-employee-delete-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { deleteCosEmployee } from "@/lib/actions/cos-employee-actions";

interface CosEmployeeDeleteDialogProps {
  employeeId: string;
  employeeName: string;
}

export function CosEmployeeDeleteDialog({
  employeeId,
  employeeName,
}: CosEmployeeDeleteDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const onConfirm = async () => {
    setLoading(true);
    const result = await deleteCosEmployee(employeeId);
    setLoading(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    toast.success("COS employee deleted");
    router.push("/cos/employees");
    router.refresh();
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {employeeName}?</AlertDialogTitle>
          <AlertDialogDescription>
            The record is archived, not erased — its contract history is kept
            and the COS number becomes available for reuse. Only a Super Admin
            can do this.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={loading}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 2: Write the profile page**

Create `src/app/(dashboard)/cos/employees/[id]/page.tsx`. The Contract History card is a placeholder whose heading and position are fixed here so COS-3 is a drop-in replacement.

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CosEmployeeDeleteDialog } from "@/components/cos/cos-employee-delete-dialog";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { canManageCos } from "@/lib/auth-helpers";
import { getCosEmployee } from "@/lib/actions/cos-employee-actions";
import {
  COS_EMPLOYEE_STATUS_LABELS,
  COS_EMPLOYEE_STATUS_VARIANT,
  COS_SEX_LABELS,
  formatCosEmployeeName,
} from "@/lib/cos-constants";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid gap-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm">{value?.trim() ? value : "—"}</p>
    </div>
  );
}

export default async function CosEmployeeProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageCos(user.role)) redirect("/dashboard");

  const employee = await getCosEmployee(id);
  if (!employee) notFound();

  const name = formatCosEmployeeName(employee);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
            <Badge variant={COS_EMPLOYEE_STATUS_VARIANT[employee.status]}>
              {COS_EMPLOYEE_STATUS_LABELS[employee.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            COS No. {employee.cos_no}
            {employee.departments ? ` · ${employee.departments.name}` : ""}
            {employee.position_title ? ` · ${employee.position_title}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/cos/employees/${employee.id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          </Link>
          {user.role === "super_admin" ? (
            <CosEmployeeDeleteDialog
              employeeId={employee.id}
              employeeName={name}
            />
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Sex"
              value={employee.sex ? COS_SEX_LABELS[employee.sex] : null}
            />
            <Field
              label="Birthdate"
              value={
                employee.birth_date
                  ? format(
                      new Date(`${employee.birth_date}T00:00:00`),
                      "MMM d, yyyy",
                    )
                  : null
              }
            />
            <Field label="Contact Number" value={employee.contact_number} />
            <Field label="Email Address" value={employee.email} />
            <div className="sm:col-span-2">
              <Field label="Address" value={employee.address} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Employment Information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Office / Department"
              value={employee.departments?.name ?? null}
            />
            <Field label="Position" value={employee.position_title} />
            <Field label="Eligibility" value={employee.eligibility} />
            <Field label="Recommended By" value={employee.recommended_by} />
            <div className="sm:col-span-2">
              <Field label="Remarks" value={employee.remarks} />
            </div>
          </CardContent>
        </Card>
      </div>

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
    </div>
  );
}
```

- [ ] **Step 3: Verify the profile and delete in the running app**

Run: `npm run dev`

1. From `/cos/employees`, click a name. Expected: the profile renders with both info cards, the status badge, and the Contract History placeholder.
2. As a `super_admin`, click Delete and confirm. Expected: success toast, redirect to `/cos/employees`, the row is gone, and the Total stat drops by one.
3. Confirm the delete was soft, not hard:

```bash
psql "$(npx supabase status -o json | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).DB_URL')" \
  -c "select cos_no, deleted_at from hris.cos_employees where deleted_at is not null;"
```

Expected: the deleted row is still present with a non-null `deleted_at`.

4. Create a new employee reusing the deleted COS number. Expected: it succeeds — the partial unique index only covers live rows.
5. Sign in as a non-COS role (e.g. `employee`) and visit `/cos/employees`. Expected: redirect to `/dashboard`, and no "Contract of Service" group in the sidebar.

- [ ] **Step 4: Run the full test suite**

Run: `npm run test`
Expected: all four suites pass (`test:dtr`, `test:cos`, `test:db`, `test:cos-db`).

- [ ] **Step 5: Verify and commit**

Run: `npm run lint && npm run build`
Expected: both succeed.

```bash
git add src/components/cos/cos-employee-delete-dialog.tsx \
        "src/app/(dashboard)/cos/employees/[id]/page.tsx"
git commit -m "feat(cos): add COS employee profile page and soft delete"
```

---

## Spec coverage

| Spec requirement | Task |
|---|---|
| `hris.cos_employees` table, indexes, trigger, grants | 1 |
| `cos_no` for the payroll printable's CMO ID No. column | 1 |
| Split name fields | 1 |
| `position_title` free text; `department_id` FK | 1 |
| Soft delete via `deleted_at` | 1 (schema), 3 (`baseQuery`, delete action), 6 (UI) |
| `cos_manager` enum value | 1 |
| `canManageCos` helper | 2 |
| All eight role touchpoints | 2 |
| Server actions with audit + revalidate | 3 |
| Duplicate `cos_no` mapped to a field error | 3 (action), 5 (form surfaces it) |
| List: search, sort, filters, pagination | 4 |
| Stat cards, empty state | 4 |
| Sidebar group | 4 |
| Create / edit form in three Card sections | 5 |
| Profile page with Contract History placeholder | 6 |
| Delete via AlertDialog, super_admin only | 3, 6 |
| "Inactive cannot receive contracts" | Copy only (5) — enforced in COS-3, as the spec states |
| Real-stack + unit tests wired into npm scripts | 1, 2, 3 |

Out of scope for this plan, per the spec: contracts, templates, the rich-text editor, merge fields, payroll rebuild, the `/cos-payroll` teardown, hiding `'cos'` from `/employees`, dashboard statistics, notifications.
