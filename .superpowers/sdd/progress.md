# Job Orders Spec 1 — SDD Progress Ledger

Plan: docs/superpowers/plans/2026-07-26-job-orders-foundation.md
Spec: docs/superpowers/specs/2026-07-26-job-orders-foundation-design.md
Branch: feat/job-orders-module
Worktree: scratchpad/jo-worktree

## Tasks
1. Database schema (055 + 056)
2. Pure helpers + unit tests
3. jo_manager role
4. Validation schemas
5. Area server actions
6. Employee server actions
7. UI (areas, employees, sidebar)
8. CSV import
9. Real-stack tests

## Minor findings (for final review triage)

## Completed
Task 1: complete (commits 4fdd2b5..bbf4127, review clean)

## Minor findings (for final review triage)
- T5-minor: `optionalMoney` coerces blank input to 0, not null, so "not
  entered" is indistinguishable from "entered as zero" for daily_rate /
  working_hours / sss_ss / sss_ec. Matches existing convention in
  cos-payroll-schema.ts, jo-payroll-schema.ts, payroll-schema.ts — but
  rsp-schema.ts:24 uses a safer z.union([...z.literal("")]) that preserves the
  distinction. Consider for final review.
- T5-minor: duplicated 23505 ternary in create+update; revalidatePath
  asymmetry (delete revalidates only /job-orders/areas).
- T2: implementer reports twice contained non-verbatim transcripts (one had
  "CloudJS" where Node emits "CommonJS"). Controller now verifies test output
  first-hand rather than trusting reports. Watch for this in later tasks.
- T1: `idx_job_order_employees_deleted_at` (056:136) is a plain index on a
  column that is NULL for nearly all rows. A partial index
  (`WHERE deleted_at IS NOT NULL`) or dropping it would be better. No
  precedent for `idx_*_deleted_at` elsewhere in the migration history.

Task 2: complete (commits bbf4127..bc9cfb5, review clean after 3 fix rounds)
  - normalizeAreaName verified BYTE-IDENTICAL to the Postgres generated column
    across all 26 whitespace codepoints, by differential test against the live
    local DB (controller-run, not self-reported).
  - Final rule: JS whitespace, MINUS U+FEFF (BOM), PLUS U+0085 (NEL).
    Postgres en_US.UTF-8 \s is locale-aware. Guard test pins all 26 codepoints.
  - 33/33 tests passing.

Task 3: complete (commits bc9cfb5..a6e73bc, reviewed by controller directly)
  - All 7 touchpoints wired; label "JO Manager" everywhere; build PASSES.
  - Lint: 41 problems, byte-identical to main => zero new issues introduced.
  - app-sidebar.tsx WAS touched, correctly: roleLabels is Record<UserRole,string>
    (exhaustive), so the build requires the entry. No nav item added (Task 7).
  - NOTE: the Task 3 implementer returned an incoherent final message; the work
    was verified from the diff and a real build instead of from its report.

Task 4: complete (commit 1314635, verified by controller with runtime checks)
  - Ran 11 behaviour checks against the real schema: both ATM refine directions,
    blank-vs-absent account, coercion of numeric strings, negative rate, bad
    uuid, empty name. ALL PASS. Build passes; lint stays at the 41 baseline.

  GOTCHA discovered (affects later tasks): zod v4 `.uuid()` is STRICT RFC 9562 —
  it validates the version AND variant nibbles. Placeholder UUIDs of the form
  `11111111-1111-1111-1111-111111111111` or this repo's existing seed style
  `00000000-0000-0000-0000-0000000000e1` are REJECTED. Real ids from
  `gen_random_uuid()` are v4-compliant so production is unaffected, but any
  hand-written UUID fixture that passes through `jobOrderEmployeeSchema` will
  fail validation. Task 9 inserts via PostgREST (bypasses zod) so it is safe;
  Task 7's form and Tasks 5/6's actions DO run zod.

Task 5: complete (commits a6e73bc..c16a9e6, review + 1 fix round, verified)
  - Review found 3 Important bugs, ALL originating in the plan's own example
    code (plan-mandated). Fixed because they contradicted plan INTENT, not a
    deliberate design choice:
    1. deleteJobOrderArea guard FAILED OPEN — `{ count }` destructured without
       `error`, so a failed count query soft-deleted an area that may still
       have employees. ON DELETE RESTRICT cannot fire on a soft delete, so the
       DB would not have caught it. Now fails closed on error AND on null count.
    2. updateJobOrderArea returned a value missing `employee_count`, violating
       its declared JobOrderArea return type. Now queries the real live count.
    3. getJobOrderAreas counted employees with ONE unpaginated select; PostgREST
       `max_rows = 1000` (supabase/config.toml) truncates silently. Legacy
       roster is ~578 and growing — this WOULD have silently undercounted.
       Now pages with .range() in 1000-row chunks via countEmployeesByArea().
  - Build compiles; lint at the 41 baseline.

Task 6: complete (commits c16a9e6..660c7c8, review approved + 1 fix round)
  - Implementer proactively applied all 3 Task 5 lesson classes (pagination,
    error capture, interface conformance) and added an .order("id") tiebreaker
    so .range() paging cannot drop/duplicate rows across pages.
  - Create/update inactive-area ASYMMETRY implemented + commented: create
    refuses an inactive area; update deliberately does NOT re-check, so an
    employee whose area later went inactive stays editable.
  - previous_daily_rate compares numerically (PostgREST returns numeric as
    STRINGS, so a string-vs-number compare would report a change on every save).
  - Fix round: deleteJobOrderEmployee was returning success + writing an audit
    entry for non-existent ids (PostgREST does not error on a zero-row update).
    Now verifies the row transitioned before auditing, and records oldValues.
  - Build compiles; lint at the 41 baseline; 8/8 queries schema-qualified.

## Coordination risk
- A parallel session is building a COS module on branch `feat/cos-module` in
  the MAIN working directory. It has taken migrations 057/058 (no collision
  with JO's 055/056), but it also modifies `package.json` — the same file
  Tasks 2 and 9 edit (test scripts). Expect a merge conflict in the
  `test:dtr` / `test:db` script lines. Resolve by keeping BOTH suites.
