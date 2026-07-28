# Job Orders — Spec 2: Payroll

Date: 2026-07-29
Depends on: `2026-07-26-job-orders-foundation-design.md` (Spec 1, merged)

## Context

Spec 1 moved Job Order personnel out of `hris.employees` into
`hris.job_order_areas` + `hris.job_order_employees`, with a legacy CSV import
keyed on `legacy_id`. It deliberately deferred payroll.

Meanwhile `/jo-payroll` already exists, built long before the Job Orders module
(commit `e05c120`, migration `023_payroll_tables.sql`). It reads
`hris.employees` filtered to `employment_type = 'jo'` — the population Spec 1
made dormant. So today the app has a JO roster and a JO payroll screen looking
at two different sets of people. Closing that gap is the point of this spec.

The one asset worth preserving from the old module is
`src/lib/pdf/generateJoPayroll.ts` (1,039 lines): a complete port of all ten
legacy Laravel print methods. It consumes a flat `JoPayrollPrintRow` struct
rather than querying anything, so it survives the table change intact.

### Decisions made during design

| Question | Decision |
|---|---|
| Legacy payrolls | Migrate, stamping each member's rate from the JO's current rate, flagged `is_reconstructed` |
| Empty legacy payrolls | Skip the 810 empty live ones; import the 146 soft-deleted ones as soft-deleted |
| Snapshot depth | Freeze everything the printout needs onto the member row; drafts get an explicit "Refresh from roster" |
| Finalize | Locks all edits server-side; `super_admin` may reopen (audit-logged) |
| Working days | Auto-fill the Mon–Fri count, editable, with holidays listed as advisory and **not** deducted |
| Member picking | Select areas → bulk-add active JOs, then adjust individuals |
| `jo_manager` access | Everything except reopen and delete |
| Cutover | Rebuild as `job_order_payrolls`, move route under `/job-orders/payroll` |

### Verified facts about the legacy data

Measured directly from `supabase/old_jo_data/` (gitignored, local only), not
assumed:

| Fact | Value |
|---|---|
| `jopayrolls` rows | 1,616 |
| ...with at least one member | 660 |
| ...empty and soft-deleted | 146 |
| ...empty and live (abandoned drafts) | 810 |
| `jopayroll_members` rows | 11,015 |
| Members per payroll | min 1, median 8, max 130 |
| Members with a non-blank `days` | 10,971 |
| Members with a non-blank `hours` | 83 (overtime is rare) |
| Members with a non-blank `weekends` or `holidays` | **0** |
| Members with unresolvable `jo_id` | 0 |
| Members with unresolvable `jopayroll_id` | 0 |
| Duplicate `(jopayroll_id, jo_id)` pairs | 0 |
| Members whose JO has a blank rate | 0 |
| **Members pointing at a soft-deleted JO** | **5,893 (54%)** |
| Payrolls with an unparseable date | 2 (both outside the import set, see below) |
| Payrolls with `to` earlier than `from` | 1 (id 11, `12/06/1979` → `07/17/1979`) |
| Payroll date range | 2022–2026, plus one row typo'd as 1979 |
| Max `days` (payroll / member), max `hours` | 26 / 22, 151.6 — all fit `NUMERIC(5,2)` |

Two consequences drop straight out of this table:

1. **`weekends` and `holidays` are dropped from the schema.** Spec 1 carried
   them forward as open questions for Spec 2. They were never populated in
   production across 11,015 rows. Adding columns for them would be building for
   a use that demonstrably does not exist.
2. **The snapshot lookup must not filter on `deleted_at`.** Over half the
   member rows reference JOs that are soft-deleted in the legacy roster. Spec 1's
   importer carried `deleted_at` across, so those people *are* in
   `job_order_employees` — but a copy-paste of the roster importer's
   `.is("deleted_at", null)` guard (`job-order-csv-import-actions.ts:100`) would
   silently drop 5,893 member rows and still report a green summary.

### Legacy `days` decoded

The sample payroll `07/01/2022 – 07/15/2022` carries `days = 11`, which is
exactly the Mon–Fri count for that range (Jul 1, Jul 4–8, Jul 11–15). Legacy was
a plain weekday count with no holiday deduction. The new auto-fill reproduces
that number so the first payroll created in the new system reconciles against
the last one created in the old.

## Approach

Migration 023's `hris.jo_payroll` and `hris.jo_payroll_members` are unused in
production (confirmed with the developer), so they are dropped and rebuilt
rather than altered. The rebuild takes `job_order_*` naming to match Spec 1 and
the route moves under `/job-orders/payroll`, consolidating the module into one
sidebar group.

