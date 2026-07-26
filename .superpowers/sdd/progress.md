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

## Coordination risk
- A parallel session is building a COS module on branch `feat/cos-module` in
  the MAIN working directory. It has taken migrations 057/058 (no collision
  with JO's 055/056), but it also modifies `package.json` — the same file
  Tasks 2 and 9 edit (test scripts). Expect a merge conflict in the
  `test:dtr` / `test:db` script lines. Resolve by keeping BOTH suites.
