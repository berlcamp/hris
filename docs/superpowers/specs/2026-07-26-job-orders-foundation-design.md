# Job Orders — Spec 1: Areas, JO Employees, and Legacy Data Migration

Date: 2026-07-26
Status: Approved for planning

## Context

The Job Orders module replaces the existing `/jo-payroll` module. The current
implementation stores JO personnel as rows in `hris.employees` with
`employment_type = 'jo'` and carries the area as a free-text
`employees.area_assigned` varchar. The new module gets its own dedicated tables;
JO personnel no longer live in `hris.employees`.

The full module spans six subsystems and is split into three specs. **This
document covers Spec 1 only.**

| Spec | Scope |
|---|---|
| **1 (this doc)** | Area Assignments CRUD, JO Employee CRUD, `jo_manager` role, CSV import from legacy MySQL |
| 2 | Payroll (draft/finalized, working days, snapshots, duplicate) + rewiring the existing printables |
| 3 | Memos and Special Orders (+ duplicate) |

### Decisions already made

- **Replace, don't coexist.** One JO system. `/jo-payroll` is retired in Spec 2.
- **The existing payroll printable format is kept as-is.**
  `src/lib/pdf/generateJoPayroll.ts` (1039 lines, 10 PDF generators ported from
  the legacy Laravel `JopayrollController` print methods) is an asset that
  survives the rewrite. Spec 2 rewires it to the new tables; the layout does not
  change.
- **Legacy MySQL is the sole source of truth** for the initial data load. The
  dormant `employment_type = 'jo'` rows in `hris.employees` are ignored, not
  merged.
- **Existing `hris.employees` JO rows are left untouched.** They are already
  filtered out of the employees list
  (`src/app/(dashboard)/employees/page.tsx:32`), and DTR, leaves, NOSI and CTO
  are all restricted to `plantilla`, so nothing else reads them. A later cleanup
  migration can delete them once the new module is verified in production. COS
  is unaffected and keeps using `hris.employees`.
- **`jo_manager` is not area-scoped.** Any `jo_manager` manages every area.

### Fields the spec omitted but the printables require

The original feature request listed neither SSS fields nor overtime hours.
`JoPayrollPrintRow` in `src/lib/pdf/generateJoPayroll.ts` requires `sss_no`,
`sss_ss`, `sss_ec`, `tax_number`, `tax_date`, `tax_issued`, `account_number` and
`hours`. The overtime and OBR printables cannot work without them, so
`job_order_employees` carries them. `hours` is a payroll-member field and lands
in Spec 2.

## Approach

The one genuine fork was how the employee-to-area link behaves during import,
since legacy matched areas by name string while the new Areas CRUD needs real
records with a status.

**Chosen: real FK, import auto-creates missing areas.** The employee CSV
resolves the legacy `area_assigned` string against a normalized area name and
creates the area as Active when there is no match. The import result reports
every auto-created area so typos can be reviewed and merged.

Rejected alternatives:

- *Strict — unmatched area rejects the row.* Produces a cleaner area list but a
  single spelling difference blocks a person from importing. Legacy areas came
  from a free-text column, so this would reject a meaningful slice on the first
  pass.
- *Keep area as free text.* Makes "inactive areas cannot be assigned"
  unenforceable and reduces the Areas CRUD to decoration. Contradicts the
  requirement.

## Database schema

Two migrations, because `ALTER TYPE ... ADD VALUE` cannot run inside a
transaction block and a newly added enum value cannot be referenced in the same
transaction in which it is added (see the note in
`supabase/migrations/051_add_hr_record_manager_role.sql`).

Both start with `SET search_path TO hris, public, auth, extensions;`.

### `055_add_jo_manager_role.sql`

```sql
ALTER TYPE hris.user_role ADD VALUE IF NOT EXISTS 'jo_manager';
```

### `056_job_orders_module.sql`

