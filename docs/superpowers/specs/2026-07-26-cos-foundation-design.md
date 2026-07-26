# Contract of Service — Spec 1: COS Employees, `cos_manager` Role, Module Shell

Date: 2026-07-26
Status: Approved for planning

## Context

The Contract of Service (COS) module gives COS personnel their own home in the
HRIS: an employee registry, contracts with unlimited renewals, a reusable rich
contract editor, contract templates, and a rebuilt COS payroll matching the
`adm-v26` format.

Today COS personnel are rows in `hris.employees` with `employment_type = 'cos'`,
and `hris.cos_employee_payroll` (migration 023) foreign-keys straight to
`hris.employees(id)`. The new module replaces that arrangement with dedicated
tables.

The full module spans five subsystems and is split into five specs. **This
document covers Spec 1 (COS-1) only.**

| Spec | Scope |
|---|---|
| **COS-1 (this doc)** | `cos_employees` CRUD, `cos_manager` role, `/cos` module shell |
| COS-2 | Reusable Tiptap rich-text editor + merge-field system |
| COS-3 | Contracts, templates, renewal, duplicate, timeline, contract printing |
| COS-4 | COS payroll rebuild to `adm-v26` parity + cutover/teardown of `/cos-payroll` |
| COS-5 | COS dashboard statistics + expiry notification architecture |

COS-1 and COS-2 are independent and can be built in parallel. COS-4 depends only
on COS-1, so it can run alongside COS-3.

### Decisions already made

- **Dedicated tables.** COS personnel no longer live in `hris.employees`. The
  module is separate from Regular Employees and from Job Orders.
- **The registry starts empty.** No data is copied from
  `hris.employees`. HR encodes the COS roster fresh in the new module. This is
  a deliberate choice: the existing rows are treated as stale.
- **Existing `hris.employees` COS rows are left in the database, untouched.**
  Deleting them would cascade into `attendance_logs`, `dtr_summary`,
  `leave_applications`, `leave_credits`, `cto_*` and `salary_history`. They are
  hidden from `/employees` in COS-4, not removed. A later cleanup migration can
  delete them once the new module is verified in production.
- **COS payroll history is disposable.** `hris.cos_payroll` and
  `hris.cos_employee_payroll` are dropped in COS-4 rather than migrated.
- **The existing payroll printables are an asset and survive.**
  `src/lib/pdf/generatePayroll.ts` already contains `generateCosPayrollPrint`
  and `generatePayrollOBRPrint`, ported from `adm-v26` and using the same
  HTML + hidden-iframe `window.print()` approach. COS-4 upgrades them to current
  `adm-v26` parity; it does not rewrite them.
- **COS-1 is purely additive.** Nothing is removed and nothing existing changes
  behaviour. The old `/cos-payroll` module keeps working until COS-4 replaces
  it. This also matches the empty-registry decision: HR must encode the roster
  in COS-1 before COS-4 can run a payroll period against it.
- **`cos_manager` is not department-scoped.** Any `cos_manager` manages every
  COS employee.

### Relationship to the Job Orders module

The Job Orders Spec 1
(`docs/superpowers/specs/2026-07-26-job-orders-foundation-design.md`, branch
`feat/job-orders-module`) is an in-flight sibling rewrite with the same shape.
Two points of contact:

- **Migration numbers.** JO Spec 1 claims `055_add_jo_manager_role.sql` and
  `056_job_orders_module.sql`. COS therefore takes **057** and **058**. If the
  JO branch merges under different numbers, renumber COS to stay sequential
  before writing the files.
- **A superseded statement.** JO Spec 1 says "COS is unaffected and keeps using
  `hris.employees`." That was true when written; this spec supersedes it.

The two modules share no code and no tables. The `/employees` page filter that
JO Spec 1 relies on (`src/app/(dashboard)/employees/page.tsx:32`) is the same
line COS-4 extends — a one-line conflict to expect at merge, nothing more.

### Departures from the original feature request

Four, each with a reason:

1. **Split name fields, not a single "Full Name".** Every other person table in
   the schema splits it (`employees`, `rsp_applicants`), list sorting is by
   `last_name`, and `src/lib/employee-name-match.ts` already exists for
   normalization. A single field would be the only one of its kind.
