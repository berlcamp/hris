# JO Payroll — Follow-ups after merge

Source: the final whole-branch review of the Spec 2 (JO Payroll) branch,
28 commits, `4ea3eb9..c9b25f8`. Everything Critical and Important from that
review was fixed before merge; this is what was deliberately deferred, with the
reviewer's triage preserved.

Fifteen deferred findings accumulated across the ten tasks. Triage outcome:
**1 promoted and fixed** (the search-escaping crash), **9 follow-ups**,
**7 dropped**, **2 already done during execution**.

The nine follow-ups consolidate into three tasks.

## Task A — helper extraction (highest leverage)

Three separate findings share one root cause: business logic living inside
`"use server"` modules, which Node's plain ESM loader cannot import because it
cannot resolve `next/cache` / `next/headers` outside Next's bundler.

The final fix wave already extracted `assertDraft` and the reopen/delete role
predicate into `src/lib/job-order-payroll-guards.ts` and unit-tested them. Two
instances remain:

1. **`supabase/tests/job-order-payroll.test.mts` cases 12 and 13 re-run copied
   production logic** rather than importing the real functions — the `areas`
   re-sync step of `recomputeAreas`, and the member-upsert chunk loop inside
   `importJobOrderPayrollCsv`. Both prove genuine database behaviour, so they
   are not hollow, but neither would notice if the real function drifted. The
   test file header discloses this.
2. **Non-action helpers are exported from a `"use server"` module.**
   `loadMembers`, `recomputeAreas` and `loadJobOrdersForSnapshot` are exported
   from `src/lib/actions/job-order-payroll-actions.ts`, so each gets a
   server-action endpoint with no auth check. Not exploitable — the first
   parameter is a live `SupabaseClient`, which is not serializable, so a remote
   call throws before doing anything — but it widens the action namespace for no
   benefit.

Extract the member-upsert chunk loop and `recomputeAreas`' persistence step into
plain modules importable by both the actions and the tests, then repoint cases
12 and 13 at the real functions. Move the three helpers out of the `"use server"`
file in the same pass.

## Task B — schema and validation test pass

All in `src/lib/validations/job-order-payroll-schema.ts` and
`supabase/tests/job-order-payroll-helpers.test.mts`:

- **`isoDate` admits calendar-invalid dates.** The regex `^\d{4}-\d{2}-\d{2}$`
  accepts `2026-02-30` and `2026-13-01`. Postgres rejects them on insert, which
  produces exactly the raw-constraint-error UX that the `period_end >=
  period_start` refinement exists to avoid one field over. `z.iso.date()` is a
  drop-in replacement.
- **`optionalNonNegative` silently nulls unparseable input** — `"12x"` becomes
  `null` rather than failing validation. Practically unreachable behind
  `type="number"` inputs, but silently clearing a money field is the wrong
  failure mode.
- **No test pins the `payroll_date` `""` / `null` / `undefined` collapse**, nor
  `optionalNonNegative`'s divergence between rejecting negatives and nulling
  garbage.
- **No test for `deriveAreasLabel([])`** (empty array). Correct by inspection;
  `summarizeMembers([])` has one.
- **`countWeekdays` is untested for well-formed but invalid dates** like
  `2026-02-30`. Only `"not-a-date"` is covered.

## Task C — UI polish pass

- **Duplicated `PAGE_SIZE = 20`.**
  `src/components/job-orders/payroll/job-order-payroll-list-client.tsx`
  hardcodes it to compute `totalPages`, independently of
  `getJobOrderPayrolls`' own `filters.pageSize ?? 20` default. Nothing enforces
  they stay equal; if the server default changes, client page-count math drifts
  silently. Export one shared constant.
- **Dead sort affordance on the Period column.**
  `src/components/tables/columns/job-order-payroll-columns.tsx` wires
  `DataTableColumnHeader` (which renders a sort control) onto a column with no
  `accessorKey`, so `getCanSort()` is false and `getSortedRowModel()` is
  unreachable configuration. Either give it an `accessorFn` or use a plain
  header. A server-paginated list cannot meaningfully client-sort anyway.