```
hris.job_order_areas
  id               uuid pk default gen_random_uuid()
  name             text not null
  normalized_name  text generated always as (lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))) stored
  description      text
  is_active        boolean not null default true
  created_at       timestamptz not null default now()
  updated_at       timestamptz not null default now()
  created_by       uuid null
  updated_by       uuid null
  deleted_at       timestamptz null

  unique index on (normalized_name) where deleted_at is null
  index on (is_active)

hris.job_order_employees
  id                        uuid pk default gen_random_uuid()
  full_name                 text not null      -- authoritative; feeds printables
  sort_name                 text               -- derived surname-first ordering key
  sex                       text check (sex in ('male','female'))
  purok                     text               -- legacy `purok`
  barangay                  text               -- legacy `barangay`
  area_id                   uuid not null references hris.job_order_areas(id) on delete restrict
  sub_area                  text               -- free text, mirrors legacy
  daily_rate                numeric(10,2)
  previous_daily_rate       numeric(10,2)      -- legacy `previous_rate`
  working_hours             numeric(4,2)
  date_started              date
  eligibility               text
  recommended_by            text
  remarks                   text
  remarks_2                 text               -- legacy `remarks2`
  has_atm                   boolean not null default false
  landbank_account_number   text
  sss_no                    text
  sss_ss                    numeric(10,2)
  sss_ec                    numeric(10,2)
  community_tax_number      text               -- legacy `tax_number`
  community_tax_date        date               -- legacy `tax_date`
  community_tax_place_issued text              -- legacy `tax_issued`
  status                    text not null default 'active' check (status in ('active','inactive'))
  legacy_id                 bigint             -- legacy jos.id; import idempotency key
  created_at                timestamptz not null default now()
  updated_at                timestamptz not null default now()
  created_by                uuid null
  updated_by                uuid null
  deleted_at                timestamptz null

  unique index on (legacy_id) where legacy_id is not null
  index on (area_id)
  index on (status)
  index on (sort_name)
  index on (deleted_at)

  constraint chk_atm_account:
    (has_atm = false and landbank_account_number is null) or (has_atm = true)
```

Both tables get the project's standard `updated_at` trigger, following the
pattern in `023_payroll_tables.sql`.

### Verified against the real legacy schema

The mapping below was confirmed against the actual MySQL dump (`asenso`
database, 2026-07-26), not inferred from controller code. Consequences that
shaped the schema:

- **Legacy stores dates and numbers as `char`.** `jos.date_started`,
  `tax_date`, `rate`, `previous_rate`, `has_atm` and `working_hours` are all
  `char`/`varchar` columns. Every one needs tolerant parsing on import;
  unparseable values become `null` and are reported as row warnings rather than
  failing the row. A JO with a garbled `date_started` still imports.
- **There is no legacy `status`.** `jos` has only `deleted_at`. All imported
  rows therefore get `status = 'active'`, and legacy soft-deletes carry across as
  `deleted_at`. Active/Inactive becomes meaningful only for records managed in
  the new system.
- **`jo_areas` is `id` + `area_assigned` and nothing else** — no description, no
  status, no timestamps. Imported areas take `description = null` and
  `is_active = true`.
- **`jos.sss_ss` / `sss_ec` are `int`**, comfortably held by `numeric(10,2)`.
- **`legacy_id` is `bigint`** to match `jos.id` (`bigint unsigned`), even though
  the table currently holds fewer than 600 rows.
- **`jo_subareas` (`id`, `area`) is not imported.** Sub-area is a free-text
  column on the employee, so the distinct values arrive with the employee rows.

Notes:

- **`legacy_id` is the import idempotency key.** Re-running the import updates
  rather than duplicates, the same guarantee `addLedgerEntry` provides for leave
  credits. Without it a second import doubles the roster.
- **`on delete restrict` on `area_id`** prevents orphaning employees. Areas are
  soft-deleted anyway; the FK is a backstop.