This naming cost is zero now, precisely because there is no data to migrate.
Spec 3 adds memos and special orders on top; leaving `jo_payroll` beside
`job_order_areas` and `job_order_employees` would make the mixed convention
permanent.

### File structure

```
supabase/migrations/
  064_job_order_payrolls.sql              NEW

src/lib/
  job-order-payroll-helpers.ts            ← renamed from utils/joPayrollAmount.ts,
                                            + working-days + snapshot mapper
  validations/job-order-payroll-schema.ts ← renamed from jo-payroll-schema.ts
  actions/job-order-payroll-actions.ts    ← renamed from jo-payroll-actions.ts (rewritten)
  actions/job-order-payroll-import-actions.ts   NEW
  pdf/generateJobOrderPayroll.ts          ← renamed from generateJoPayroll.ts

src/app/(dashboard)/job-orders/payroll/
  page.tsx                                list
  [id]/page.tsx                           NEW — detail as a page

src/app/(dashboard)/admin/job-order-payroll-import/
  page.tsx                                NEW

src/components/job-orders/payroll/        ← moved from src/components/jo-payroll/
src/components/tables/columns/job-order-payroll-columns.tsx   NEW

DELETED: src/app/(dashboard)/jo-payroll/, src/components/jo-payroll/
```

Detail becomes a page rather than the existing 419-line modal because members
are now editable inline — per-row `days`, `hours` and `rate`, add, remove, and
refresh-from-roster — which is more than a dialog should carry.

## Database schema

### `064_job_order_payrolls.sql`

```sql
SET search_path TO hris, public, auth, extensions;

DROP TABLE IF EXISTS hris.jo_payroll_members;
DROP TABLE IF EXISTS hris.jo_payroll;

CREATE TABLE hris.job_order_payrolls (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start     DATE NOT NULL,
  period_end       DATE NOT NULL,
  days             NUMERIC(5,2),
  description      TEXT,
  particulars      TEXT,
  areas            TEXT,          -- derived from members' area_name
  payroll_date     DATE,
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'finalized')),
  finalized_at     TIMESTAMPTZ,
  finalized_by     UUID,
  is_reconstructed BOOLEAN NOT NULL DEFAULT false,
  legacy_id        BIGINT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID,
  updated_by       UUID,
  deleted_at       TIMESTAMPTZ,
  CONSTRAINT chk_job_order_payroll_period CHECK (period_end >= period_start)
);

CREATE TABLE hris.job_order_payroll_members (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_id            UUID NOT NULL
                          REFERENCES hris.job_order_payrolls(id) ON DELETE CASCADE,
  job_order_employee_id UUID
                          REFERENCES hris.job_order_employees(id) ON DELETE SET NULL,

  -- editable inputs
  days                  NUMERIC(5,2),
  hours                 NUMERIC(5,2),   -- OVERTIME hours; unrelated to
                                        -- job_order_employees.working_hours,
                                        -- which is a TEXT shift descriptor
                                        -- ("7:00 PM - 7:00 AM") per migration 061

  -- frozen snapshot: everything the printables need
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
  CONSTRAINT uq_job_order_payroll_members UNIQUE (payroll_id, job_order_employee_id)
);
```

Indexes: `legacy_id` unique on both tables (**non-partial**, see below);
`(period_start DESC, period_end DESC)`, `status` and `deleted_at` on payrolls;
`payroll_id` and `job_order_employee_id` on members. `update_updated_at`
triggers on both.

RLS mirrors migration 060 exactly:

```sql
ALTER TABLE hris.job_order_payrolls        ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.job_order_payroll_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_job_order_payrolls" ON hris.job_order_payrolls
  FOR ALL USING (hris.get_user_role() IN ('super_admin','hr_admin','jo_manager'));
CREATE POLICY "admin_all_job_order_payroll_members" ON hris.job_order_payroll_members
  FOR ALL USING (hris.get_user_role() IN ('super_admin','hr_admin','jo_manager'));
```

This is not optional. Migration 020 sets default privileges on new `hris`
tables granting `SELECT` to `anon` and `ALL` to `authenticated`; the anon key
ships in the browser bundle. These rows carry LandBank account numbers and SSS
numbers. Spec 1's identical gap went undetected through nine task gates.

### Schema decisions

