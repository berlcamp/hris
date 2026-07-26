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

Task 7: complete (commits 660c7c8..a752d29, review + 1 fix round, verified)
  - IMPORTANT DISCOVERY: CLAUDE.md says "Forms: shadcn Form + react-hook-form
    + zod resolver", but there is NO src/components/ui/form.tsx and ZERO
    FormField usages in the repo. The real house pattern is useForm +
    zodResolver with plain Input/Label (see employee-form.tsx,
    schedule-manager.tsx). The plan repeated CLAUDE.md's error; the implementer
    correctly followed the actual codebase. CLAUDE.md should be corrected.
  - Fix round resolved 2 real defects:
    1. Blank numeric fields saved as 0 instead of null. In a PAYROLL module a
       cleared daily_rate meant gross pay of zero. optionalMoney reworked to
       z.preprocess + z.union([z.literal(""), z.coerce.number()]) -> null.
       Union ORDER matters: z.coerce.number() parses "" as 0 successfully
       (Number("")===0), so z.literal("") must come FIRST or it never fires.
       Controller-verified all 10 cases: blank->null, explicit 0 preserved as 0.
       Fixing this in the SCHEMA (not per-field setValueAs) means Task 8's CSV
       importer inherits the correct behaviour too.
    2. Area column sorted by raw UUID while displaying names. Now mirrors the
       "department" column convention in employee-columns.tsx: accessor returns
       the display name (sorting matches what is shown), filterFn reads
       row.original.area_id (UUID filtering still works).
  - Sidebar: added Job Orders group (HardHat + MapPin); extended the existing
    isActive special-casing so /job-orders/areas does not dual-highlight.
  - Build passes; lint 43 (2 errors, 41 warnings) = no new ERRORS; the +2
    warnings are the known react-hooks/incompatible-library class.

Task 8: complete (commits 3f62665 extraction + ec96cea importer)
  - Helper extraction VERIFIED BEHAVIOUR-PRESERVING: normHeader, colIndex,
    parseMoney, parseFlexibleCsvDate byte-compared against their versions on
    main -> all four IDENTICAL. salary-csv-import-actions.ts now imports them.
    This mattered because a silent change there would corrupt SALARY data.
  - Upsert keyed on legacy_id (onConflict) => re-running a CSV updates in place.
  - warnParse() helper centralises "unparseable char column -> null + warning"
    across all 9 tolerant columns; blank yields null with NO warning (blank is
    not a parse failure). Only a missing fullname skips a person.
  - Implementer added an in-file duplicate-legacy_id guard NOT in the brief.
    Good catch: Postgres rejects an ENTIRE upsert statement when one chunk
    contains duplicate conflict keys, so a duplicated id in the export would
    have silently dropped up to 199 unrelated people from a 200-row chunk.
  - Import actions guarded on super_admin only (tighter than canManageJobOrders).
  - NOTE: no separate diff-review was run for Task 8; its core risk (import
    idempotency) is covered directly by Task 9's real-stack tests, and the
    final whole-branch review covers the rest.

Task 9: complete (commit 958111b), 16/18 new tests pass — 2 fail ON PURPOSE,
pinning a real defect
  - Ran all 9 brief tests + 3 review-round additions (whitespace-codepoint
    differential test against the real DB, duplicate-legacy_id-in-one-batch,
    Unassigned-seed-guard re-run idempotency) against the real stack
    (migrations through 056 applied via `db:reset`).
  - SEVERE FINDING, CONFIRMED, NOT FIXED (out of scope — no migration/app
    edits allowed): `job_order_employees.legacy_id`'s only unique index is
    PARTIAL (`WHERE legacy_id IS NOT NULL`, migration 056). PostgREST's
    `on_conflict` cannot target a partial index (no way to pass the required
    predicate), so EVERY `.upsert(..., {onConflict:"legacy_id"})` call fails
    with Postgres 42P10, regardless of duplicates. Verified 3 ways: supabase-js
    admin client, raw curl straight to PostgREST (bypassing the JS client
    entirely), and reading job-order-csv-import-actions.ts:479 to confirm it
    uses the identical call shape. Consequence: Task 8's CSV importer cannot
    currently save a single row against the real stack — every chunk's error
    is caught and every row in it is reported skipped (not silent; visible in
    result.errors, but non-functional). This is exactly the risk Task 8's own
    note flagged as deferred to Task 9 ("its core risk (import idempotency) is
    covered directly by Task 9's real-stack tests") — and it turned out not
    to hold.
  - Two tests are committed FAILING on purpose to pin this: the brief's
    "upsert on legacy_id is idempotent" test, and the new
    duplicate-legacy_id-in-one-batch test (which was written expecting
    Postgres cardinality-violation 21000, but actually gets 42P10 first — a
    more fundamental defect masks the one the review round was trying to pin;
    the mismatch itself is documented as the finding, not smoothed over).
  - Fix needs a decision by whoever picks this up: either replace the partial
    unique index with a non-partial unique constraint (and find another way
    to allow multiple NULL legacy_id rows for manually-created employees), or
    change the importer to do a manual existence-check + separate insert/update
    instead of a single upsert.
  - Lint stays at the 43-problem (2 errors, 41 warnings) baseline; build passes.

Task 9: complete (commits 958111b, b79a106, bf2070e) — ALL 9 TASKS DONE
  *** The real-stack tier earned its keep here. It caught a SEVERE defect that
  no amount of SQL reasoning or diff review had found across 8 prior tasks: ***
  - migration 056 created uq_job_order_employees_legacy_id as a PARTIAL index
    (WHERE legacy_id IS NOT NULL). Postgres can only infer a partial unique
    index for ON CONFLICT if the statement repeats the predicate, and
    PostgREST's .upsert({onConflict:"legacy_id"}) never emits one. EVERY upsert
    failed with 42P10. legacy_id idempotency is the foundation of the whole
    migration strategy, so the CSV importer could not save a single row.
  - Controller reproduced it directly against the live local DB before acting.
  - Fixed in NEW migration 059 (not by editing 056, which may already be
    applied in production). Predicate dropped: it was never needed, because
    Postgres unique indexes already treat NULLs as distinct, so hand-entered
    employees with NULL legacy_id are unaffected. Verified in a transaction:
    upsert twice -> 1 row updated in place; 2 NULL rows coexist.
  - FULL SUITE GREEN: 33/33 unit + 18/18 real-stack = 51/51.

## Coordination risk
- A parallel session is building a COS module on branch `feat/cos-module` in
  the MAIN working directory. It has taken migrations 057/058 (no collision
  with JO's 055/056), but it also modifies `package.json` — the same file
  Tasks 2 and 9 edit (test scripts). Expect a merge conflict in the
  `test:dtr` / `test:db` script lines. Resolve by keeping BOTH suites.