- **`area_id` is `not null`**, because the requirement is that every JO employee
  belongs to exactly one area. Legacy rows with a blank `area_assigned` would
  otherwise fail to import, so `056` seeds a single area named **`Unassigned`**
  and the import routes blank areas to it. It appears in the Areas list like any
  other area and its members can be reassigned from the UI. The employee form
  requires an explicit area for records created by hand — `Unassigned` exists for
  migrated data, not as a default for new entry.
- **`chk_atm_account`** enforces the conditional LandBank rule at the database
  level, not only in zod.
- Soft delete is `deleted_at`. Every read filters `.is("deleted_at", null)`.
- `sex` uses a text check rather than a new enum so the value set can change
  without an enum migration.
- **`normalized_name` is a stored generated column**, so it cannot drift from
  `name` no matter which code path writes the row. The unique index is partial
  (`where deleted_at is null`) so a soft-deleted area does not block reusing its
  name.
- **`sort_name` is derived in TypeScript at write time**, not by the database,
  because the rule is heuristic and will need tuning against real data. Rule:
  if `full_name` contains a comma it is already surname-first and is lowercased
  and whitespace-collapsed as-is; otherwise the last whitespace-separated token
  is moved to the front. `full_name` is never rewritten — `sort_name` is purely
  an ordering key, so a wrong guess misorders a row but never corrupts a printed
  name.

## CSV import

Route `/admin/job-order-import`, matching the existing `/admin/salary-import`
and `/admin/leave-credits-import` pages.

- Actions: `src/lib/actions/job-order-csv-import-actions.ts`
- Client: `src/components/admin/job-order-import-client.tsx`
- Parsing: existing `src/lib/parse-csv.ts`
- Guard: `super_admin` only (matching the other import screens), tighter than
  the module's own `canManageJobOrders`

Two uploads: **Areas** (optional) and **Employees**. Import is a direct
upsert returning a result summary — no staged dry-run — matching
`importSalaryGradeMatrixFromCsv` and `importLeaveCreditsFromCsv`.

### Column mapping (legacy `jos` → `job_order_employees`)

| legacy | new | handling |
|---|---|---|
| `id` | `legacy_id` | upsert conflict target |
| `fullname` | `full_name`, `sort_name` | `sort_name` derived, never overwrites `full_name` |
| `area_assigned` | `area_id` | resolved by normalized name; auto-created Active when absent; blank → the `Unassigned` area |
| `sub_area` | `sub_area` | verbatim |
| `rate` | `daily_rate` | `char` — tolerant numeric parse, warn on failure |
| `previous_rate` | `previous_daily_rate` | `char` — tolerant numeric parse |
| `gender` | `sex` | lowercased; unrecognized → null |
| `purok` | `purok` | verbatim (legacy default is `''`, normalized to null) |
| `barangay` | `barangay` | verbatim (legacy default is `''`, normalized to null) |
| `has_atm` | `has_atm` | `char` — normalize `1/0/Yes/No/Y/N/true/false`; unrecognized → false |
| `working_hours` | `working_hours` | `varchar` — tolerant numeric parse |
| `account_number` | `landbank_account_number` | cleared when `has_atm` is false, to satisfy `chk_atm_account` |
| `sss_no` | `sss_no` | verbatim |
| `sss_ss`, `sss_ec` | same | legacy `int` → numeric |
| `tax_number`, `tax_issued` | `community_tax_number`, `community_tax_place_issued` | verbatim |
| `tax_date` | `community_tax_date` | `char` — flexible date parse, warn on failure |
| `eligibility`, `recommended_by`, `remarks` | same | verbatim |
| `remarks2` | `remarks_2` | verbatim — kept separate rather than merged into `remarks`, which would be lossy |
| `date_started` | `date_started` | `char` — flexible date parse, warn on failure |
| `deleted_at` | `deleted_at` | legacy soft deletes preserved |
| *(none)* | `status` | always `'active'`; legacy has no status column |