- **`job_order_employee_id` is nullable, `ON DELETE SET NULL`.** Deleting a JO
  must never destroy payroll history — the snapshot carries the printout on its
  own. It also permits a one-off member with no roster link.
- **Both `legacy_id` unique indexes are non-partial.** Migration 059's lesson,
  applied up front: a partial index (`WHERE legacy_id IS NOT NULL`) cannot be
  inferred by PostgREST's `.upsert({ onConflict })` and fails with `42P10`,
  which broke the entire Spec 1 importer. Postgres already treats NULLs as
  distinct, so the predicate buys nothing.
- **`UNIQUE (payroll_id, job_order_employee_id)` is a plain constraint.** NULLs
  compare as distinct, so it blocks double-adding the same JO while allowing
  any number of unlinked manual rows on one payroll.
- **`full_name` is `NOT NULL`** even though `job_order_employee_id` is nullable.
  A member row with no name cannot be printed, so it has no reason to exist. The
  import can satisfy this because every one of the 11,015 legacy member rows
  resolves to a JO (0 unresolvable `jo_id`); if a future export breaks that, the
  affected rows are isolated and reported rather than inserted nameless.
- **`areas` stays a denormalized TEXT column**, recomputed from the members'
  `area_name` values whenever membership changes. It exists for the print
  header and for list-page search. Members are the source of truth; there is no
  payroll↔area join table.

## Server actions

`src/lib/actions/job-order-payroll-actions.ts`, admin client throughout,
following Spec 1's pattern. Every mutation calls `logAudit()` and re-checks the
role server-side.

**Reads**

- `getJobOrderPayrolls(filters)` — status, period range, text search over
  description/particulars/areas, **server-side pagination**
- `getJobOrderPayrollById(id)` — payroll plus members ordered by `area_name`,
  then name
- `getJobOrderAreasForPicker()` — active areas with a live count of active JOs

Server-side pagination is a deliberate divergence from Spec 1's roster, which
paginates client-side inside `<DataTable>`. That was fine at ~600 rows; this
table starts at 805 migrated payrolls and grows every cutoff.

**Writes**

| Action | super_admin | hr_admin | jo_manager | draft only |
|---|:--:|:--:|:--:|:--:|
| `createJobOrderPayroll` | ✓ | ✓ | ✓ | — |
| `updateJobOrderPayroll` | ✓ | ✓ | ✓ | ✓ |
| `addJobOrderPayrollMember` | ✓ | ✓ | ✓ | ✓ |
| `updateJobOrderPayrollMember` | ✓ | ✓ | ✓ | ✓ |
| `removeJobOrderPayrollMember` | ✓ | ✓ | ✓ | ✓ |
| `refreshMembersFromRoster` | ✓ | ✓ | ✓ | ✓ |
| `duplicateJobOrderPayroll` | ✓ | ✓ | ✓ | — |
| `finalizeJobOrderPayroll` | ✓ | ✓ | ✓ | ✓ |
| `reopenJobOrderPayroll` | ✓ | ✗ | ✗ | — |
| `deleteJobOrderPayroll` (soft) | ✓ | ✗ | ✗ | — |

The first eight rows are exactly `canManageJobOrders()`
(`src/lib/auth-helpers.ts:176`) — reused, not redefined. A shared
`assertDraft()` guard fronts every draft-only action and returns a plain error
string rather than throwing.

**Behavioural notes**

- `createJobOrderPayroll` takes `area_ids[]` and snapshots every active,
  non-deleted JO in those areas. `areas` is computed from the resulting members.
  Each member's `days` is seeded from the payroll's `days`, matching legacy
  behaviour (10,971 of 11,015 legacy members carry a `days` value); `hours`
  starts NULL, since overtime is the exception. Both are then edited per row.
- `daily_rate` is editable on a draft member row. It is a snapshot; correcting a
  wrong stamped rate before finalizing is legitimate and never writes back to
  `job_order_employees`.
- `refreshMembersFromRoster` re-copies the snapshot for members still linked to
  a live JO, skips unlinked ones, and reports how many rows changed. It **never
  adds or removes members** — a JO newly hired into the area does not appear,
  and one who became inactive is not dropped. It refreshes values only;
  membership stays the user's explicit decision. It is what makes
  freeze-everything safe to live with.
- `duplicateJobOrderPayroll` clones the source's member snapshots into a new
  draft with a new period. Rates come from the source payroll, not the roster,
  so duplicating is reproducible; "Refresh from roster" is the explicit way to
  pull current values.