- **Icon-only destructive button with no accessible name.**
  `job-order-payroll-members-table.tsx` renders a bare `<Trash2>` in a ghost
  icon button. The `<span className="sr-only">` pattern is three files away in
  `job-order-payroll-columns.tsx`.
- **Doubled info glyph** — a lucide `<Info>` and a literal `ⓘ` on the same line
  in `job-order-payroll-create-dialog.tsx`.
- **`isPending` discarded**, so there is no in-flight feedback during a
  filter/page navigation — a brief blank interval before the new server render.

## Two things worth a decision rather than a fix

- **Overtime is excluded from on-screen totals but included in the printout.**
  `computeJoNetAmount` ignores `hours` despite `JoPayrollComputeInput` declaring
  it, while `renderDailyWagesPayroll` computes `gross = daysPay + otPay`. So
  entering 8 overtime hours changes nothing in the members table, the detail
  header, or the list's "Net total" column — but does change the printed
  document. **This is inherited verbatim**: the deleted
  `jo-payroll-detail-modal.tsx` behaved identically and the helper is unchanged
  from before this branch, so it is not a regression. But the new column
  labelled "Net total" is a new surface for it. Either fold overtime into
  `summarizeMembers` / `computeJoNetAmount`, or relabel the columns "Regular
  net".
- **`getHolidaysInRange` is unauthenticated.**
  `src/lib/actions/holiday-actions.ts` uses the admin client with no
  `getCurrentUser()` check, matching the existing `getHolidays()` in the same
  file. The data is non-sensitive (public holidays), but this branch added a new
  unauthenticated server-action surface. One `if (!user) return []` closes it,
  and doing so would diverge from the file's prevailing convention — hence a
  decision, not a defect.

## Out of scope here, but recorded

- **`src/lib/actions/rsp-actions.ts:503` has the same unquoted PostgREST
  `.or()` comma defect** that was fixed as I1 in the payroll module. A search
  term containing a comma will 400 there too. Not touched, because it belongs to
  an unrelated module.
- **eslint scans a stale detached worktree** at
  `.claude/worktrees/youthful-colden-816034`, from an unrelated branch, which
  double-counts problems. The repo's "4 errors" figure is really 2 real errors
  counted twice. Pre-existing; cleaning it up would make lint numbers meaningful
  again.
- **Migration 064 drops two tables with no pre-flight row count.** Verified safe:
  only migrations 023 and 064 reference them, no dependent views or inbound FKs,
  and the drop order is correct. The residual risk is only that the "never used
  in production" premise was wrong, in which case there is no backup path. A
  `SELECT count(*) FROM hris.jo_payroll;` before applying costs nothing.

## What the review said about the plan itself

Worth carrying into future specs for this project, because it was the dominant
quality signal: **nine of the eleven Important-or-worse findings across the ten
tasks originated in the plan's reference code, not in an implementer.** Zero were
implementation errors against a correct spec. The plan's prose was consistently
better than its code.

Concretely, four things should have been specified differently:

1. **`max_rows` should have been a module-wide constraint, not per-function
   guidance.** The pre-flight scan corrected one unpaginated select and left two
   others; per-function review cannot catch a missing instance of a rule, only an
   enumeration can. That omission produced the branch's only Critical finding.
2. **The verification list should have been an enforced checklist, not prose.**
   Two of its ten bullets — the finalized lock and the reopen role split, i.e.
   the two properties the whole feature exists to establish — were never
   implemented and never disclosed, while everything else on the list was done
   well. A prose list in a spec has no enforcement point.
3. **The spec mandated real-stack tests for a lock enforced in TypeScript inside
   an unimportable module** — unsatisfiable as written. Specifying "extract the
   guard, then test it" would have pre-empted three separate findings.
4. **The importer's idempotency claim was underspecified.** "Idempotent on
   `legacy_id`, so re-running updates in place" was true of row identity and
   false of row content, because snapshots were re-read from the live roster.
   Saying which columns a re-run may overwrite would have pre-empted it.

Future plans for this project should specify constraints and invariants and let
implementers write the code, rather than shipping reference implementations that
get transcribed faithfully — defects included.
