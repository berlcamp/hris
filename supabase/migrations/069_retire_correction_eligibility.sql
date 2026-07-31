-- Migration 069: retire employees.attendance_correction_eligible.
--
-- Migration 065 introduced the flag as the answer to "who may a Department
-- Admin correct". HR had to switch it on per employee before the department
-- could file anything, which in practice meant HR fielding a request to enable
-- the flag before it could field the correction — the same round trip the
-- module existed to remove.
--
-- The replacement is a WHEN rule instead of a WHO rule, in
-- src/lib/correction-window.ts: a Department Admin reaches every ACTIVE
-- employee whose effective department (detailed_department_id ??
-- department_id) is their own, but only for duty dates inside the payroll
-- month still being closed — the current month, plus the previous month while
-- today is within the first 7 days. Anything older is HR's, through the
-- direct-apply path, which this migration does not touch.
--
-- That bounds the delegated power more meaningfully than the flag did. A
-- department could always take its time with a flagged employee; now the
-- window shuts on its own, on the payroll calendar, with no list to maintain.
--
-- Nothing in attendance_correction_requests or _items references this column,
-- so requests filed while it existed — live, approved or rejected — are
-- unaffected. The proof requirement, the two-party approval for department
-- filings, and correction_locked are all unchanged.

SET search_path TO hris, public, auth, extensions;

-- The partial index from 065 (WHERE attendance_correction_eligible). Dropped
-- explicitly rather than relying on the column drop to cascade, so the
-- intent is visible in the migration.
DROP INDEX IF EXISTS hris.idx_employees_correction_eligible;

ALTER TABLE hris.employees
  DROP COLUMN IF EXISTS attendance_correction_eligible;