- `reopenJobOrderPayroll` logs a distinct `reopen` audit action with the prior
  `finalized_at` and `finalized_by`.

## UI

**List** — `/job-orders/payroll`, `<DataTable>` with
`job-order-payroll-columns.tsx`: Period · Description · Areas (truncated) ·
Days · Members · Net total · Status badge · Payroll date · row actions. Status
and period-range filters above the table.

**New payroll dialog** — period start/end; `days` auto-filled with the Mon–Fri
count and editable; any `hris.holidays` rows falling inside the period listed
beside it as an advisory note stating they are *not* deducted; description;
particulars; payroll date; then the area multi-select with live counts and a
running member total. Creates the draft and redirects to the detail page.

**Detail** — `/job-orders/payroll/[id]`. Header carries period, status badge, a
**Reconstructed** badge for migrated payrolls, gross/SSS/net totals and member
count. Actions: edit metadata, refresh from roster, finalize / reopen,
duplicate, delete, and the print menu. Members table is grouped by area with
inline `days`, `hours` and `rate` editing, per-row remove, and an "Add member"
search over the roster excluding those already present. A finalized payroll
renders entirely read-only.

**Sidebar** — "Job Order Payroll" is removed from the admin group
(`app-sidebar.tsx:236`) and added to the Job Orders group at `:264` with
`jobOrderRoles`, so Employees, Areas and Payroll sit together.

## PDF

`JoPayrollPrintRow` maps 1:1 onto the snapshot columns, so rewiring is a single
mapper function:

| `JoPayrollPrintRow` | source |
|---|---|
| `fullname` | `full_name` |
| `area_assigned` | `area_name` |
| `rate` | `daily_rate` |
| `days`, `hours` | `days`, `hours` |
| `sss_no`, `sss_ss`, `sss_ec` | same |
| `account_number` | `landbank_account_number` |
| `tax_number` | `community_tax_number` |
| `tax_date` | `community_tax_date` |
| `tax_issued` | `community_tax_place_issued` |

All ten generators, the `DAILY_WAGES_SIGNATORIES` block, and the amount helpers
(`computeJoGross`, `computeJoNetAmount`, `computeJoOvertimeGross`,
`groupMembersByRate`) move across unchanged. The only addition is a shared DRAFT
watermark element rendered when `status = 'draft'`.

Because the no-ATM and by-department variants now filter and group on snapshot
values, they reflect the payroll as issued rather than the roster as it is
today. That is the intended behaviour change.

## Legacy import

New route `/admin/job-order-payroll-import` with two file inputs — payrolls
CSV, then members CSV — processed in one run, payrolls first. Reuses
`src/lib/csv-import-helpers.ts` (`normHeader`, `colIndex`, `parseMoney`,
`parseFlexibleCsvDate`) and `src/lib/parse-csv.ts` from Spec 1. Idempotent on
`legacy_id` in both tables, so re-running updates in place.

### Column mapping

`jopayrolls` → `job_order_payrolls`:

| legacy | new | note |
|---|---|---|
| `id` | `legacy_id` | upsert key |
| `from` / `to` | `period_start` / `period_end` | `parseFlexibleCsvDate` |
| `days` | `days` | |
| `areas` | `areas` | verbatim |
| `description`, `particulars` | same | |
| `deleted_at` | `deleted_at` | 146 rows |
| `created_at` | `created_at` | preserves list ordering |
| — | `payroll_date` | NULL; legacy has no such column |
| — | `status` | `'finalized'` — all migrated rows are historical |
| — | `is_reconstructed` | `true` |

`jopayroll_members` → `job_order_payroll_members`:

| legacy | new |
|---|---|
| `id` | `legacy_id` |
| `jopayroll_id` | `payroll_id`, resolved via `job_order_payrolls.legacy_id` |
| `jo_id` | `job_order_employee_id`, resolved via `job_order_employees.legacy_id` |
| `days`, `hours` | `days`, `hours` |
| `weekends`, `holidays` | **dropped** — 0 populated rows |
| — | all snapshot columns, copied from the matched `job_order_employees` row |

### Which rows are imported

Of 1,616 legacy payrolls: the **660 with members** and the **146 soft-deleted**
(imported with `deleted_at` set, so `legacy_id` stays stable) — 806 selected,
of which **805 land** and 1 is isolated (below). The **810 empty live payrolls**
are abandoned legacy drafts; they are skipped and reported as a count.
Importing them would make roughly half of what HR sees a period header with no
people and a ₱0.00 total.