Rows are upserted in chunks of 200 on `legacy_id`, matching the
`UPSERT_CHUNK = 200` convention in `salary-csv-import-actions.ts`.

The Areas CSV maps `jo_areas.area_assigned` → `name`. Legacy has no other
columns, so `description` is null and `is_active` is true for every imported
area.

**Parse failures never reject a row.** A `char` column that cannot be parsed
yields `null` in the target column plus a warning in the result summary naming
the row, the column and the offending raw value. Only a missing or empty
`fullname` rejects a row outright.

### Result summary

The import returns and the UI renders:

- rows inserted, updated, skipped
- per-row **warnings** for unparseable `char` values (row, column, raw value)
- per-row errors with row number and reason
- **the list of areas auto-created during the run**, so typo'd areas can be
  found and merged

### Shared helper extraction

`normHeader`, `colIndex`, `parseMoney` and `parseFlexibleCsvDate` are currently
private to `src/lib/actions/salary-csv-import-actions.ts`. They move to
`src/lib/csv-import-helpers.ts` and both importers consume them, rather than
introducing a third copy. This is a targeted refactor of code the change already
touches, not general cleanup.

## UI

A new sidebar group **Job Orders** in `src/components/layout/app-sidebar.tsx`,
gated on `canManageJobOrders`. Spec 1 adds two items; Specs 2 and 3 add payroll,
memos and special orders beneath it. The import screen sits under
Administration with the other imports.

| Route | Purpose |
|---|---|
| `/job-orders` | JO employee list + CRUD |
| `/job-orders/areas` | Area Assignments CRUD |
| `/admin/job-order-import` | CSV import |

Structure follows existing conventions exactly:

- Server actions: `src/lib/actions/job-order-actions.ts` (employees) and
  `src/lib/actions/job-order-area-actions.ts` (areas), both `"use server"`,
  admin client, role filtering in TypeScript, `revalidatePath` after writes,
  `logAudit` after every mutation
- Validation: `src/lib/validations/job-order-schema.ts` — zod with a refinement
  making `landbank_account_number` required when `has_atm` is true and null
  otherwise, mirroring `chk_atm_account`
- Columns: `src/components/tables/columns/job-order-columns.tsx` and
  `job-order-area-columns.tsx`, rendered through the existing
  `<DataTable>` (`src/components/tables/data-table.tsx`), which supplies search,
  sorting and pagination
- Components: `src/components/job-orders/*` using shadcn `Form` +
  react-hook-form + zod resolver, `AlertDialog` for delete confirmation, and
  `sonner` toasts

Behaviour:

- **Filters** on the employee list: status (Active / Inactive / All), area, and
  ATM. Areas list filters on status.
- **Conditional ATM field.** The LandBank account number input appears only when
  Has ATM is Yes; switching to No clears it.
- **Address is two inputs, one display.** `purok` and `barangay` are edited
  separately and rendered joined (`"Purok 3, Poblacion"`, omitting either part
  when blank) in the list column and detail view. The legacy "no address" filter
  keys off `barangay` being null or empty, matching the legacy query.
- **Inactive areas are not offered for new employees.** When editing an employee
  whose area has since gone inactive, that area remains present in the select so
  the record stays saveable — otherwise the form deadlocks and the employee can
  never be edited again.
- **Soft delete.** Delete actions set `deleted_at`; every list and lookup query
  filters `.is("deleted_at", null)`.
- **Area deletion is blocked** while any non-deleted employee references the
  area; the action returns an error naming the count.

## Role and permissions

`jo_manager` is added following the same pattern as `dtr_manager` (migration
039) and `hr_record_manager` (migration 051).

```ts
// src/lib/auth-helpers.ts
const JOB_ORDER_ROLES: readonly UserRole[] = [
  "super_admin",
  "hr_admin",
  "jo_manager",
] as const;

export function canManageJobOrders(role: UserRole | null | undefined): boolean {
  return !!role && JOB_ORDER_ROLES.includes(role);
}
```