2. **`cos_no` added.** Not in the request, but `PayrollCosRow.cmoIdNo` in
   `src/lib/pdf/generatePayroll.ts` renders a **CMO ID No.** column on the COS
   payroll print. Without this field COS-4 has nowhere to source it.
3. **`position_title` is free text, not an FK to `hris.positions`.** COS hires
   carry no plantilla item, and `adm-v26` stores `designation TEXT`.
4. **Permissions are role helpers, not per-user grants.** See
   [Role and permissions](#role-and-permissions).

## Approach

The genuine fork was whether COS employees get their own table or stay in
`hris.employees` behind a filter.

**Chosen: dedicated `hris.cos_employees`, registry starts empty.** COS records
have fields that make no sense on a plantilla employee (`eligibility`,
`recommended_by`) and lack fields that are `NOT NULL` on `hris.employees`
(`salary_grade`, `step_increment`, `hire_date`). A separate table keeps both
shapes honest and lets COS-4's payroll foreign-key to a table whose rows are all
COS.

Rejected alternatives:

- *Reuse `hris.employees` with a `cos_employee_details` side table.* Requires no
  migration and keeps one identity per person, but leaves COS payroll and COS
  contracts reading a table whose `NOT NULL` columns are meaningless for them,
  and makes "completely separate from Regular Employees" a UI convention rather
  than a structural fact.
- *New table, but copy the existing COS rows across.* Saves HR from re-typing,
  but the existing rows were populated for payroll only and carry stale
  departments and positions. Copying them would seed the new registry with data
  that has to be audited row by row anyway.

## Database schema

Two migrations. `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block
and a newly added enum value cannot be referenced in the transaction that adds
it, so the role lands in its own file first — the same split migrations 039, 051
and JO Spec 1 use.

### `057_add_cos_manager_role.sql`

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
-- it is added.
SET search_path TO hris, public, auth, extensions;

ALTER TYPE hris.user_role
  ADD VALUE IF NOT EXISTS 'cos_manager';
```

### `058_cos_module_foundation.sql`

```sql
-- Migration 058: Contract of Service module — employee registry.
--
-- COS personnel get a dedicated table rather than living in hris.employees.
-- Contracts (COS-3) and the rebuilt COS payroll (COS-4) foreign-key here.
--
-- Soft delete: this is the first table in the schema to use deleted_at. Every
-- read must filter `deleted_at IS NULL`; the app funnels reads through a single
-- query builder in cos-employee-actions.ts so the filter cannot be forgotten.
SET search_path TO hris, public, auth, extensions;

CREATE TABLE hris.cos_employees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity. cos_no is the "CMO ID No." column on the COS payroll printable.
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
CREATE INDEX idx_cos_employees_not_deleted
  ON hris.cos_employees(deleted_at) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_cos_employees_updated_at
  BEFORE UPDATE ON hris.cos_employees
  FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();

GRANT ALL    ON hris.cos_employees TO service_role;
GRANT SELECT ON hris.cos_employees TO authenticated;
```

### Soft delete is a new pattern

`deleted_at` appears nowhere in the current 54 migrations — nothing in this
codebase soft-deletes today, so there is no existing helper to reuse. Two rules
this spec establishes:

1. **One query entry point.** `cos-employee-actions.ts` exports a private
   `baseQuery()` that applies `.schema("hris").from("cos_employees")` and
   `.is("deleted_at", null)`. Every read goes through it. No `.from("cos_employees")`
   call appears anywhere else in the module.
2. **Delete is an UPDATE.** The delete action sets `deleted_at = now()` and
   `updated_by`, never `DELETE FROM`. Contracts in COS-3 reference these rows;
   a hard delete would orphan contract history.

### Business rule: inactive employees cannot receive new contracts

Enforced in COS-3, where contracts exist. COS-1 only establishes the `status`
column and surfaces it in the UI. Recording it here so COS-3 does not have to
rediscover it: the check belongs in `createContract`/`renewContract` in
`cos-contract-actions.ts`, and the "New Contract" action is disabled on the
profile page of an inactive employee.

## Role and permissions

`cos_manager` follows the same pattern as `dtr_manager` (migration 039) and
`hr_record_manager` (migration 051).

```ts
// src/lib/auth-helpers.ts
const COS_MANAGER_ROLES: readonly UserRole[] = [
  "super_admin",
  "hr_admin",
  "cos_manager",
] as const;

export function canManageCos(role: UserRole | null | undefined): boolean {
  return !!role && COS_MANAGER_ROLES.includes(role);
}
```

`hr_admin` is included to preserve the access it has today under the
`/cos-payroll` guard (`ADMIN_ROLES = ["super_admin", "hr_admin"]`). Destructive
deletes stay `super_admin`-only, matching `cos-payroll-actions.ts`.

Every server action in the module calls `canManageCos` before touching data; the
sidebar uses the same helper for gating.

### On the requested permission list

The feature request asks for a permission *group* with separately grantable
items: Manage COS Employees, Create Contracts, Renew Contracts, Print Contracts,
Manage Templates, Edit Templates, Archive Contracts.

This HRIS has no granular permission system. Authorization is role-based, with
intent expressed as named helpers (`canManageHrRecords`, `canManageSalaryGrades`,
`isAttendanceManager`, `canManageJobOrders`). Building per-user grants would be
its own project touching every module.

**This spec expresses the requested list as helper functions over the existing
roles** — `canManageCos()` here, `canManageCosTemplates()` in COS-3 — which
delivers the same enforcement without a new subsystem. If genuinely
per-user grants are wanted, that is a separate spec and should be scoped as one.

### Touchpoints for the new role

- `src/lib/types.ts` — `UserRole` union
- `src/lib/constants.ts` — `USER_ROLES` (note: this map is already incomplete —
  it omits `department_admin`, `department_admin_and_department_head` and
  `dtr_manager`. Add `COS_MANAGER`; do not attempt to fix the pre-existing gaps
  here.)
- `src/lib/auth-helpers.ts` — `canManageCos`
- `src/lib/validations/user-schema.ts` — role enum
- `src/components/tables/columns/user-columns.tsx` — role label
- `src/components/forms/user-form.tsx` — role option
- `src/components/layout/app-sidebar.tsx` — sidebar group gating
- `src/lib/database.types.ts` — regenerated

## UI

### Routes

```
src/app/(dashboard)/cos/employees/page.tsx            list
src/app/(dashboard)/cos/employees/loading.tsx         skeleton
src/app/(dashboard)/cos/employees/new/page.tsx        create
src/app/(dashboard)/cos/employees/[id]/page.tsx       profile
src/app/(dashboard)/cos/employees/[id]/edit/page.tsx  edit
```

Pages are server components that call server actions directly, guard with
`getCurrentUser()` then `canManageCos(user.role)`, and `redirect("/dashboard")`
on failure — the same opening as `src/app/(dashboard)/rsp/page.tsx`.

Route params and `searchParams` are async in Next 16; await before
destructuring.

### Sidebar

A new nav group **"Contract of Service"**, gated on the `cos_manager`-inclusive
role list, placed after the Payroll group. In COS-1 it holds one item:

```
Contract of Service
  └─ COS Employees   /cos/employees   icon: FileSignature
```

COS-3, COS-4 and COS-5 add Contracts, Templates, COS Payroll and Dashboard to
this group. The existing "COS Payroll" item under the Payroll group is
untouched in COS-1 and moves here in COS-4.

### List page

Composes the existing `<DataTable>` (`src/components/tables/data-table.tsx`) —
no bespoke table. Column definitions go in
`src/components/tables/columns/cos-employee-columns.tsx`.

| Element | Behaviour |
|---|---|
| Columns | COS No., Name (`last_name, first_name middle_name suffix`), Department, Position, Status badge, Actions |
| Search | across `cos_no`, `first_name`, `middle_name`, `last_name` |
| Sorting | Name (default, `last_name` ascending), COS No., Department, Status |
| Filters | Department (from `getDepartments()` — note it lives in `src/lib/actions/user-actions.ts`, not `department-actions.ts`), Status (Active / Inactive / All) |
| Pagination | as `<DataTable>` provides |
| Row actions | View, Edit, Delete (`AlertDialog`, sets `deleted_at`) |
| Header | Title, description, "Add COS Employee" button gated on `canManageCos` |
| Empty state | Copy acknowledging the registry starts empty and pointing at Add |

Stat cards above the table showing Total / Active / Inactive, following the
counts pattern at the top of `src/app/(dashboard)/rsp/page.tsx`.

### Form

One `cos-employee-form.tsx` serving both create and edit, shadcn `Form` +
react-hook-form + `zodResolver`, grouped into three `Card` sections matching the
request: Personal Information, Employment Information, Status. Department is the
existing department `Select`; `sex` and `status` are `Select`s over the constants.

### Profile page

Header with name, COS No., status badge, department, position, and Edit/Delete
actions. Two `Card`s mirroring the form's Personal and Employment groupings.

Below them, a placeholder section headed **Contract History** rendering an empty
state. COS-3 replaces the placeholder with the real timeline; the heading and
its position on the page are fixed here so COS-3 is a drop-in.

### Files

| New file | Mirrors |
|---|---|
| `supabase/migrations/057_add_cos_manager_role.sql` | `051_add_hr_record_manager_role.sql` |
| `supabase/migrations/058_cos_module_foundation.sql` | `050_rsp_module.sql` |
| `src/lib/cos-constants.ts` | `src/lib/rsp-constants.ts` |
| `src/lib/actions/cos-employee-actions.ts` | `src/lib/actions/rsp-actions.ts` |
| `src/lib/validations/cos-employee-schema.ts` | `src/lib/validations/` peers |
| `src/components/tables/columns/cos-employee-columns.tsx` | `rsp-vacancy-columns.tsx` |
| `src/components/cos/cos-employee-form.tsx` | `src/components/rsp/` peers |
| `src/components/cos/cos-employee-list-client.tsx` | `rsp` list clients |
| `src/components/cos/cos-employee-delete-dialog.tsx` | existing `AlertDialog` usage |

Modified: the eight role touchpoints listed above.

## Server actions

`src/lib/actions/cos-employee-actions.ts`, `"use server"` at the top, admin
client (`createAdminClient`), matching the prevailing pattern in
`src/lib/actions/`.

| Action | Notes |
|---|---|
| `getCosEmployees(filters?)` | via `baseQuery()`; optional department / status / search; ordered by `last_name` |
| `getCosEmployee(id)` | via `baseQuery()`; returns `null` when soft-deleted |
| `createCosEmployee(input)` | zod-validated; sets `created_by`/`updated_by`; maps the `uq_cos_employees_cos_no` violation to a field error on `cos_no` rather than a raw Postgres message |
| `updateCosEmployee(id, input)` | zod-validated; sets `updated_by`; same duplicate handling |
| `deleteCosEmployee(id)` | `super_admin` only; sets `deleted_at` + `updated_by` |

Every action calls `canManageCos` first, `logAudit()` from `src/lib/audit.ts`
after the write (`tableName: "cos_employees"`), then `revalidatePath()` for
`/cos/employees` and, where relevant, `/cos/employees/[id]`.

All queries call `.schema("hris")` before `.from(...)` — the JS client does not
honour the database `search_path`.

## Verification

In the order CLAUDE.md prescribes, most valuable first.

1. **Real-stack test** — `supabase/tests/cos-employees.test.mts` against local
   PostgREST + Postgres:
   - soft-deleted employees are excluded from list and single-record reads
   - `uq_cos_employees_cos_no` rejects a duplicate `cos_no` among live rows
   - the same `cos_no` **is** accepted after the holder is soft-deleted
   - `sex` and `status` CHECK constraints reject out-of-range values
   - `department_id` `ON DELETE RESTRICT` blocks deleting a referenced department
   - `trg_cos_employees_updated_at` advances `updated_at` on UPDATE
2. **Pure unit tests** for the display-name formatter and the search-term
   normalizer in `src/lib/cos-constants.ts`.
3. `npm run lint && npm run build`.

Wire the new test file into the `test:db` npm script.

Migration files are written, not applied — the developer applies them to
production directly.

## Out of scope for Spec 1

- Contracts, templates, renewal, duplicate, contract printing (COS-3)
- The rich-text editor and merge-field system (COS-2)
- COS payroll, OBR printing, and the `/cos-payroll` teardown (COS-4)
- Hiding `employment_type = 'cos'` from `/employees` and its type picker (COS-4)
- Dashboard statistics and expiry notifications (COS-5)
- Per-user permission grants (separate spec, if wanted)
- Deleting the dormant `employment_type = 'cos'` rows from `hris.employees`
  (later cleanup, after production verification)