### Error handling

Bad rows are isolated and reported, never allowed to fail a chunk — the
behaviour established in commit `ca715f7`. Every rule below was checked against
the real files rather than anticipated:

- **Payroll `11` (`from = 12/06/1979`, `to = 07/17/1979`) violates
  `chk_job_order_payroll_period`.** It is the only row in the import set whose
  period runs backwards, and it is an empty, soft-deleted 1979 legacy typo, so
  nothing is lost by isolating it. The importer validates period ordering in TS
  *before* insert and reports the row; the CHECK constraint stays, because it is
  worth having for every payroll created from here on. This is why the import
  lands 805 of 806.
- **Date-parse failures do not affect the import set.** Payroll `796`
  (`to = "04/30/202"`) is an empty live payroll and is skipped as such; payroll
  `938` (`from = "06/01/24"`) parses correctly via the two-digit-year pivot. The
  warning path still exists because the importer parses all 1,616 rows before
  deciding what to skip, and because a re-export could contain new bad dates.
- Dates outside 2020–2027 are flagged as out-of-range warnings rather than
  rejected. Exactly one row qualifies today (the 1979 payroll above).
- A missing expected column produces a warning naming the consequence, not a
  silent green summary — the Spec 1 final-review fix.

The result summary reports: payrolls created / updated / skipped-empty /
isolated, members created / updated, unresolved references, date-parse
failures, and out-of-range dates.

## Verification

In CLAUDE.md's stated order of value.

**1. Real stack** — `supabase/tests/job-order-payroll.test.mts`:

- an anon-key PostgREST client receives `[]` from both tables (Spec 1's RLS hole
  survived nine task gates because no test used an anon client)
- a finalized payroll rejects metadata, member, `days`, `hours` and `rate` writes
- reopen is rejected for `hr_admin` and `jo_manager`, accepted for `super_admin`
- deleting a `job_order_employees` row leaves the member row present with its
  snapshot intact and `job_order_employee_id` NULL
- upserting the same `legacy_id` twice yields one row updated in place — the
  migration 059 regression pin, on both tables
- `UNIQUE (payroll_id, job_order_employee_id)` rejects a double-add and permits
  multiple rows with a NULL `job_order_employee_id`
- a soft-deleted JO is still resolvable by `legacy_id` (the 5,893-row path)
- `chk_job_order_payroll_period` rejects `period_end < period_start`, which is
  what forces the importer to pre-validate legacy payroll 11

**2. Pure unit** — `supabase/tests/job-order-payroll-helpers.test.mts` (the
project keeps pure unit tests alongside the real-stack ones, run via
`--experimental-strip-types`, not under `src/`):

- weekday count: `2022-07-01 … 2022-07-15 → 11`, pinned against the real legacy
  value; plus month-boundary, year-boundary, single weekday, single weekend day,
  a weekend-only range → 0, and `period_end < period_start`
- the existing amount helpers keep their null-tolerant behaviour
- `groupMembersByRate` ordering
- the snapshot mapper, including a JO with all-null optional fields

**3.** `npm run lint && npm run build`, with both suites wired into the
`test:db` / `test:dtr` npm scripts.

## Out of scope for Spec 2

- Memos and Special Orders — Spec 3
- Deleting the dormant `employment_type = 'jo'` rows from `hris.employees`.
  This spec removes the last reader of those rows, so the cleanup migration
  becomes possible afterwards, but it stays a separate, post-verification change.
- Area scoping for `jo_manager` — still carried over from Spec 1
- Holiday deduction from working days. The advisory is displayed; the
  subtraction is the user's deliberate act.
- Any payroll concept beyond daily rate × days and overtime hours — no tax
  withholding, no loans, no adjustments. Nothing in the legacy data or the
  printables implies them.
- Migrating the legacy `jo_logs` change history (Spec 1 decision, unchanged)

## Findings carried into Spec 3

- `jo_memos` carries `type`, `subject`, `description`, `particulars`,
  `memo_series` and `page_break_offset`; `jo_s_o_s` carries `description`,
  `subject`, `particulars`, `days` and `page_break_offset`. Both have `from`/`to`
  date ranges the original request did not mention.
- `jomemo_members` and `joso_members` follow the same shape as
  `jopayroll_members`, so the snapshot decision made here should be reapplied
  rather than re-litigated.
- The non-partial `legacy_id` unique index rule (migration 059) applies to every
  new legacy-backed table.