This preserves the access `hr_admin` has today under the `/jo-payroll` guard
(`ADMIN_ROLES = ["super_admin", "hr_admin"]`). Destructive deletes stay
`super_admin`-only, as they are in `jo-payroll-actions.ts`.

Every server action in the module calls `canManageJobOrders` before touching
data; the sidebar uses the same helper for gating.

Touchpoints for the new role:

- `src/lib/types.ts` — `UserRole` union
- `src/lib/constants.ts` — `USER_ROLES`
- `src/lib/auth-helpers.ts` — `canManageJobOrders`
- `src/lib/validations/user-schema.ts` — role enum
- `src/components/tables/columns/user-columns.tsx` — role label
- `src/components/forms/user-form.tsx` — role option
- `src/components/layout/app-sidebar.tsx` — sidebar group gating
- `src/lib/database.types.ts` — regenerated

The `jo_manager` permission set in Spec 1 is: manage JO employees, manage Area
Assignments. The payroll, memo and special-order permissions from the original
request arrive with Specs 2 and 3 and use the same helper.

## Verification

In the order CLAUDE.md prescribes, most valuable first.

1. **Real-stack test** — `supabase/tests/job-orders.test.mts` against local
   PostgREST + Postgres:
   - import idempotency: running the same CSV twice leaves the roster size
     unchanged and updates in place
   - soft-deleted employees and areas are excluded from list reads
   - `area_id` FK restrict prevents hard-deleting a referenced area
   - `chk_atm_account` rejects an account number when `has_atm` is false
   - legacy `deleted_at` values survive the import as soft deletes
2. **Pure unit tests** for the row-mapping helpers — `sort_name` derivation,
   `has_atm` normalization across `1/0/Yes/No/Y/N`, tolerant numeric parsing of
   the legacy `char` rate columns, flexible date parsing of the `char`
   `date_started` and `tax_date`, and the purok/barangay display join.
3. `npm run lint && npm run build`.

Both files are wired into the `test:db` and `test:dtr` npm scripts.

## Out of scope for Spec 1

- Payroll, working-day computation, draft/finalized status, payroll snapshots,
  duplicate payroll — Spec 2
- Retiring `/jo-payroll` and its actions, and rewiring
  `src/lib/pdf/generateJoPayroll.ts` to the new tables — Spec 2
- Memos and Special Orders — Spec 3
- Deleting the dormant `employment_type = 'jo'` rows from `hris.employees` —
  a later cleanup migration, after production verification
- Sub-area CRUD. `sub_area` stays free text and can be promoted to a table later
  if it ever needs a status or description.
- Area scoping for `jo_manager`.
- **The legacy `jo_logs` table (2,509 rows of per-field change history) is not
  migrated.** The audit trail starts fresh at go-live; `logAudit` records
  everything from that point forward.

## Findings carried into Spec 2

Recorded here so the payroll design starts from verified facts:

- **`jopayroll_members` has no `rate` column.** Legacy payrolls join to the live
  `jos.rate`, so a historical payroll re-prices itself whenever an employee's
  rate changes. This directly contradicts the requirement that a payroll
  preserve historical values, and it means migrated payrolls cannot be
  guaranteed to reproduce the figures originally printed. Spec 2 must decide
  what rate to stamp onto migrated members — the current rate is the only value
  available, so pre-migration payroll amounts are reconstructions, not records.
- `jopayroll_members` also carries `weekends` and `holidays` (float) alongside
  `days` and `hours`.
- `jopayrolls` has no payroll-date and no status column; Draft/Finalized is a
  new concept with no legacy source, so migrated payrolls need a default
  (presumably Finalized, since they are historical).
- `jo_memos` carries `type`, `subject`, `description`, `particulars`,
  `memo_series` and `page_break_offset`; `jo_s_o_s` carries `description`,
  `subject`, `particulars`, `days` and `page_break_offset`. Both have `from`/`to`
  date ranges the original request did not mention. These land in Spec 3.
