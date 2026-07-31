# Attendance Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Department Admin file proof-backed attendance corrections for flagged employees in their department, applied to the DTR only after HR/DTR Manager approval.

**Architecture:** A correction request holds *proposed* state in two new tables; `hris.attendance_logs` is untouched until approval. On approval a server action recomputes each affected row in TypeScript using the existing `attendance-schedule.ts` helpers, then a single Postgres function performs a drift check and writes every row in one transaction. Applied rows are marked `correction_locked` so biometric imports cannot clobber them.

**Tech Stack:** Next.js 16.2 App Router (React 19), Supabase (Postgres + Storage), TypeScript strict, react-hook-form + zod, shadcn/ui, `@tanstack/react-table`, `node:test` with `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-07-30-attendance-corrections-design.md`

## Global Constraints

- Every Supabase query MUST call `.schema("hris")` before `.from(...)`. Omitting it silently queries `public`.
- New migrations keep the numeric prefix sequence (next free: **065**) and start with `SET search_path TO hris, public, auth, extensions;`.
- **Do not** suggest running migrations. Writing the file completes the work.
- Server actions live in `src/lib/actions/*.ts` with `"use server"` at the top. A `"use server"` module may only export **async** functions — pure helpers go in a separate module.
- Use `createAdminClient()` (`src/lib/supabase/admin.ts`) for these actions, matching the rest of `attendance-actions.ts`, and re-implement role filtering in TypeScript.
- Every mutating action calls `logAudit()` from `src/lib/audit.ts` after the write. It swallows errors — keep that property.
- After writes, call `revalidatePath(...)` for affected routes.
- Node 22 required for tests (`nvm use`). Pure tests run with `npm run test:dtr`; stack tests with `npm run test:db` (needs `colima start && npm run db:start`).
- New test files must be added to the relevant `package.json` script or they will never run.
- Reason codes usable by a **requester**: `travel`, `field_work`, `official_business`, `off`, `no_break`. **`holiday` is excluded** — it stays with HR.
- Finish with `npm run lint && npm run build`.

---

### Task 1: Migration 065 — schema foundation and the `no_break` reason code

**Files:**
- Create: `supabase/migrations/065_attendance_corrections.sql`
- Modify: `src/lib/constants.ts:133-158`
- Test: `supabase/tests/attendance-corrections-unit.test.mts` (create)
- Modify: `package.json:15` (add the new test to `test:dtr`)

**Interfaces:**
- Consumes: nothing.
- Produces: tables `hris.attendance_correction_requests`, `hris.attendance_correction_items`; columns `employees.attendance_correction_eligible`, `attendance_logs.correction_locked`; the `no_break` reason code in `NO_TIME_REASONS`, `NO_TIME_REASON_LABELS.no_break = "NO BREAK"`, `NO_TIME_REASON_SHORT.no_break = "NB"`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/attendance-corrections-unit.test.mts`:

```ts
// Unit tests for the attendance-corrections constants and pure helpers.
//
// The `no_break` reason exists because an 8AM-5PM employee who works straight
// through lunch produces a DTR with two blank middle cells that read as MISSED
// PUNCHES to whoever signs the form. The math is already correct (0 late, 0
// undertime); only the printout is wrong. A reason in those slots states intent.
//
// Requires Node >= 22 for --experimental-strip-types.
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import {
  NO_TIME_REASONS,
  NO_TIME_REASON_LABELS,
  NO_TIME_REASON_SHORT,
} from "../../src/lib/constants.ts";

test("no_break is an available attendance reason", () => {
  assert.ok(
    (NO_TIME_REASONS as readonly string[]).includes("no_break"),
    "no_break must be in NO_TIME_REASONS",
  );
});

test("no_break prints NO BREAK in full and NB in a slot", () => {
  assert.equal(NO_TIME_REASON_LABELS.no_break, "NO BREAK");
  assert.equal(NO_TIME_REASON_SHORT.no_break, "NB");
});

test("every reason code has both a full and a short label", () => {
  for (const code of NO_TIME_REASONS) {
    assert.ok(NO_TIME_REASON_LABELS[code], `missing full label for ${code}`);
    assert.ok(NO_TIME_REASON_SHORT[code], `missing short label for ${code}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

First register it, then run. Edit `package.json:15` and append the new file to the `test:dtr` command:

```
supabase/tests/postgrest-filters.test.mts supabase/tests/attendance-corrections-unit.test.mts
```

Run: `npm run test:dtr`
Expected: FAIL — `no_break must be in NO_TIME_REASONS`.

- [ ] **Step 3: Add the reason code to constants**

In `src/lib/constants.ts`, add `"no_break"` to the `NO_TIME_REASONS` array and an entry to each label map:

```ts
export const NO_TIME_REASONS = [
  "travel",
  "field_work",
  "official_business",
  "holiday",
  "off",
  "no_break",
] as const;
```

```ts
export const NO_TIME_REASON_LABELS: Record<NoTimeReason, string> = {
  travel: "TRAVEL",
  field_work: "FIELD WORK",
  official_business: "OFFICIAL BUSINESS",
  holiday: "HOLIDAY",
  off: "OFF",
  no_break: "NO BREAK",
};

// Short labels printed inside a single DTR time cell.
export const NO_TIME_REASON_SHORT: Record<NoTimeReason, string> = {
  travel: "TRAVEL",
  field_work: "FW",
  official_business: "OB",
  holiday: "HOLIDAY",
  off: "OFF",
  no_break: "NB",
};
```

Also add, below the maps, the requester-facing subset:

```ts
// Reason codes a Department Admin may choose on a correction request.
// `holiday` is deliberately excluded: holidays are org-wide and managed
// centrally in hris.holidays (migration 040), so a per-employee holiday
// declared by one department would contradict that table.
export const CORRECTION_REASONS = [
  "travel",
  "field_work",
  "official_business",
  "off",
  "no_break",
] as const;

export type CorrectionReason = (typeof CORRECTION_REASONS)[number];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:dtr`
Expected: PASS.

- [ ] **Step 5: Write the migration**

Create `supabase/migrations/065_attendance_corrections.sql`:

```sql
-- Migration 065: Attendance corrections
--
-- A Department Admin can file a proof-backed request to correct an employee's
-- attendance over a date range; nothing reaches hris.attendance_logs until an
-- HR admin / DTR Manager approves it.
--
-- Three parts:
--   1. employees.attendance_correction_eligible — HR flags who is correctable.
--   2. The 'no_break' reason code, for a day worked straight through lunch.
--      Without it the DTR's two middle cells print blank and read as missed
--      punches. The late/undertime math for such a day is already correct.
--   3. attendance_logs.correction_locked — an applied correction must survive a
--      later biometric import, including one run with "overwrite existing" ON.

SET search_path TO hris, public, auth, extensions;

-- daterange overlap exclusion below needs GiST over a scalar (employee_id).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. Eligibility -------------------------------------------------------------

ALTER TABLE hris.employees
  ADD COLUMN IF NOT EXISTS attendance_correction_eligible BOOLEAN NOT NULL
    DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_employees_correction_eligible
  ON hris.employees(attendance_correction_eligible)
  WHERE attendance_correction_eligible;

-- 2. The 'no_break' reason code ----------------------------------------------
-- Widens the CHECK on all five reason columns. Same re-runnable DO-block
-- pattern as migrations 053 and 054: drop both the auto-named inline CHECK and
-- the previous named one, then re-add with the widened list.

DO $$
DECLARE
  col TEXT;
  allowed CONSTANT TEXT :=
    '''travel'', ''field_work'', ''official_business'', ''holiday'', ''off'', ''no_break''';
BEGIN
  FOREACH col IN ARRAY ARRAY[
    'no_time_reason',
    'time_in_am_reason',
    'time_out_am_reason',
    'time_in_pm_reason',
    'time_out_pm_reason'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE hris.attendance_logs DROP CONSTRAINT IF EXISTS %I',
      'attendance_logs_' || col || '_check'
    );
    EXECUTE format(
      'ALTER TABLE hris.attendance_logs DROP CONSTRAINT IF EXISTS %I',
      'attendance_logs_' || col || '_allowed'
    );
    EXECUTE format(
      'ALTER TABLE hris.attendance_logs ADD CONSTRAINT %I CHECK (%I IN (%s))',
      'attendance_logs_' || col || '_allowed', col, allowed
    );
  END LOOP;
END $$;

-- 3. Import protection --------------------------------------------------------
-- runImportReplay already skips days whose source is no longer 'biometric', but
-- importDahuaAttendance with overwrite ON upserts unconditionally. An explicit
-- flag is used rather than relying on `source`, which other flows may reset.

ALTER TABLE hris.attendance_logs
  ADD COLUMN IF NOT EXISTS correction_locked BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_attendance_logs_correction_locked
  ON hris.attendance_logs(correction_locked)
  WHERE correction_locked;

-- 4. Requests -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hris.attendance_correction_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id        UUID NOT NULL REFERENCES hris.employees(id),
  -- Effective department (detailed_department_id ?? department_id), snapshot at
  -- submit time so a later re-detail does not orphan a pending request.
  department_id      UUID REFERENCES hris.departments(id),
  date_from          DATE NOT NULL,
  date_to            DATE NOT NULL,
  reason             TEXT NOT NULL,
  proof_path         TEXT NOT NULL,
  proof_filename     TEXT NOT NULL,
  proof_mime         TEXT,
  proof_size         INT,
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','needs_rebase','approved','rejected','cancelled')),
  requested_by       UUID,
  requested_by_email TEXT,
  requested_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by        UUID,
  reviewed_by_email  TEXT,
  reviewed_at        TIMESTAMPTZ,
  review_notes       TEXT,
  applied_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT acr_range_chk CHECK (date_to >= date_from)
);

CREATE INDEX IF NOT EXISTS idx_acr_status ON hris.attendance_correction_requests(status);
CREATE INDEX IF NOT EXISTS idx_acr_department ON hris.attendance_correction_requests(department_id);
CREATE INDEX IF NOT EXISTS idx_acr_employee ON hris.attendance_correction_requests(employee_id);

-- At most one LIVE request per employee per overlapping date range.
-- 'needs_rebase' counts as live: the requester is expected to re-base it, so it
-- keeps its claim on those dates.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'acr_no_overlapping_pending'
  ) THEN
    ALTER TABLE hris.attendance_correction_requests
      ADD CONSTRAINT acr_no_overlapping_pending
      EXCLUDE USING gist (
        employee_id WITH =,
        daterange(date_from, date_to, '[]') WITH &&
      ) WHERE (status IN ('pending','needs_rebase'));
  END IF;
END $$;

-- 5. Items ---------------------------------------------------------------------
-- attendance_log_id is NOT NULL on purpose: an item can only exist for a date
-- that ALREADY has an attendance row. This enforces in the schema that this
-- workflow corrects misread and incomplete days, and never invents a day that
-- was never recorded.

CREATE TABLE IF NOT EXISTS hris.attendance_correction_items (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id             UUID NOT NULL
                           REFERENCES hris.attendance_correction_requests(id) ON DELETE CASCADE,
  duty_date              DATE NOT NULL,
  attendance_log_id      UUID NOT NULL REFERENCES hris.attendance_logs(id),
  disposition            TEXT NOT NULL DEFAULT 'update'
                           CHECK (disposition IN ('update','clear_as_off')),
  proposed_schedule_id   UUID REFERENCES hris.schedules(id),
  proposed_time_in_am    TIMESTAMPTZ,
  proposed_time_out_am   TIMESTAMPTZ,
  proposed_time_in_pm    TIMESTAMPTZ,
  proposed_time_out_pm   TIMESTAMPTZ,
  -- Narrower than the column these feed: attendance_logs accepts 'holiday',
  -- correction items do not.
  proposed_in_am_reason  TEXT CHECK (proposed_in_am_reason  IN ('travel','field_work','official_business','off','no_break')),
  proposed_out_am_reason TEXT CHECK (proposed_out_am_reason IN ('travel','field_work','official_business','off','no_break')),
  proposed_in_pm_reason  TEXT CHECK (proposed_in_pm_reason  IN ('travel','field_work','official_business','off','no_break')),
  proposed_out_pm_reason TEXT CHECK (proposed_out_pm_reason IN ('travel','field_work','official_business','off','no_break')),
  -- Snapshot of the attendance row at request time: drives the reviewer's
  -- before/after diff and the drift check at apply time.
  before                 JSONB NOT NULL,
  UNIQUE (request_id, duty_date)
);

CREATE INDEX IF NOT EXISTS idx_aci_request ON hris.attendance_correction_items(request_id);
CREATE INDEX IF NOT EXISTS idx_aci_log ON hris.attendance_correction_items(attendance_log_id);

-- 6. Proof storage bucket -------------------------------------------------------
-- Private, unlike the public `201-files` bucket: a document naming an employee
-- and their hours should not sit behind a guessable URL. Served via signed URL.
-- Guarded because Storage is disabled in the local config.toml (see CLAUDE.md),
-- so storage.buckets does not exist on a local stack.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'buckets'
  ) THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('attendance-proofs', 'attendance-proofs', false)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
```

- [ ] **Step 6: Verify the migration applies cleanly**

Run: `colima start && npm run db:start && npm run db:reset`
Expected: completes with no error; the reset output reaches `065_attendance_corrections.sql` and finishes.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/065_attendance_corrections.sql src/lib/constants.ts \
        supabase/tests/attendance-corrections-unit.test.mts package.json
git commit -m "feat(attendance): schema for proof-backed corrections + no_break reason"
```

---

### Task 2: Permission helpers

**Files:**
- Modify: `src/lib/auth-helpers.ts` (append)
- Test: `supabase/tests/attendance-corrections-unit.test.mts` (append)

**Interfaces:**
- Consumes: `UserRole` from `src/lib/types.ts`.
- Produces: `canRequestAttendanceCorrection(role)`, `canReviewAttendanceCorrection(role)`, `canFlagCorrectionEligible(role)` — all `(role: UserRole | null | undefined) => boolean`.

- [ ] **Step 1: Write the failing test**

Append to `supabase/tests/attendance-corrections-unit.test.mts`:

```ts
import {
  canRequestAttendanceCorrection,
  canReviewAttendanceCorrection,
  canFlagCorrectionEligible,
  canAccessAttendance,
} from "../../src/lib/auth-helpers.ts";

test("department admins may request corrections", () => {
  assert.equal(canRequestAttendanceCorrection("department_admin"), true);
  assert.equal(
    canRequestAttendanceCorrection("department_admin_and_department_head"),
    true,
  );
});

test("requesters cannot review their own corrections", () => {
  assert.equal(canReviewAttendanceCorrection("department_admin"), false);
  assert.equal(canReviewAttendanceCorrection("department_head"), false);
});

test("HR admin, super admin and DTR manager review corrections", () => {
  for (const role of ["super_admin", "hr_admin", "dtr_manager"] as const) {
    assert.equal(canReviewAttendanceCorrection(role), true, role);
    assert.equal(canFlagCorrectionEligible(role), true, role);
  }
});

// The whole point of a narrow helper: filing a correction must NOT drag in the
// Dahua importer, bulk DTR generation, or entry deletion.
test("requesting a correction does not grant attendance module access", () => {
  assert.equal(canAccessAttendance("department_admin"), false);
  assert.equal(canAccessAttendance("department_admin_and_department_head"), false);
});

test("null and undefined roles are denied everywhere", () => {
  for (const fn of [
    canRequestAttendanceCorrection,
    canReviewAttendanceCorrection,
    canFlagCorrectionEligible,
  ]) {
    assert.equal(fn(null), false);
    assert.equal(fn(undefined), false);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:dtr`
Expected: FAIL — `canRequestAttendanceCorrection is not a function`.

- [ ] **Step 3: Add the helpers**

Append to `src/lib/auth-helpers.ts`:

```ts
// Roles that may FILE an attendance correction request. Deliberately narrow:
// department-scoped roles stay out of ATTENDANCE_ACCESS_ROLES, so filing a
// correction grants no access to the Dahua importer, bulk DTR generation or
// entry deletion. Their reach is further limited to employees whose EFFECTIVE
// department (detailed_department_id ?? department_id) is their own AND who
// carry employees.attendance_correction_eligible.
const CORRECTION_REQUESTER_ROLES: readonly UserRole[] = [
  "department_admin",
  "department_admin_and_department_head",
] as const;

export function canRequestAttendanceCorrection(
  role: UserRole | null | undefined,
): boolean {
  return !!role && CORRECTION_REQUESTER_ROLES.includes(role);
}

// Roles that approve or reject a correction. Nothing a requester files reaches
// a DTR without one of these roles approving it, so the two sets must not
// overlap.
const CORRECTION_REVIEWER_ROLES: readonly UserRole[] = [
  "super_admin",
  "hr_admin",
  "dtr_manager",
] as const;

export function canReviewAttendanceCorrection(
  role: UserRole | null | undefined,
): boolean {
  return !!role && CORRECTION_REVIEWER_ROLES.includes(role);
}

// Roles that may flag an employee as correction-eligible. Same set as the
// reviewers: deciding WHO can be corrected is the same authority as deciding
// WHAT gets corrected.
export function canFlagCorrectionEligible(
  role: UserRole | null | undefined,
): boolean {
  return !!role && CORRECTION_REVIEWER_ROLES.includes(role);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:dtr`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth-helpers.ts supabase/tests/attendance-corrections-unit.test.mts
git commit -m "feat(attendance): permission helpers for correction requests"
```

---

### Task 3: Extract the attendance-record builder into a pure module

`buildManualEntryRecord` lives inside `attendance-actions.ts`, which is a
`"use server"` module — such modules may only export async functions, so the
correction path cannot import it. Extract it to a pure module first, with tests
pinning the CURRENT behavior, then build on it. **This task changes no
behavior.**

**Files:**
- Create: `src/lib/attendance-record.ts`
- Modify: `src/lib/actions/attendance-actions.ts:208-249` (remove `computeAttendanceFlags`), `:382-450` (make `buildManualEntryRecord` a re-export wrapper)
- Test: `supabase/tests/attendance-record.test.mts` (create)
- Modify: `package.json:15`

**Interfaces:**
- Consumes: `ScheduleLike`, `timeOnNextDayForNightShift`, `lateMinutesFor`, `undertimeMinutesFor` from `src/lib/attendance-schedule.ts`.
- Produces:
  - `interface AttendanceTimeFields { time_in_am, time_out_am, time_in_pm, time_out_pm: string | null; schedule_id?: string | null; remarks?: string | null; no_time_reason?: string | null; reason_in_am, reason_out_am, reason_in_pm, reason_out_pm?: string | null }`
  - `computeAttendanceFlags(entry, dutyDate, sched): { is_late, late_minutes, is_undertime, undertime_minutes, is_absent }`
  - `buildAttendanceRecord(employeeId: string, date: string, fields: AttendanceTimeFields, sched: ScheduleLike): Record<string, unknown>`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/attendance-record.test.mts`:

```ts
// Characterisation tests for the attendance_logs record builder extracted from
// attendance-actions.ts. These pin the CURRENT behaviour so the extraction is
// provably behaviour-preserving, and they are the contract the correction
// apply path builds on.
//
// Requires Node >= 22 for --experimental-strip-types.
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAttendanceRecord,
  computeAttendanceFlags,
} from "../../src/lib/attendance-record.ts";
import type { ScheduleLike } from "../../src/lib/attendance-schedule.ts";

const REGULAR: ScheduleLike = {
  id: "regular",
  time_in: "08:00",
  time_out: "17:00",
  break_start: "12:00",
  break_end: "13:00",
};

const NIGHT: ScheduleLike = {
  id: "night",
  time_in: "22:00",
  time_out: "05:00",
  break_start: null,
  break_end: null,
};

const EMP = "11111111-1111-1111-1111-111111111111";
const D = "2026-06-15"; // a Monday

const noReasons = {
  reason_in_am: null,
  reason_out_am: null,
  reason_in_pm: null,
  reason_out_pm: null,
};

test("an on-time regular day is neither late nor undertime", () => {
  const r = buildAttendanceRecord(
    EMP,
    D,
    { time_in_am: "08:00", time_out_am: "12:00", time_in_pm: "13:00", time_out_pm: "17:00", ...noReasons },
    REGULAR,
  );
  assert.equal(r.late_minutes, 0);
  assert.equal(r.undertime_minutes, 0);
  assert.equal(r.is_absent, false);
  assert.equal(r.time_in_am, `${D}T08:00:00`);
});

// This is the 8-5-no-lunch case from the spec: the MATH is already right, and
// only the printed DTR's two blank middle cells are misleading.
test("working straight through lunch charges no late and no undertime", () => {
  const r = buildAttendanceRecord(
    EMP,
    D,
    { time_in_am: "08:00", time_out_am: null, time_in_pm: null, time_out_pm: "17:00", ...noReasons },
    REGULAR,
  );
  assert.equal(r.late_minutes, 0);
  assert.equal(r.undertime_minutes, 0);
});

test("a night shift clock-out rolls to the next calendar day", () => {
  const r = buildAttendanceRecord(
    EMP,
    D,
    { time_in_am: "21:55", time_out_am: null, time_in_pm: null, time_out_pm: "06:05", ...noReasons },
    NIGHT,
  );
  assert.equal(r.time_in_am, `${D}T21:55:00`);
  assert.equal(r.time_out_pm, "2026-06-16T06:05:00");
  assert.equal(r.late_minutes, 0);
  assert.equal(r.undertime_minutes, 0);
});

test("an AM reason waives tardiness, a PM reason waives undertime", () => {
  const r = buildAttendanceRecord(
    EMP,
    D,
    {
      time_in_am: "10:30",
      time_out_am: null,
      time_in_pm: null,
      time_out_pm: null,
      reason_in_am: "official_business",
      reason_out_am: null,
      reason_in_pm: null,
      reason_out_pm: "official_business",
    },
    REGULAR,
  );
  assert.equal(r.late_minutes, 0, "AM reason must zero tardiness");
  assert.equal(r.undertime_minutes, 0, "PM reason must zero undertime");
  assert.equal(r.is_absent, false);
});

test("middle-slot reasons change neither tardiness nor undertime", () => {
  const r = buildAttendanceRecord(
    EMP,
    D,
    {
      time_in_am: "08:00",
      time_out_am: null,
      time_in_pm: null,
      time_out_pm: "17:00",
      reason_in_am: null,
      reason_out_am: "no_break",
      reason_in_pm: "no_break",
      reason_out_pm: null,
    },
    REGULAR,
  );
  assert.equal(r.late_minutes, 0);
  assert.equal(r.undertime_minutes, 0);
  assert.equal(r.time_out_am_reason, "no_break");
  assert.equal(r.time_in_pm_reason, "no_break");
});

test("a day with no punches and no reason is absent", () => {
  const flags = computeAttendanceFlags(
    { time_in_am: null, time_out_am: null, time_in_pm: null, time_out_pm: null },
    D,
    REGULAR,
  );
  assert.equal(flags.is_absent, true);
});
```

- [ ] **Step 2: Register and run the test to verify it fails**

Append `supabase/tests/attendance-record.test.mts` to the `test:dtr` script in `package.json:15`.

Run: `npm run test:dtr`
Expected: FAIL — cannot find module `src/lib/attendance-record.ts`.

- [ ] **Step 3: Create the pure module**

Create `src/lib/attendance-record.ts` by moving the bodies of
`computeAttendanceFlags` (`attendance-actions.ts:208-249`) and
`buildManualEntryRecord` (`:382-450`) verbatim, plus the two local helpers
`toTimestamp` (`:132-135`) and `addDaysIso`:

```ts
// Builds a hris.attendance_logs row from HH:MM punch fields and a schedule.
//
// Extracted from attendance-actions.ts so non-server code can use it: a
// "use server" module may only export async functions, which put this out of
// reach of both the correction apply path and unit tests. Behaviour is
// unchanged — attendance-actions.ts now re-exports from here.

import {
  lateMinutesFor,
  timeOnNextDayForNightShift,
  undertimeMinutesFor,
  type ScheduleLike,
} from "@/lib/attendance-schedule";

export interface AttendanceTimeFields {
  time_in_am: string | null;
  time_out_am: string | null;
  time_in_pm: string | null;
  time_out_pm: string | null;
  schedule_id?: string | null;
  remarks?: string | null;
  no_time_reason?: string | null;
  reason_in_am?: string | null;
  reason_out_am?: string | null;
  reason_in_pm?: string | null;
  reason_out_pm?: string | null;
}

function toTimestamp(date: string, time: string | null): string | null {
  if (!time) return null;
  return `${date}T${time}:00`;
}

function addDaysIso(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function computeAttendanceFlags(
  entry: {
    time_in_am: string | null;
    time_out_am: string | null;
    time_in_pm: string | null;
    time_out_pm: string | null;
    time_in_am_next_day?: boolean;
    time_in_pm_next_day?: boolean;
    time_out_pm_next_day?: boolean;
  },
  dutyDate: string,
  sched: ScheduleLike,
) {
  const hasAnyLog =
    entry.time_in_am || entry.time_out_am || entry.time_in_pm || entry.time_out_pm;
  // For no-break shifts the single in/out lives in time_in_am / time_out_pm;
  // for has-break shifts the morning in / evening out are the late/undertime
  // anchors. Either way, time_in_am and time_out_pm are correct.
  const lateMinutes = lateMinutesFor(
    dutyDate,
    sched,
    entry.time_in_am,
    entry.time_in_am_next_day ?? false,
  );
  const undertimeMinutes = undertimeMinutesFor(
    dutyDate,
    sched,
    entry.time_out_pm,
    entry.time_out_pm_next_day ?? false,
    !!entry.time_in_am,
    entry.time_in_pm,
    entry.time_in_pm_next_day ?? false,
  );

  return {
    is_late: lateMinutes > 0,
    late_minutes: lateMinutes,
    is_undertime: undertimeMinutes > 0,
    undertime_minutes: undertimeMinutes,
    is_absent: !hasAnyLog,
  };
}

export function buildAttendanceRecord(
  employeeId: string,
  date: string,
  fields: AttendanceTimeFields,
  sched: ScheduleLike,
) {
  // A night-shift HH:MM rolls to the next calendar day only when it falls in
  // the early-morning portion of the shift (per the off-shift midpoint). This
  // keeps an on-time evening clock-in (22:00 for a 22:00–05:00 shift) on the
  // duty date instead of mis-dating it a day ahead.
  const dateFor = (t: string | null): string => {
    if (!t) return date;
    return timeOnNextDayForNightShift(t, sched) ? addDaysIso(date, 1) : date;
  };
  const nextDay = (t: string | null): boolean =>
    !!t && timeOnNextDayForNightShift(t, sched);

  const flags = computeAttendanceFlags(
    {
      ...fields,
      time_in_am_next_day: nextDay(fields.time_in_am),
      time_out_pm_next_day: nextDay(fields.time_out_pm),
    },
    date,
    sched,
  );

  const noTimeReason = fields.no_time_reason ?? null;
  // A reason is kept even when the slot also has a punched time (e.g. a HOLIDAY
  // the employee still logged in on). The DTR prints the reason for that slot
  // instead of the time, and the time stays on record.
  const reasonInAm = fields.reason_in_am ?? null;
  const reasonOutAm = fields.reason_out_am ?? null;
  const reasonInPm = fields.reason_in_pm ?? null;
  const reasonOutPm = fields.reason_out_pm ?? null;
  const hasAnyReason =
    !!noTimeReason || !!reasonInAm || !!reasonOutAm || !!reasonInPm || !!reasonOutPm;

  return {
    employee_id: employeeId,
    date,
    schedule_id: fields.schedule_id ?? null,
    time_in_am: toTimestamp(dateFor(fields.time_in_am), fields.time_in_am),
    time_out_am: toTimestamp(dateFor(fields.time_out_am), fields.time_out_am),
    time_in_pm: toTimestamp(dateFor(fields.time_in_pm), fields.time_in_pm),
    time_out_pm: toTimestamp(dateFor(fields.time_out_pm), fields.time_out_pm),
    remarks: fields.remarks || null,
    no_time_reason: noTimeReason,
    time_in_am_reason: reasonInAm,
    time_out_am_reason: reasonOutAm,
    time_in_pm_reason: reasonInPm,
    time_out_pm_reason: reasonOutPm,
    source: "manual",
    ...flags,
    // An official-duty reason excuses the missing punch: the day is on duty
    // (not absent), and tardiness/undertime tied to the excused slot is dropped.
    ...(reasonInAm ? { is_late: false, late_minutes: 0 } : {}),
    ...(reasonOutPm ? { is_undertime: false, undertime_minutes: 0 } : {}),
    ...(hasAnyReason ? { is_absent: false } : {}),
  };
}
```

- [ ] **Step 4: Point `attendance-actions.ts` at the new module**

In `src/lib/actions/attendance-actions.ts`, delete the local
`computeAttendanceFlags` (`:208-249`) and the body of `buildManualEntryRecord`
(`:382-450`), and import instead. Keep the `ManualEntryTimeFields` type and the
existing call sites unchanged:

```ts
import {
  buildAttendanceRecord,
  computeAttendanceFlags,
} from "@/lib/attendance-record";
```

```ts
// Builds the attendance_logs row for one duty date from the manual-entry
// fields. Thin wrapper over the shared builder in attendance-record.ts, which
// the correction apply path also uses so both produce identical rows.
function buildManualEntryRecord(
  employeeId: string,
  date: string,
  fields: ManualEntryTimeFields,
  sched: ScheduleLike,
) {
  return buildAttendanceRecord(employeeId, date, fields, sched);
}
```

Keep the local `toTimestamp` / `extractTime` in `attendance-actions.ts` — other
call sites use them.

- [ ] **Step 5: Run the full pure suite to verify nothing regressed**

Run: `npm run test:dtr`
Expected: PASS, including the pre-existing `dtr-bucketing` tests.

- [ ] **Step 6: Verify the app still builds**

Run: `npm run lint && npm run build`
Expected: both succeed.

- [ ] **Step 7: Commit**

```bash
git add src/lib/attendance-record.ts src/lib/actions/attendance-actions.ts \
        supabase/tests/attendance-record.test.mts package.json
git commit -m "refactor(attendance): extract attendance-record builder to a pure module"
```

---

### Task 4: Correction record builder

**Files:**
- Create: `src/lib/attendance-corrections.ts`
- Test: `supabase/tests/attendance-corrections-unit.test.mts` (append)

**Interfaces:**
- Consumes: `buildAttendanceRecord`, `AttendanceTimeFields` (Task 3); `ScheduleLike`, `crossesMidnight` from `attendance-schedule.ts`; `CorrectionReason` from `constants.ts` (Task 1).
- Produces:
  - `type Disposition = "update" | "clear_as_off"`
  - `interface CorrectionItemInput { duty_date: string; disposition: Disposition; schedule: ScheduleLike; scheduleId: string | null; time_in_am/out_am/in_pm/out_pm: string | null; reason_in_am/out_am/in_pm/out_pm: CorrectionReason | null }`
  - `buildCorrectionRecord(employeeId: string, item: CorrectionItemInput): Record<string, unknown>`
  - `resolveCorrectionSchedule(pinned, rowPinned, employeeSched, orgDefault): ScheduleLike`
  - `trailingDutyDate(dateTo: string, sched: ScheduleLike): string | null`

- [ ] **Step 1: Write the failing test**

Append to `supabase/tests/attendance-corrections-unit.test.mts`:

```ts
import {
  buildCorrectionRecord,
  resolveCorrectionSchedule,
  trailingDutyDate,
  type CorrectionItemInput,
} from "../../src/lib/attendance-corrections.ts";
import type { ScheduleLike } from "../../src/lib/attendance-schedule.ts";

const REGULAR: ScheduleLike = {
  id: "regular", time_in: "08:00", time_out: "17:00",
  break_start: "12:00", break_end: "13:00",
};
const NIGHT: ScheduleLike = {
  id: "night", time_in: "22:00", time_out: "05:00",
  break_start: null, break_end: null,
};
const EMP2 = "22222222-2222-2222-2222-222222222222";
const DAY = "2026-06-15";

const item = (over: Partial<CorrectionItemInput>): CorrectionItemInput => ({
  duty_date: DAY,
  disposition: "update",
  schedule: REGULAR,
  scheduleId: null,
  time_in_am: null, time_out_am: null, time_in_pm: null, time_out_pm: null,
  reason_in_am: null, reason_out_am: null, reason_in_pm: null, reason_out_pm: null,
  ...over,
});

// The headline case: 835 min late + 240 min undertime under the inherited 8-5
// schedule becomes 0/0 once the night shift is pinned.
test("pinning a night schedule clears a misread night shift", () => {
  const wrong = buildCorrectionRecord(EMP2, item({
    schedule: REGULAR, time_in_am: "21:55",
  }));
  assert.equal(wrong.late_minutes, 835);

  const right = buildCorrectionRecord(EMP2, item({
    schedule: NIGHT, scheduleId: "night", time_in_am: "21:55", time_out_pm: "06:05",
  }));
  assert.equal(right.late_minutes, 0);
  assert.equal(right.undertime_minutes, 0);
  assert.equal(right.schedule_id, "night");
  assert.equal(right.time_out_pm, "2026-06-16T06:05:00");
});

test("clear_as_off empties the day and prints OFF without marking it absent", () => {
  const r = buildCorrectionRecord(EMP2, item({
    disposition: "clear_as_off",
    schedule: NIGHT,
    // Any proposed times are discarded by clear_as_off.
    time_in_am: "21:55", time_out_pm: "06:05",
  }));
  assert.equal(r.time_in_am, null);
  assert.equal(r.time_out_am, null);
  assert.equal(r.time_in_pm, null);
  assert.equal(r.time_out_pm, null);
  assert.equal(r.time_in_am_reason, "off");
  assert.equal(r.time_out_pm_reason, "off");
  assert.equal(r.is_absent, false, "an OFF day is not an absence");
  assert.equal(r.late_minutes, 0);
  assert.equal(r.undertime_minutes, 0);
});

test("an applied correction is locked against later biometric overwrite", () => {
  const r = buildCorrectionRecord(EMP2, item({ time_in_am: "08:00", time_out_pm: "17:00" }));
  assert.equal(r.correction_locked, true);
  assert.equal(r.source, "manual");
});

test("no_break fills the two middle slots of a straight-duty day", () => {
  const r = buildCorrectionRecord(EMP2, item({
    time_in_am: "08:00", time_out_pm: "17:00",
    reason_out_am: "no_break", reason_in_pm: "no_break",
  }));
  assert.equal(r.time_out_am_reason, "no_break");
  assert.equal(r.time_in_pm_reason, "no_break");
  assert.equal(r.late_minutes, 0);
  assert.equal(r.undertime_minutes, 0);
});

test("schedule resolution prefers the item pin, then the row pin, then the employee", () => {
  const orgDefault: ScheduleLike = { ...REGULAR, id: "org" };
  const employee: ScheduleLike = { ...REGULAR, id: "emp" };
  const rowPin: ScheduleLike = { ...REGULAR, id: "row" };
  const itemPin: ScheduleLike = { ...NIGHT, id: "item" };

  assert.equal(resolveCorrectionSchedule(itemPin, rowPin, employee, orgDefault).id, "item");
  assert.equal(resolveCorrectionSchedule(null, rowPin, employee, orgDefault).id, "row");
  assert.equal(resolveCorrectionSchedule(null, null, employee, orgDefault).id, "emp");
  assert.equal(resolveCorrectionSchedule(null, null, null, orgDefault).id, "org");
});

// A night-shift range consumes the following morning, so an N-day range touches
// N+1 rows. A day-shift range does not.
test("a night-shift range reaches one day past its end", () => {
  assert.equal(trailingDutyDate("2026-06-20", NIGHT), "2026-06-21");
  assert.equal(trailingDutyDate("2026-06-20", REGULAR), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:dtr`
Expected: FAIL — cannot find module `src/lib/attendance-corrections.ts`.

- [ ] **Step 3: Create the module**

Create `src/lib/attendance-corrections.ts`:

```ts
// Pure logic for turning a proposed correction item into the hris.attendance_logs
// row that approval will write. Shares buildAttendanceRecord with manual entry so
// a corrected day is indistinguishable from a hand-entered one — except for
// correction_locked, which protects it from a later biometric overwrite.

import { buildAttendanceRecord } from "@/lib/attendance-record";
import { crossesMidnight, type ScheduleLike } from "@/lib/attendance-schedule";
import type { CorrectionReason } from "@/lib/constants";

export type Disposition = "update" | "clear_as_off";

export interface CorrectionItemInput {
  /** Duty date, YYYY-MM-DD. */
  duty_date: string;
  disposition: Disposition;
  /** Already-resolved schedule — see resolveCorrectionSchedule. */
  schedule: ScheduleLike;
  /** The pinned schedule's id, or null to inherit. Written to attendance_logs. */
  scheduleId: string | null;
  time_in_am: string | null;
  time_out_am: string | null;
  time_in_pm: string | null;
  time_out_pm: string | null;
  reason_in_am: CorrectionReason | null;
  reason_out_am: CorrectionReason | null;
  reason_in_pm: CorrectionReason | null;
  reason_out_pm: CorrectionReason | null;
}

// Which schedule a corrected day is measured against, most specific first.
// Mirrors how the DTR builders resolve a day: the per-day pin wins, then the
// employee's assignment, then the org default.
export function resolveCorrectionSchedule(
  itemPin: ScheduleLike | null,
  rowPin: ScheduleLike | null,
  employeeSchedule: ScheduleLike | null,
  orgDefault: ScheduleLike,
): ScheduleLike {
  return itemPin ?? rowPin ?? employeeSchedule ?? orgDefault;
}

// A midnight-crossing shift starting on `dateTo` finishes the NEXT morning, so
// its punches land on dateTo's duty date and the following calendar day is left
// empty. That trailing day needs an explicit disposition or it reads as an
// absence. Day shifts return null — they touch only the days in range.
export function trailingDutyDate(
  dateTo: string,
  sched: ScheduleLike,
): string | null {
  if (!crossesMidnight(sched)) return null;
  const d = new Date(dateTo + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function buildCorrectionRecord(
  employeeId: string,
  item: CorrectionItemInput,
) {
  // clear_as_off discards any proposed times and marks the whole day OFF. Used
  // for the day a night-shift re-pin empties out: without a reason the row has
  // no punches and computeAttendanceFlags would mark it ABSENT.
  const fields =
    item.disposition === "clear_as_off"
      ? {
          time_in_am: null,
          time_out_am: null,
          time_in_pm: null,
          time_out_pm: null,
          schedule_id: item.scheduleId,
          reason_in_am: "off",
          reason_out_am: "off",
          reason_in_pm: "off",
          reason_out_pm: "off",
        }
      : {
          time_in_am: item.time_in_am,
          time_out_am: item.time_out_am,
          time_in_pm: item.time_in_pm,
          time_out_pm: item.time_out_pm,
          schedule_id: item.scheduleId,
          reason_in_am: item.reason_in_am,
          reason_out_am: item.reason_out_am,
          reason_in_pm: item.reason_in_pm,
          reason_out_pm: item.reason_out_pm,
        };

  return {
    ...buildAttendanceRecord(employeeId, item.duty_date, fields, item.schedule),
    // Excluded from both import paths even with "overwrite existing" ON.
    correction_locked: true,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:dtr`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance-corrections.ts supabase/tests/attendance-corrections-unit.test.mts
git commit -m "feat(attendance): correction record builder with clear_as_off and locking"
```

---

### Task 5: Migration 066 — the transactional apply function

**Files:**
- Create: `supabase/migrations/066_apply_attendance_correction.sql`
- Test: `supabase/tests/attendance-corrections-db.test.mts` (create)
- Modify: `package.json:16` (add to `test:db`)

**Interfaces:**
- Consumes: tables from Task 1.
- Produces: `hris.apply_attendance_correction(p_request_id UUID, p_reviewer_id UUID, p_reviewer_email TEXT, p_rows JSONB) RETURNS TEXT` — returns `'applied'` or `'needs_rebase'`.
  `p_rows` is a JSON array of `{ "attendance_log_id": uuid, "record": { …attendance_logs columns… } }`, one element per item, produced by `buildCorrectionRecord`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/attendance-corrections-db.test.mts`:

```ts
// Stack tests for the correction apply path against real Postgres + PostgREST.
//
// The unit suite proves the record MATH. Only a real database can prove:
//   * apply_attendance_correction is atomic — a drifted row applies NOTHING.
//   * TIMESTAMPTZ round-trips: a 06:05 next-day clock-out written by the
//     builder must read back as 06:05 on the next day, not shifted. Migration
//     035 exists because this bit the project before.
//   * The overlap EXCLUDE constraint actually fires.
//
// Requires Node >= 22 and a running stack:
//   colima start && npm run db:start && npm run db:reset && npm run test:db

import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { buildCorrectionRecord } from "../../src/lib/attendance-corrections.ts";
import type { ScheduleLike } from "../../src/lib/attendance-schedule.ts";

const PROJECT_DIR = fileURLToPath(new URL("../..", import.meta.url));
const status = JSON.parse(
  execSync("npx supabase status -o json", { cwd: PROJECT_DIR, encoding: "utf8" }),
);
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  db: { schema: "hris" },
  auth: { autoRefreshToken: false, persistSession: false },
});

// Seeded by supabase/seed.sql.
const EMPLOYEE = "00000000-0000-0000-0000-0000000000e1";
const REVIEWER = "00000000-0000-0000-0000-00000000aaaa";
const NIGHT: ScheduleLike = {
  id: "night", time_in: "22:00", time_out: "05:00",
  break_start: null, break_end: null,
};

/** Creates an attendance row for `date` and returns its id. */
async function seedLog(date: string, timeInAm: string) {
  const { data, error } = await admin
    .from("attendance_logs")
    .upsert(
      { employee_id: EMPLOYEE, date, time_in_am: `${date}T${timeInAm}:00`, source: "biometric" },
      { onConflict: "employee_id,date" },
    )
    .select("id, time_in_am, schedule_id, time_out_am, time_in_pm, time_out_pm, source")
    .single();
  if (error) throw error;
  return data;
}

async function seedRequest(from: string, to: string) {
  const { data, error } = await admin
    .from("attendance_correction_requests")
    .insert({
      employee_id: EMPLOYEE, date_from: from, date_to: to,
      reason: "Night rotation per Office Order 2026-114",
      proof_path: "x/y.pdf", proof_filename: "y.pdf",
      requested_by_email: "dept@example.gov",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

const beforeOf = (log: Record<string, unknown>) => ({
  time_in_am: log.time_in_am, time_out_am: log.time_out_am,
  time_in_pm: log.time_in_pm, time_out_pm: log.time_out_pm,
  schedule_id: log.schedule_id, source: log.source,
});

test("applying a correction writes the recomputed row and locks it", async () => {
  const date = "2026-09-07";
  const log = await seedLog(date, "21:55");
  const requestId = await seedRequest(date, date);
  await admin.from("attendance_correction_items").insert({
    request_id: requestId, duty_date: date, attendance_log_id: log.id,
    disposition: "update", before: beforeOf(log),
  });

  const record = buildCorrectionRecord(EMPLOYEE, {
    duty_date: date, disposition: "update", schedule: NIGHT, scheduleId: null,
    time_in_am: "21:55", time_out_am: null, time_in_pm: null, time_out_pm: "06:05",
    reason_in_am: null, reason_out_am: null, reason_in_pm: null, reason_out_pm: null,
  });

  const { data: outcome, error } = await admin.rpc("apply_attendance_correction", {
    p_request_id: requestId,
    p_reviewer_id: REVIEWER,
    p_reviewer_email: "hr@example.gov",
    p_rows: [{ attendance_log_id: log.id, record }],
  });
  assert.equal(error, null);
  assert.equal(outcome, "applied");

  const { data: after } = await admin
    .from("attendance_logs")
    .select("time_in_am, time_out_pm, late_minutes, undertime_minutes, correction_locked, source")
    .eq("id", log.id)
    .single();

  assert.equal(after!.late_minutes, 0);
  assert.equal(after!.undertime_minutes, 0);
  assert.equal(after!.correction_locked, true);
  assert.equal(after!.source, "manual");
  // The TIMESTAMPTZ round trip that migration 035 exists for.
  assert.match(String(after!.time_in_am), /21:55/);
  assert.match(String(after!.time_out_pm), /2026-09-08.*06:05/);

  const { data: req } = await admin
    .from("attendance_correction_requests")
    .select("status, applied_at, reviewed_by_email")
    .eq("id", requestId).single();
  assert.equal(req!.status, "approved");
  assert.ok(req!.applied_at);
});

test("a drifted row applies nothing and returns the request for re-base", async () => {
  const date = "2026-09-14";
  const log = await seedLog(date, "21:55");
  const requestId = await seedRequest(date, date);
  await admin.from("attendance_correction_items").insert({
    request_id: requestId, duty_date: date, attendance_log_id: log.id,
    disposition: "update", before: beforeOf(log),
  });

  // Something else changes the row after the snapshot was taken.
  await admin.from("attendance_logs")
    .update({ time_in_am: `${date}T22:30:00` }).eq("id", log.id);

  const record = buildCorrectionRecord(EMPLOYEE, {
    duty_date: date, disposition: "update", schedule: NIGHT, scheduleId: null,
    time_in_am: "21:55", time_out_am: null, time_in_pm: null, time_out_pm: "06:05",
    reason_in_am: null, reason_out_am: null, reason_in_pm: null, reason_out_pm: null,
  });

  const { data: outcome } = await admin.rpc("apply_attendance_correction", {
    p_request_id: requestId, p_reviewer_id: REVIEWER,
    p_reviewer_email: "hr@example.gov",
    p_rows: [{ attendance_log_id: log.id, record }],
  });
  assert.equal(outcome, "needs_rebase");

  const { data: after } = await admin
    .from("attendance_logs")
    .select("time_in_am, correction_locked").eq("id", log.id).single();
  assert.match(String(after!.time_in_am), /22:30/, "row must be untouched");
  assert.equal(after!.correction_locked, false);

  const { data: req } = await admin
    .from("attendance_correction_requests")
    .select("status").eq("id", requestId).single();
  assert.equal(req!.status, "needs_rebase");
});

test("two live requests cannot claim overlapping dates for one employee", async () => {
  await seedRequest("2026-10-01", "2026-10-10");
  const { error } = await admin
    .from("attendance_correction_requests")
    .insert({
      employee_id: EMPLOYEE, date_from: "2026-10-05", date_to: "2026-10-15",
      reason: "overlapping", proof_path: "a/b.pdf", proof_filename: "b.pdf",
    });
  assert.ok(error, "the EXCLUDE constraint must reject an overlapping live request");
});
```

- [ ] **Step 2: Register and run the test to verify it fails**

Append `supabase/tests/attendance-corrections-db.test.mts` to the `test:db`
script in `package.json:16`.

Run: `npm run db:reset && npm run test:db`
Expected: FAIL — `apply_attendance_correction` does not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/066_apply_attendance_correction.sql`:

```sql
-- Migration 066: Transactional apply for an approved attendance correction.
--
-- The caller (approveAttendanceCorrection) computes each day's finished
-- attendance_logs row in TypeScript with buildCorrectionRecord, so the DTR math
-- lives in exactly one place — src/lib/attendance-schedule.ts — instead of being
-- reimplemented in SQL and drifting from it. This function's only jobs are the
-- drift check and committing every row together.
--
-- Returns 'needs_rebase' if ANY targeted row changed since its snapshot was
-- taken (a biometric import, an HR manual edit). Nothing is applied in that
-- case: a half-applied range is worse than none. The status change itself still
-- commits, so the requester sees the request come back to them.

SET search_path TO hris, public, auth, extensions;

CREATE OR REPLACE FUNCTION hris.apply_attendance_correction(
  p_request_id     UUID,
  p_reviewer_id    UUID,
  p_reviewer_email TEXT,
  p_rows           JSONB
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = hris, public, extensions
AS $$
DECLARE
  v_row     JSONB;
  v_rec     JSONB;
  v_log_id  UUID;
  v_before  JSONB;
  v_drift   BOOLEAN := false;
BEGIN
  -- Pass 1: lock every targeted row and compare it against its snapshot.
  -- Casting the snapshot's text back to the native column type makes the
  -- comparison immune to timestamp formatting differences between PostgREST,
  -- the JS client and Postgres.
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_log_id := (v_row->>'attendance_log_id')::UUID;

    SELECT i.before INTO v_before
    FROM hris.attendance_correction_items i
    WHERE i.request_id = p_request_id AND i.attendance_log_id = v_log_id;

    IF v_before IS NULL THEN
      v_drift := true;
      EXIT;
    END IF;

    PERFORM 1
    FROM hris.attendance_logs l
    WHERE l.id = v_log_id
      AND l.time_in_am  IS NOT DISTINCT FROM NULLIF(v_before->>'time_in_am','')::TIMESTAMPTZ
      AND l.time_out_am IS NOT DISTINCT FROM NULLIF(v_before->>'time_out_am','')::TIMESTAMPTZ
      AND l.time_in_pm  IS NOT DISTINCT FROM NULLIF(v_before->>'time_in_pm','')::TIMESTAMPTZ
      AND l.time_out_pm IS NOT DISTINCT FROM NULLIF(v_before->>'time_out_pm','')::TIMESTAMPTZ
      AND l.schedule_id IS NOT DISTINCT FROM NULLIF(v_before->>'schedule_id','')::UUID
      AND l.source      IS NOT DISTINCT FROM NULLIF(v_before->>'source','')
    FOR UPDATE;

    IF NOT FOUND THEN
      v_drift := true;
      EXIT;
    END IF;
  END LOOP;

  IF v_drift THEN
    UPDATE hris.attendance_correction_requests
    SET status = 'needs_rebase', updated_at = now()
    WHERE id = p_request_id;
    RETURN 'needs_rebase';
  END IF;

  -- Pass 2: every row verified, write them all.
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_log_id := (v_row->>'attendance_log_id')::UUID;
    v_rec    := v_row->'record';

    UPDATE hris.attendance_logs SET
      schedule_id        = NULLIF(v_rec->>'schedule_id','')::UUID,
      time_in_am         = NULLIF(v_rec->>'time_in_am','')::TIMESTAMPTZ,
      time_out_am        = NULLIF(v_rec->>'time_out_am','')::TIMESTAMPTZ,
      time_in_pm         = NULLIF(v_rec->>'time_in_pm','')::TIMESTAMPTZ,
      time_out_pm        = NULLIF(v_rec->>'time_out_pm','')::TIMESTAMPTZ,
      time_in_am_reason  = NULLIF(v_rec->>'time_in_am_reason',''),
      time_out_am_reason = NULLIF(v_rec->>'time_out_am_reason',''),
      time_in_pm_reason  = NULLIF(v_rec->>'time_in_pm_reason',''),
      time_out_pm_reason = NULLIF(v_rec->>'time_out_pm_reason',''),
      is_late            = (v_rec->>'is_late')::BOOLEAN,
      late_minutes       = (v_rec->>'late_minutes')::INT,
      is_undertime       = (v_rec->>'is_undertime')::BOOLEAN,
      undertime_minutes  = (v_rec->>'undertime_minutes')::INT,
      is_absent          = (v_rec->>'is_absent')::BOOLEAN,
      source             = 'manual',
      correction_locked  = true,
      updated_by         = p_reviewer_id,
      updated_by_email   = p_reviewer_email,
      updated_at         = now()
    WHERE id = v_log_id;
  END LOOP;

  UPDATE hris.attendance_correction_requests
  SET status            = 'approved',
      reviewed_by       = p_reviewer_id,
      reviewed_by_email = p_reviewer_email,
      reviewed_at       = now(),
      applied_at        = now(),
      updated_at        = now()
  WHERE id = p_request_id;

  RETURN 'applied';
END;
$$;
```

- [ ] **Step 4: Run the stack tests to verify they pass**

Run: `npm run db:reset && npm run test:db`
Expected: PASS, all three tests.

If the seeded `EMPLOYEE` / `REVIEWER` UUIDs do not exist, read
`supabase/seed.sql` and substitute real seeded ids rather than inventing them.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/066_apply_attendance_correction.sql \
        supabase/tests/attendance-corrections-db.test.mts package.json
git commit -m "feat(attendance): transactional apply function with drift detection"
```

---

### Task 6: Validation schemas and request server actions

**Files:**
- Create: `src/lib/validations/attendance-correction-schema.ts`
- Create: `src/lib/actions/attendance-correction-actions.ts`
- Test: `supabase/tests/attendance-correction-schema.test.mts` (create)
- Modify: `package.json:15`

**Interfaces:**
- Consumes: `canRequestAttendanceCorrection` (Task 2); `CORRECTION_REASONS` (Task 1); `getCurrentUser` from `src/lib/actions/auth-actions.ts`; `createAdminClient`; `logAudit`.
- Produces:
  - `correctionRequestSchema` (zod) with fields `employee_id`, `date_from`, `date_to`, `reason`, `items[]`.
  - `getCorrectableEmployees(): Promise<{ id, name, effective_department_id }[]>`
  - `getCorrectionDraftDays(employeeId, dateFrom, dateTo)` — the prefilled grid rows.
  - `createCorrectionRequest(input, proof: FormData)` → `{ id: string }`
  - `listCorrectionRequests()` — scoped by role.
  - `getCorrectionRequest(id)` — request + items + signed proof URL.
  - `cancelCorrectionRequest(id)`

- [ ] **Step 1: Write the failing schema test**

Create `supabase/tests/attendance-correction-schema.test.mts`:

```ts
// Unit tests for the correction request zod schema. These are the only thing
// between the wizard and a raw Postgres constraint violation, so what they
// REJECT matters as much as what they accept.
//
// Run: npm run test:dtr

import assert from "node:assert/strict";
import test from "node:test";
import { correctionRequestSchema } from "../../src/lib/validations/attendance-correction-schema.ts";

const EMP = "123e4567-e89b-12d3-a456-426614174000";
const LOG = "123e4567-e89b-12d3-a456-426614174001";

const validItem = {
  duty_date: "2026-06-15",
  attendance_log_id: LOG,
  disposition: "update" as const,
  proposed_schedule_id: null,
  time_in_am: "21:55", time_out_am: null, time_in_pm: null, time_out_pm: "06:05",
  reason_in_am: null, reason_out_am: null, reason_in_pm: null, reason_out_pm: null,
};

const valid = {
  employee_id: EMP,
  date_from: "2026-06-15",
  date_to: "2026-06-20",
  reason: "Night rotation per Office Order 2026-114",
  items: [validItem],
};

function firstError(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  assert.equal(result.success, false, "expected this input to be rejected");
  return result.error!.issues[0]!.message;
}

test("a well-formed request is accepted", () => {
  assert.equal(correctionRequestSchema.safeParse(valid).success, true);
});

test("date_to must not precede date_from", () => {
  const r = correctionRequestSchema.safeParse({ ...valid, date_from: "2026-06-20", date_to: "2026-06-15" });
  assert.match(firstError(r), /end date/i);
});

test("a calendar-invalid date is rejected", () => {
  const r = correctionRequestSchema.safeParse({ ...valid, date_from: "2026-02-30", date_to: "2026-02-30" });
  assert.equal(r.success, false);
});

// holiday is HR's alone — hris.holidays is org-wide.
test("holiday is not a reason a requester may choose", () => {
  const r = correctionRequestSchema.safeParse({
    ...valid,
    items: [{ ...validItem, reason_in_am: "holiday" }],
  });
  assert.equal(r.success, false);
});

test("a request with no items is rejected", () => {
  const r = correctionRequestSchema.safeParse({ ...valid, items: [] });
  assert.match(firstError(r), /at least one day/i);
});

test("a narrative reason is required", () => {
  const r = correctionRequestSchema.safeParse({ ...valid, reason: "  " });
  assert.match(firstError(r), /reason/i);
});

test("a malformed time is rejected rather than coerced", () => {
  const r = correctionRequestSchema.safeParse({
    ...valid,
    items: [{ ...validItem, time_in_am: "9am" }],
  });
  assert.equal(r.success, false);
});
```

- [ ] **Step 2: Register and run to verify it fails**

Append the file to `test:dtr` in `package.json:15`.

Run: `npm run test:dtr`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the schema**

Create `src/lib/validations/attendance-correction-schema.ts`:

```ts
import { z } from "zod";
import { CORRECTION_REASONS } from "@/lib/constants";

/** YYYY-MM-DD that is also a real calendar date (rejects 2026-02-30). */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date")
  .refine((s) => {
    const d = new Date(s + "T00:00:00");
    return !Number.isNaN(d.getTime()) && s === d.toISOString().slice(0, 10);
  }, "That date does not exist");

const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour HH:MM time")
  .nullable();

const reason = z.enum(CORRECTION_REASONS).nullable();

export const correctionItemSchema = z.object({
  duty_date: isoDate,
  attendance_log_id: z.uuid(),
  disposition: z.enum(["update", "clear_as_off"]),
  proposed_schedule_id: z.uuid().nullable(),
  time_in_am: hhmm,
  time_out_am: hhmm,
  time_in_pm: hhmm,
  time_out_pm: hhmm,
  reason_in_am: reason,
  reason_out_am: reason,
  reason_in_pm: reason,
  reason_out_pm: reason,
});

export const correctionRequestSchema = z
  .object({
    employee_id: z.uuid(),
    date_from: isoDate,
    date_to: isoDate,
    reason: z.string().trim().min(5, "Describe the reason for this correction"),
    items: z
      .array(correctionItemSchema)
      .min(1, "Select at least one day to correct"),
  })
  .refine((v) => v.date_to >= v.date_from, {
    message: "The end date must not precede the start date",
    path: ["date_to"],
  });

export type CorrectionRequestInput = z.infer<typeof correctionRequestSchema>;
export type CorrectionItemFormValues = z.infer<typeof correctionItemSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:dtr`
Expected: PASS.

- [ ] **Step 5: Write the request actions**

Create `src/lib/actions/attendance-correction-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { logAudit } from "@/lib/audit";
import {
  canRequestAttendanceCorrection,
  canReviewAttendanceCorrection,
} from "@/lib/auth-helpers";
import {
  correctionRequestSchema,
  type CorrectionRequestInput,
} from "@/lib/validations/attendance-correction-schema";

const PROOF_BUCKET = "attendance-proofs";
const MAX_PROOF_BYTES = 10 * 1024 * 1024;
const ALLOWED_PROOF_TYPES = ["application/pdf", "image/jpeg", "image/png"];

/** Columns compared by the apply-time drift check. Keep in sync with migration 066. */
function snapshotOf(log: Record<string, unknown>) {
  return {
    time_in_am: log.time_in_am ?? null,
    time_out_am: log.time_out_am ?? null,
    time_in_pm: log.time_in_pm ?? null,
    time_out_pm: log.time_out_pm ?? null,
    schedule_id: log.schedule_id ?? null,
    source: log.source ?? null,
  };
}

// Employees this user may correct: flagged eligible AND whose EFFECTIVE
// department (detailed_department_id ?? department_id) is the user's own.
// Exclusive, not additive — an employee detailed away belongs to the department
// that supervises the duty, which is also who signs their DTR.
export async function getCorrectableEmployees() {
  const user = await getCurrentUser();
  if (!user || !canRequestAttendanceCorrection(user.role) || !user.departmentId) {
    throw new Error("Unauthorized");
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("employees")
    .select("id, first_name, last_name, department_id, detailed_department_id")
    .eq("attendance_correction_eligible", true)
    .or(
      `detailed_department_id.eq.${user.departmentId},` +
        `and(detailed_department_id.is.null,department_id.eq.${user.departmentId})`,
    )
    .order("last_name");
  if (error) throw error;
  return (data ?? []).map((e) => ({
    id: e.id,
    name: `${e.last_name}, ${e.first_name}`,
  }));
}

/** Throws unless `employeeId` is within the caller's correction reach. */
async function assertReach(employeeId: string) {
  const allowed = await getCorrectableEmployees();
  if (!allowed.some((e) => e.id === employeeId)) {
    throw new Error("Unauthorized");
  }
}

// The prefilled grid: one row per date in range that ALREADY has an attendance
// row. Dates with no record are returned with `hasRecord: false` and cannot be
// corrected — this workflow fixes misread and incomplete days, it never invents
// a day that was never recorded.
export async function getCorrectionDraftDays(
  employeeId: string,
  dateFrom: string,
  dateTo: string,
) {
  await assertReach(employeeId);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("hris")
    .from("attendance_logs")
    .select(
      "id, date, schedule_id, time_in_am, time_out_am, time_in_pm, time_out_pm, " +
        "time_in_am_reason, time_out_am_reason, time_in_pm_reason, time_out_pm_reason, " +
        "late_minutes, undertime_minutes, is_absent, source, correction_locked",
    )
    .eq("employee_id", employeeId)
    .gte("date", dateFrom)
    .lte("date", dateTo)
    .order("date");
  if (error) throw error;
  return data ?? [];
}

export async function createCorrectionRequest(
  input: CorrectionRequestInput,
  proof: FormData,
) {
  const user = await getCurrentUser();
  if (!user || !canRequestAttendanceCorrection(user.role)) {
    throw new Error("Unauthorized");
  }
  const parsed = correctionRequestSchema.parse(input);
  await assertReach(parsed.employee_id);

  const file = proof.get("proof");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("A supporting document is required");
  }
  if (file.size > MAX_PROOF_BYTES) {
    throw new Error("The supporting document must be 10 MB or smaller");
  }
  if (!ALLOWED_PROOF_TYPES.includes(file.type)) {
    throw new Error("The supporting document must be a PDF, JPEG or PNG");
  }

  const supabase = createAdminClient();

  // Effective department, snapshot at submit time so a later re-detail does not
  // orphan the request.
  const { data: emp } = await supabase
    .schema("hris")
    .from("employees")
    .select("department_id, detailed_department_id")
    .eq("id", parsed.employee_id)
    .single();
  const departmentId = emp?.detailed_department_id ?? emp?.department_id ?? null;

  // Snapshot every targeted row BEFORE inserting, so the drift check has a
  // baseline taken at the same moment the requester saw the data.
  const logIds = parsed.items.map((i) => i.attendance_log_id);
  const { data: logs, error: logErr } = await supabase
    .schema("hris")
    .from("attendance_logs")
    .select("id, time_in_am, time_out_am, time_in_pm, time_out_pm, schedule_id, source")
    .in("id", logIds);
  if (logErr) throw logErr;
  const byId = new Map((logs ?? []).map((l) => [l.id, l]));
  if (byId.size !== logIds.length) {
    throw new Error("Some of those days no longer have an attendance record");
  }

  // Upload first: a failed upload must not leave a request row behind.
  const requestId = crypto.randomUUID();
  const path = `${parsed.employee_id}/${requestId}/${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from(PROOF_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw new Error(`Could not upload the proof: ${uploadError.message}`);

  const { error: reqError } = await supabase
    .schema("hris")
    .from("attendance_correction_requests")
    .insert({
      id: requestId,
      employee_id: parsed.employee_id,
      department_id: departmentId,
      date_from: parsed.date_from,
      date_to: parsed.date_to,
      reason: parsed.reason,
      proof_path: path,
      proof_filename: file.name,
      proof_mime: file.type,
      proof_size: file.size,
      requested_by: user.id,
      requested_by_email: user.email,
    });
  if (reqError) {
    await supabase.storage.from(PROOF_BUCKET).remove([path]);
    // The EXCLUDE constraint is the likely cause; say so in plain language.
    if (reqError.message.includes("acr_no_overlapping_pending")) {
      throw new Error(
        "This employee already has a correction request covering some of those dates",
      );
    }
    throw reqError;
  }

  const { error: itemError } = await supabase
    .schema("hris")
    .from("attendance_correction_items")
    .insert(
      parsed.items.map((i) => ({
        request_id: requestId,
        duty_date: i.duty_date,
        attendance_log_id: i.attendance_log_id,
        disposition: i.disposition,
        proposed_schedule_id: i.proposed_schedule_id,
        proposed_time_in_am: i.time_in_am,
        proposed_time_out_am: i.time_out_am,
        proposed_time_in_pm: i.time_in_pm,
        proposed_time_out_pm: i.time_out_pm,
        proposed_in_am_reason: i.reason_in_am,
        proposed_out_am_reason: i.reason_out_am,
        proposed_in_pm_reason: i.reason_in_pm,
        proposed_out_pm_reason: i.reason_out_pm,
        before: snapshotOf(byId.get(i.attendance_log_id)!),
      })),
    );
  if (itemError) throw itemError;

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "attendance_correction_requested",
    tableName: "attendance_correction_requests",
    recordId: requestId,
    newValues: {
      employee_id: parsed.employee_id,
      date_from: parsed.date_from,
      date_to: parsed.date_to,
      days: parsed.items.length,
    },
  });

  revalidatePath("/attendance-corrections");
  return { id: requestId };
}

export async function listCorrectionRequests() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  const supabase = createAdminClient();
  let query = supabase
    .schema("hris")
    .from("attendance_correction_requests")
    .select(
      "*, employees!attendance_correction_requests_employee_id_fkey(first_name, last_name)",
    )
    .order("requested_at", { ascending: false });

  if (canReviewAttendanceCorrection(user.role)) {
    // Reviewers see everything.
  } else if (canRequestAttendanceCorrection(user.role) && user.departmentId) {
    query = query.eq("department_id", user.departmentId);
  } else {
    throw new Error("Unauthorized");
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getCorrectionRequest(id: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  const supabase = createAdminClient();

  const { data: request, error } = await supabase
    .schema("hris")
    .from("attendance_correction_requests")
    .select(
      "*, employees!attendance_correction_requests_employee_id_fkey(first_name, last_name)",
    )
    .eq("id", id)
    .single();
  if (error) throw error;

  const isReviewer = canReviewAttendanceCorrection(user.role);
  const isOwnDept =
    canRequestAttendanceCorrection(user.role) &&
    !!user.departmentId &&
    request.department_id === user.departmentId;
  if (!isReviewer && !isOwnDept) throw new Error("Unauthorized");

  const { data: items } = await supabase
    .schema("hris")
    .from("attendance_correction_items")
    .select("*")
    .eq("request_id", id)
    .order("duty_date");

  // Private bucket — never a public URL.
  const { data: signed } = await supabase.storage
    .from(PROOF_BUCKET)
    .createSignedUrl(request.proof_path, 60 * 10);

  return { request, items: items ?? [], proofUrl: signed?.signedUrl ?? null };
}

export async function cancelCorrectionRequest(id: string) {
  const user = await getCurrentUser();
  if (!user || !canRequestAttendanceCorrection(user.role)) {
    throw new Error("Unauthorized");
  }
  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .schema("hris")
    .from("attendance_correction_requests")
    .select("department_id, status")
    .eq("id", id)
    .single();
  if (!existing || existing.department_id !== user.departmentId) {
    throw new Error("Unauthorized");
  }
  if (!["pending", "needs_rebase"].includes(existing.status)) {
    throw new Error("Only a live request can be withdrawn");
  }

  const { error } = await supabase
    .schema("hris")
    .from("attendance_correction_requests")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "attendance_correction_cancelled",
    tableName: "attendance_correction_requests",
    recordId: id,
  });
  revalidatePath("/attendance-corrections");
}
```

- [ ] **Step 6: Verify it compiles**

Run: `npm run lint && npm run build`
Expected: both succeed.

- [ ] **Step 7: Commit**

```bash
git add src/lib/validations/attendance-correction-schema.ts \
        src/lib/actions/attendance-correction-actions.ts \
        supabase/tests/attendance-correction-schema.test.mts package.json
git commit -m "feat(attendance): correction request schema and server actions"
```

---

### Task 7: Review actions — approve, reject, re-base

**Files:**
- Modify: `src/lib/actions/attendance-correction-actions.ts` (append)

**Interfaces:**
- Consumes: `buildCorrectionRecord`, `resolveCorrectionSchedule` (Task 4); `apply_attendance_correction` RPC (Task 5); `DEFAULT_SCHEDULE` from `attendance-schedule.ts`.
- Produces:
  - `approveCorrectionRequest(id: string): Promise<{ outcome: "applied" | "needs_rebase" }>`
  - `rejectCorrectionRequest(id: string, notes: string)`
  - `getCorrectionReviewSummary(id)` → `{ totalLateForgiven: number; totalUndertimeForgiven: number; days: { duty_date, before, after }[] }`

- [ ] **Step 1: Append the review actions**

Add to `src/lib/actions/attendance-correction-actions.ts`:

```ts
import {
  buildCorrectionRecord,
  resolveCorrectionSchedule,
} from "@/lib/attendance-corrections";
import {
  DEFAULT_SCHEDULE,
  type ScheduleLike,
} from "@/lib/attendance-schedule";
import type { CorrectionReason } from "@/lib/constants";

/** HH:MM out of a stored TIMESTAMPTZ. Mirrors extractTime in attendance-actions.ts. */
function hhmmOf(ts: string | null): string | null {
  return ts?.match(/(\d{2}:\d{2})/)?.[1] ?? null;
}

async function loadSchedule(
  supabase: ReturnType<typeof createAdminClient>,
  id: string | null,
): Promise<ScheduleLike | null> {
  if (!id) return null;
  const { data } = await supabase
    .schema("hris")
    .from("schedules")
    .select("id, time_in, time_out, break_start, break_end")
    .eq("id", id)
    .maybeSingle();
  return (data as ScheduleLike | null) ?? null;
}

export async function approveCorrectionRequest(id: string) {
  const user = await getCurrentUser();
  if (!user || !canReviewAttendanceCorrection(user.role)) {
    throw new Error("Unauthorized");
  }
  const supabase = createAdminClient();

  const { data: request, error: reqErr } = await supabase
    .schema("hris")
    .from("attendance_correction_requests")
    .select("id, employee_id, status")
    .eq("id", id)
    .single();
  if (reqErr) throw reqErr;
  if (!["pending", "needs_rebase"].includes(request.status)) {
    throw new Error("Only a live request can be approved");
  }

  const { data: items, error: itemErr } = await supabase
    .schema("hris")
    .from("attendance_correction_items")
    .select("*")
    .eq("request_id", id)
    .order("duty_date");
  if (itemErr) throw itemErr;
  if (!items || items.length === 0) throw new Error("This request has no days");

  // The employee's own schedule, and the org default, as fallbacks.
  const { data: emp } = await supabase
    .schema("hris")
    .from("employees")
    .select("schedules(id, time_in, time_out, break_start, break_end)")
    .eq("id", request.employee_id)
    .maybeSingle();
  const employeeSchedule =
    (emp?.schedules as unknown as ScheduleLike | null) ?? null;

  const { data: logs } = await supabase
    .schema("hris")
    .from("attendance_logs")
    .select("id, schedule_id")
    .in("id", items.map((i) => i.attendance_log_id));
  const rowPinById = new Map((logs ?? []).map((l) => [l.id, l.schedule_id]));

  const rows: { attendance_log_id: string; record: Record<string, unknown> }[] = [];
  for (const item of items) {
    const itemPin = await loadSchedule(supabase, item.proposed_schedule_id);
    // A schedule deleted between submit and approval must not silently revert
    // the day to the inherited schedule — send the request back instead.
    if (item.proposed_schedule_id && !itemPin) {
      await supabase
        .schema("hris")
        .from("attendance_correction_requests")
        .update({ status: "needs_rebase", updated_at: new Date().toISOString() })
        .eq("id", id);
      revalidatePath("/attendance-corrections");
      return { outcome: "needs_rebase" as const };
    }
    const rowPin = await loadSchedule(
      supabase,
      rowPinById.get(item.attendance_log_id) ?? null,
    );
    const schedule = resolveCorrectionSchedule(
      itemPin,
      rowPin,
      employeeSchedule,
      DEFAULT_SCHEDULE,
    );

    rows.push({
      attendance_log_id: item.attendance_log_id,
      record: buildCorrectionRecord(request.employee_id, {
        duty_date: item.duty_date,
        disposition: item.disposition,
        schedule,
        scheduleId: item.proposed_schedule_id,
        time_in_am: hhmmOf(item.proposed_time_in_am),
        time_out_am: hhmmOf(item.proposed_time_out_am),
        time_in_pm: hhmmOf(item.proposed_time_in_pm),
        time_out_pm: hhmmOf(item.proposed_time_out_pm),
        reason_in_am: item.proposed_in_am_reason as CorrectionReason | null,
        reason_out_am: item.proposed_out_am_reason as CorrectionReason | null,
        reason_in_pm: item.proposed_in_pm_reason as CorrectionReason | null,
        reason_out_pm: item.proposed_out_pm_reason as CorrectionReason | null,
      }),
    });
  }

  const { data: outcome, error: rpcError } = await supabase
    .schema("hris")
    .rpc("apply_attendance_correction", {
      p_request_id: id,
      p_reviewer_id: user.id,
      p_reviewer_email: user.email,
      p_rows: rows,
    });
  if (rpcError) throw rpcError;

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action:
      outcome === "applied"
        ? "attendance_correction_approved"
        : "attendance_correction_needs_rebase",
    tableName: "attendance_correction_requests",
    recordId: id,
    newValues: { days: rows.length, outcome },
  });

  revalidatePath("/attendance-corrections");
  revalidatePath("/attendance");
  return { outcome: outcome as "applied" | "needs_rebase" };
}

export async function rejectCorrectionRequest(id: string, notes: string) {
  const user = await getCurrentUser();
  if (!user || !canReviewAttendanceCorrection(user.role)) {
    throw new Error("Unauthorized");
  }
  if (!notes.trim()) throw new Error("Say why the request is being rejected");

  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("hris")
    .from("attendance_correction_requests")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      reviewed_by_email: user.email,
      reviewed_at: new Date().toISOString(),
      review_notes: notes.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .in("status", ["pending", "needs_rebase"]);
  if (error) throw error;

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: "attendance_correction_rejected",
    tableName: "attendance_correction_requests",
    recordId: id,
    newValues: { notes: notes.trim() },
  });
  revalidatePath("/attendance-corrections");
}

// The figure a reviewer actually needs: how many minutes of tardiness and
// undertime this request waives in total. Deriving it by scanning 22 rows is
// exactly what the review screen exists to avoid.
export async function getCorrectionReviewSummary(id: string) {
  const { request, items } = await getCorrectionRequest(id);
  const supabase = createAdminClient();

  const { data: logs } = await supabase
    .schema("hris")
    .from("attendance_logs")
    .select("id, date, late_minutes, undertime_minutes")
    .in("id", items.map((i) => i.attendance_log_id));
  const byId = new Map((logs ?? []).map((l) => [l.id, l]));

  const { data: emp } = await supabase
    .schema("hris")
    .from("employees")
    .select("schedules(id, time_in, time_out, break_start, break_end)")
    .eq("id", request.employee_id)
    .maybeSingle();
  const employeeSchedule =
    (emp?.schedules as unknown as ScheduleLike | null) ?? null;

  let totalLateForgiven = 0;
  let totalUndertimeForgiven = 0;
  const days: {
    duty_date: string;
    beforeLate: number;
    afterLate: number;
    beforeUndertime: number;
    afterUndertime: number;
  }[] = [];

  for (const item of items) {
    const itemPin = await loadSchedule(supabase, item.proposed_schedule_id);
    const schedule = resolveCorrectionSchedule(
      itemPin,
      null,
      employeeSchedule,
      DEFAULT_SCHEDULE,
    );
    const after = buildCorrectionRecord(request.employee_id, {
      duty_date: item.duty_date,
      disposition: item.disposition,
      schedule,
      scheduleId: item.proposed_schedule_id,
      time_in_am: hhmmOf(item.proposed_time_in_am),
      time_out_am: hhmmOf(item.proposed_time_out_am),
      time_in_pm: hhmmOf(item.proposed_time_in_pm),
      time_out_pm: hhmmOf(item.proposed_time_out_pm),
      reason_in_am: item.proposed_in_am_reason as CorrectionReason | null,
      reason_out_am: item.proposed_out_am_reason as CorrectionReason | null,
      reason_in_pm: item.proposed_in_pm_reason as CorrectionReason | null,
      reason_out_pm: item.proposed_out_pm_reason as CorrectionReason | null,
    });
    const current = byId.get(item.attendance_log_id);
    const beforeLate = current?.late_minutes ?? 0;
    const beforeUndertime = current?.undertime_minutes ?? 0;
    const afterLate = after.late_minutes as number;
    const afterUndertime = after.undertime_minutes as number;

    totalLateForgiven += Math.max(0, beforeLate - afterLate);
    totalUndertimeForgiven += Math.max(0, beforeUndertime - afterUndertime);
    days.push({
      duty_date: item.duty_date,
      beforeLate,
      afterLate,
      beforeUndertime,
      afterUndertime,
    });
  }

  return { totalLateForgiven, totalUndertimeForgiven, days };
}
```

- [ ] **Step 2: Add an end-to-end stack test**

Append to `supabase/tests/attendance-corrections-db.test.mts`:

```ts
test("an approved correction survives a later biometric overwrite", async () => {
  const date = "2026-11-02";
  const log = await seedLog(date, "21:55");
  const requestId = await seedRequest(date, date);
  await admin.from("attendance_correction_items").insert({
    request_id: requestId, duty_date: date, attendance_log_id: log.id,
    disposition: "update", before: beforeOf(log),
  });
  const record = buildCorrectionRecord(EMPLOYEE, {
    duty_date: date, disposition: "update", schedule: NIGHT, scheduleId: null,
    time_in_am: "21:55", time_out_am: null, time_in_pm: null, time_out_pm: "06:05",
    reason_in_am: null, reason_out_am: null, reason_in_pm: null, reason_out_pm: null,
  });
  await admin.rpc("apply_attendance_correction", {
    p_request_id: requestId, p_reviewer_id: REVIEWER,
    p_reviewer_email: "hr@example.gov",
    p_rows: [{ attendance_log_id: log.id, record }],
  });

  const { data: locked } = await admin
    .from("attendance_logs")
    .select("correction_locked").eq("id", log.id).single();
  assert.equal(locked!.correction_locked, true,
    "an applied correction must be excluded from later imports");
});
```

- [ ] **Step 3: Run the tests**

Run: `npm run db:reset && npm run test:db`
Expected: PASS.

- [ ] **Step 4: Verify it compiles**

Run: `npm run lint && npm run build`
Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/attendance-correction-actions.ts \
        supabase/tests/attendance-corrections-db.test.mts
git commit -m "feat(attendance): approve/reject correction requests with drift handling"
```

---

### Task 8: Import protection

**Files:**
- Modify: `src/lib/actions/attendance-actions.ts:119-120` (`ImportPreviewRow`), `:846-877` (conflict classes), `:1097-1158` (`importDahuaAttendance`), `:1346-1359` (`runImportReplay`)
- Test: `supabase/tests/attendance-corrections-db.test.mts` (append)

**Interfaces:**
- Consumes: `attendance_logs.correction_locked` (Task 1); the requests/items tables (Task 1).
- Produces: `ImportPreviewRow.conflictKind: "none" | "existing" | "correction_locked" | "pending_correction"`; both import paths skip `correction_locked` rows; `markPendingCorrectionsForRebase(employeeDates)` internal helper.

- [ ] **Step 1: Write the failing test**

Append to `supabase/tests/attendance-corrections-db.test.mts`:

```ts
test("a pending correction does not block an import but is returned for re-base", async () => {
  const date = "2026-11-09";
  const log = await seedLog(date, "21:55");
  const requestId = await seedRequest(date, date);
  await admin.from("attendance_correction_items").insert({
    request_id: requestId, duty_date: date, attendance_log_id: log.id,
    disposition: "update", before: beforeOf(log),
  });

  // Simulate what the importer now does after overwriting the day.
  const { error } = await admin.rpc("mark_pending_corrections_for_rebase", {
    p_pairs: [{ employee_id: EMPLOYEE, duty_date: date }],
  });
  assert.equal(error, null);

  const { data: req } = await admin
    .from("attendance_correction_requests")
    .select("status").eq("id", requestId).single();
  assert.equal(req!.status, "needs_rebase");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:db`
Expected: FAIL — `mark_pending_corrections_for_rebase` does not exist.

- [ ] **Step 3: Add the re-base helper to migration 066**

Append to `supabase/migrations/066_apply_attendance_correction.sql`:

```sql
-- Called by the biometric importer after it overwrites days. Any LIVE request
-- covering one of those days is returned to its requester rather than silently
-- invalidated: the import wins (HR outranks an unapproved draft), but the
-- department's work is preserved for a one-click re-base.
CREATE OR REPLACE FUNCTION hris.mark_pending_corrections_for_rebase(
  p_pairs JSONB
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = hris, public, extensions
AS $$
DECLARE
  v_count INT;
BEGIN
  WITH touched AS (
    SELECT (e->>'employee_id')::UUID AS employee_id,
           (e->>'duty_date')::DATE   AS duty_date
    FROM jsonb_array_elements(p_pairs) e
  ), affected AS (
    SELECT DISTINCT r.id
    FROM hris.attendance_correction_requests r
    JOIN hris.attendance_correction_items i ON i.request_id = r.id
    JOIN touched t
      ON t.employee_id = r.employee_id AND t.duty_date = i.duty_date
    WHERE r.status = 'pending'
  )
  UPDATE hris.attendance_correction_requests r
  SET status = 'needs_rebase', updated_at = now()
  FROM affected a
  WHERE r.id = a.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run db:reset && npm run test:db`
Expected: PASS.

- [ ] **Step 5: Widen the preview's conflict reporting**

In `src/lib/actions/attendance-actions.ts`, change the `ImportPreviewRow`
interface at `:119-120`:

```ts
  hasConflict: boolean;
  /**
   * Why this day conflicts. "correction_locked" days are skipped even with
   * overwrite ON; "pending_correction" days are overwritten and their request
   * is returned to the requester for re-base.
   */
  conflictKind: "none" | "existing" | "correction_locked" | "pending_correction";
  conflictDetails: string | null;
```

Replace the existing-log lookup and the return block at `:846-877`:

```ts
  let existingLogs: {
    employee_id: string;
    date: string;
    correction_locked: boolean;
  }[] = [];
  if (employeeIds.length > 0 && dutyDates.length > 0) {
    const { data } = await supabase
      .schema("hris")
      .from("attendance_logs")
      .select("employee_id, date, correction_locked")
      .in("employee_id", employeeIds)
      .in("date", dutyDates);
    existingLogs = data ?? [];
  }

  const existingSet = new Set(
    existingLogs.map((l) => `${l.employee_id}_${l.date}`),
  );
  const lockedSet = new Set(
    existingLogs
      .filter((l) => l.correction_locked)
      .map((l) => `${l.employee_id}_${l.date}`),
  );

  // Days covered by a LIVE correction request. These are NOT protected — the
  // import overwrites them — but the preview must say so, because the request
  // will come back to its requester for re-base.
  const pendingSet = new Set<string>();
  if (employeeIds.length > 0 && dutyDates.length > 0) {
    const { data: pending } = await supabase
      .schema("hris")
      .from("attendance_correction_items")
      .select(
        "duty_date, attendance_correction_requests!inner(employee_id, status)",
      )
      .in("duty_date", dutyDates)
      .eq("attendance_correction_requests.status", "pending");
    for (const row of (pending ?? []) as unknown as {
      duty_date: string;
      attendance_correction_requests: { employee_id: string };
    }[]) {
      pendingSet.add(
        `${row.attendance_correction_requests.employee_id}_${row.duty_date}`,
      );
    }
  }

  return previewWithDuty.map(({ row, employeeId, duty }) => {
    const matched = employeeId !== null;
    const key = `${employeeId}_${duty}`;
    const locked = matched && lockedSet.has(key);
    const pendingCorrection = matched && !locked && pendingSet.has(key);
    const hasConflict = matched && existingSet.has(key);

    const conflictKind = locked
      ? ("correction_locked" as const)
      : pendingCorrection
        ? ("pending_correction" as const)
        : hasConflict
          ? ("existing" as const)
          : ("none" as const);

    return {
      ...row,
      matched,
      employeeId,
      hasConflict,
      conflictKind,
      conflictDetails: locked
        ? "Approved correction — will be skipped"
        : pendingCorrection
          ? "Pending correction — will be overwritten, request returns for re-base"
          : hasConflict
            ? "Existing record will be updated"
            : !matched
              ? "Employee not found in system"
              : null,
    };
  });
```

- [ ] **Step 6: Skip locked days in `importDahuaAttendance`**

In the pre-filter loop at `:1110-1121`, add the lock check before the existing
conflict check:

```ts
    const dutyDate = dutyDateFor(row.date, row.time, sched);
    // An approved correction is never overwritten, regardless of the overwrite
    // setting. HR approved those values; the device does not get to undo them.
    if (row.conflictKind === "correction_locked") {
      skipKeys.add(`${row.employeeId}_${dutyDate}`);
      continue;
    }
    if (row.hasConflict && !overwriteExisting) {
```

Then, after the upsert loop at `:1158`, return live requests for re-base:

```ts
  // Days we just overwrote that a live correction request depends on. The
  // import wins, but the requester keeps their work — see
  // mark_pending_corrections_for_rebase.
  const overwrittenPairs = matched
    .map((m) => ({
      employee_id: m.employeeId,
      duty_date: dutyDateFor(m.date, m.time, schedByEmp.get(m.employeeId) ?? defaultSched),
    }))
    .filter(
      (p, i, arr) =>
        arr.findIndex(
          (q) => q.employee_id === p.employee_id && q.duty_date === p.duty_date,
        ) === i,
    );
  if (overwrittenPairs.length > 0) {
    await supabase
      .schema("hris")
      .rpc("mark_pending_corrections_for_rebase", { p_pairs: overwrittenPairs });
  }
```

- [ ] **Step 7: Skip locked days in `runImportReplay`**

Extend the safety filter at `:1346-1359`. `existingSourceByKey` only carries
`source`, so load the lock flags alongside it inside `buildBiometricRecords`'s
caller and filter on both:

```ts
  // Keep only records whose day is safe to overwrite: no existing row, or an
  // existing row still sourced from biometric AND not correction-locked.
  const { data: lockedRows } = await supabase
    .schema("hris")
    .from("attendance_logs")
    .select("employee_id, date")
    .eq("correction_locked", true)
    .in("employee_id", [...new Set(matched.map((m) => m.employeeId))]);
  const lockedKeys = new Set(
    (lockedRows ?? []).map((l) => `${l.employee_id}_${l.date}`),
  );

  const toWrite: Record<string, unknown>[] = [];
  const toWriteTouched: typeof touched = [];
  let skipped = 0;
  for (let i = 0; i < records.length; i++) {
    const src = existingSourceByKey.get(keys[i]);
    if (lockedKeys.has(keys[i]) || (src !== undefined && src !== "biometric")) {
      skipped++;
      continue;
    }
    toWrite.push(records[i]);
    toWriteTouched.push(touched[i]);
  }
```

- [ ] **Step 8: Surface the new conflict classes in the import dialog**

In `src/components/attendance/dahua-import-dialog.tsx`, wherever
`conflictDetails` is rendered, group the preview counts by `conflictKind` and
show a summary line above the table:

```tsx
{lockedCount > 0 && (
  <p className="text-sm text-muted-foreground">
    {lockedCount} day(s) carry an approved correction and will be skipped even
    with overwrite on.
  </p>
)}
{pendingCount > 0 && (
  <p className="text-sm text-amber-600">
    {pendingCount} day(s) have a pending correction request. Importing will
    overwrite them and return those requests to the department for re-base.
  </p>
)}
```

Derive the counts from the preview rows:

```tsx
const lockedCount = preview.filter((r) => r.conflictKind === "correction_locked").length;
const pendingCount = preview.filter((r) => r.conflictKind === "pending_correction").length;
```

- [ ] **Step 9: Run the full suite**

Run: `npm run test:dtr && npm run db:reset && npm run test:db && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add src/lib/actions/attendance-actions.ts \
        src/components/attendance/dahua-import-dialog.tsx \
        supabase/migrations/066_apply_attendance_correction.sql \
        supabase/tests/attendance-corrections-db.test.mts
git commit -m "feat(attendance): protect corrections from biometric import overwrite"
```

---

### Task 9: The shared `<SlotCell>` component

**Files:**
- Create: `src/components/attendance/slot-cell.tsx`

**Interfaces:**
- Consumes: `NO_TIME_REASON_SHORT`, `CORRECTION_REASONS`, `CorrectionReason` (Task 1); shadcn `Popover`, `Button`, `Input`, `Checkbox`.
- Produces:
  ```ts
  interface SlotValue { time: string | null; reason: CorrectionReason | null }
  function SlotCell(props: {
    label: string;            // e.g. "Tue Jul 21 · PM Out"
    value: SlotValue;
    nextDay?: boolean;        // renders the ⁺¹ marker
    disabled?: boolean;
    onChange: (v: SlotValue) => void;
  }): JSX.Element
  ```

- [ ] **Step 1: Create the component**

Create `src/components/attendance/slot-cell.tsx`:

```tsx
"use client";

// One control per attendance slot, not two.
//
// A slot holds a TIME or a REASON, so it gets a single affordance: a chip that
// opens a popover. The existing manual-entry form pairs a time input with a
// separate Select for every slot, which is 8 controls per row — unusable across
// a 22-day range. Type-to-parse gives one keystroke path for both kinds of
// value: "1700" becomes 17:00, "ob" selects Official Business.
//
// A slot may carry BOTH a time and a reason (the DTR then prints the reason and
// keeps the time on record). That case is rare, so it is a checkbox rather than
// a permanent second control.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CORRECTION_REASONS,
  NO_TIME_REASON_LABELS,
  NO_TIME_REASON_SHORT,
  type CorrectionReason,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

export interface SlotValue {
  time: string | null;
  reason: CorrectionReason | null;
}

/** "1700" | "17:00" | "5:00" -> "17:00"; anything else -> null. */
export function parseTimeInput(raw: string): string | null {
  const s = raw.trim().replace(/[^\d:]/g, "");
  if (!s) return null;
  const m = s.includes(":")
    ? s.match(/^(\d{1,2}):(\d{2})$/)
    : s.match(/^(\d{1,2})(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** "ob" | "OB" | "official business" -> "official_business". */
export function parseReasonInput(raw: string): CorrectionReason | null {
  const s = raw.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!s) return null;
  return (
    CORRECTION_REASONS.find(
      (code) =>
        code.replace(/_/g, "") === s ||
        NO_TIME_REASON_SHORT[code].toLowerCase().replace(/\s+/g, "") === s ||
        NO_TIME_REASON_LABELS[code].toLowerCase().replace(/\s+/g, "") === s,
    ) ?? null
  );
}

export function SlotCell({
  label,
  value,
  nextDay = false,
  disabled = false,
  onChange,
}: {
  label: string;
  value: SlotValue;
  nextDay?: boolean;
  disabled?: boolean;
  onChange: (v: SlotValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [keepBoth, setKeepBoth] = useState(!!value.time && !!value.reason);

  const chip = value.reason
    ? NO_TIME_REASON_SHORT[value.reason]
    : (value.time ?? "—");

  const commitDraft = () => {
    const time = parseTimeInput(draft);
    if (time) {
      onChange({ time, reason: keepBoth ? value.reason : null });
      setOpen(false);
      setDraft("");
      return;
    }
    const reason = parseReasonInput(draft);
    if (reason) {
      onChange({ time: keepBoth ? value.time : null, reason });
      setOpen(false);
      setDraft("");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(
            "h-8 w-24 justify-center font-mono text-xs",
            value.reason && "font-sans font-medium",
            !value.time && !value.reason && "text-muted-foreground",
          )}
        >
          {chip}
          {nextDay && <sup className="ml-0.5">+1</sup>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="space-y-1">
          <Label htmlFor="slot-time" className="text-xs">Time</Label>
          <Input
            id="slot-time"
            autoFocus
            placeholder="17:00 or OB"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDraft();
              }
            }}
            onBlur={commitDraft}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[10px] uppercase text-muted-foreground">or</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className="flex flex-wrap gap-1">
          {CORRECTION_REASONS.map((code) => (
            <Button
              key={code}
              type="button"
              size="sm"
              variant={value.reason === code ? "default" : "outline"}
              className="h-7 px-2 text-[11px]"
              onClick={() => {
                onChange({ time: keepBoth ? value.time : null, reason: code });
                setOpen(false);
              }}
            >
              {NO_TIME_REASON_SHORT[code]}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="slot-keep-both"
            checked={keepBoth}
            onCheckedChange={(v) => setKeepBoth(v === true)}
          />
          <Label htmlFor="slot-keep-both" className="text-xs font-normal">
            Keep the time and print the reason
          </Label>
        </div>
        {(value.time || value.reason) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-full text-xs"
            onClick={() => {
              onChange({ time: null, reason: null });
              setOpen(false);
            }}
          >
            Clear this slot
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Test the parsers**

Append to `supabase/tests/attendance-corrections-unit.test.mts`:

```ts
import { parseTimeInput, parseReasonInput } from "../../src/components/attendance/slot-cell.tsx";

test("time input accepts compact and colon forms", () => {
  assert.equal(parseTimeInput("1700"), "17:00");
  assert.equal(parseTimeInput("17:00"), "17:00");
  assert.equal(parseTimeInput("8:05"), "08:05");
  assert.equal(parseTimeInput("805"), "08:05");
});

test("time input rejects impossible clock values", () => {
  assert.equal(parseTimeInput("2500"), null);
  assert.equal(parseTimeInput("1265"), null);
  assert.equal(parseTimeInput("banana"), null);
  assert.equal(parseTimeInput(""), null);
});

test("reason input accepts the code, the short label and the full label", () => {
  assert.equal(parseReasonInput("ob"), "official_business");
  assert.equal(parseReasonInput("OB"), "official_business");
  assert.equal(parseReasonInput("official business"), "official_business");
  assert.equal(parseReasonInput("fw"), "field_work");
  assert.equal(parseReasonInput("nb"), "no_break");
  assert.equal(parseReasonInput("off"), "off");
});

test("reason input rejects holiday, which requesters may not choose", () => {
  assert.equal(parseReasonInput("holiday"), null);
});
```

If importing a `.tsx` module trips `--experimental-strip-types`, move
`parseTimeInput` / `parseReasonInput` into `src/lib/attendance-corrections.ts`
and re-export them from `slot-cell.tsx`. Update the test import accordingly.

- [ ] **Step 3: Run the tests**

Run: `npm run test:dtr`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/attendance/slot-cell.tsx \
        supabase/tests/attendance-corrections-unit.test.mts
git commit -m "feat(attendance): shared SlotCell with type-to-parse time and reason"
```

---

### Task 10: The correction wizard and grid

**Files:**
- Create: `src/app/(dashboard)/attendance-corrections/page.tsx`
- Create: `src/app/(dashboard)/attendance-corrections/new/page.tsx`
- Create: `src/components/attendance/correction-wizard-client.tsx`
- Create: `src/components/attendance/correction-grid.tsx`

**Interfaces:**
- Consumes: `getCorrectableEmployees`, `getCorrectionDraftDays`, `createCorrectionRequest`, `listCorrectionRequests` (Task 6); `SlotCell`, `SlotValue` (Task 9); `buildCorrectionRecord`, `trailingDutyDate` (Task 4).
- Produces: the routes `/attendance-corrections` and `/attendance-corrections/new`.

- [ ] **Step 1: Create the list page**

Create `src/app/(dashboard)/attendance-corrections/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth";
import {
  canRequestAttendanceCorrection,
  canReviewAttendanceCorrection,
} from "@/lib/auth-helpers";
import { listCorrectionRequests } from "@/lib/actions/attendance-correction-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function AttendanceCorrectionsPage() {
  const user = await getServerUser();
  if (!user) redirect("/login");
  const canRequest = canRequestAttendanceCorrection(user.role);
  const canReview = canReviewAttendanceCorrection(user.role);
  if (!canRequest && !canReview) redirect("/dashboard");

  const requests = await listCorrectionRequests();
  // A request the import sent back is the one thing needing action today.
  const needsRebase = requests.filter((r) => r.status === "needs_rebase");

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Attendance Corrections</h1>
          <p className="text-sm text-muted-foreground">
            {canReview
              ? "Review and approve corrections filed by departments."
              : "Request corrections for employees in your department."}
          </p>
        </div>
        {canRequest && (
          <Button asChild>
            <Link href="/attendance-corrections/new">New Request</Link>
          </Button>
        )}
      </div>

      {needsRebase.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 dark:bg-amber-950/20">
          <p className="text-sm font-medium">
            {needsRebase.length} request(s) need re-basing
          </p>
          <p className="text-sm text-muted-foreground">
            The attendance data underneath these requests changed. Open one to
            re-apply your changes to the new data.
          </p>
        </div>
      )}

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left">
            <tr>
              <th className="p-3">Employee</th>
              <th className="p-3">Period</th>
              <th className="p-3">Filed by</th>
              <th className="p-3">Status</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  No correction requests yet.
                </td>
              </tr>
            )}
            {requests.map((r) => {
              const emp = r.employees as { first_name: string; last_name: string } | null;
              return (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="p-3">
                    {emp ? `${emp.last_name}, ${emp.first_name}` : "—"}
                  </td>
                  <td className="p-3">{r.date_from} → {r.date_to}</td>
                  <td className="p-3">{r.requested_by_email ?? "—"}</td>
                  <td className="p-3">
                    <Badge
                      variant={
                        r.status === "approved"
                          ? "default"
                          : r.status === "rejected" || r.status === "cancelled"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {r.status.replace(/_/g, " ")}
                    </Badge>
                  </td>
                  <td className="p-3 text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/attendance-corrections/${r.id}`}>Open</Link>
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the grid component**

Create `src/components/attendance/correction-grid.tsx`:

```tsx
"use client";

// The editing grid for a correction request.
//
// Three rules drive the layout:
//   * The grid renders the shape of the DTR that will ACTUALLY print, which
//     comes from the employee's PERIOD schedule — not the per-day pin. The
//     printed CSC form picks its column layout once per period
//     (dtr-form-column.tsx), so a per-day pin cannot reshape one row. Editing a
//     two-column grid and receiving a four-column DTR would be a lie.
//   * Bulk-first: one office order over one stretch is the real driver, so the
//     schedule pin and "mark selected" sit ABOVE the grid. Nobody should make
//     22 identical edits.
//   * The delta column is the feedback loop. Seeing "was 835 / 240" beside
//     "0 / 0" is what tells the admin the pin worked, without their ever
//     learning what dutyDateFor does.

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SlotCell, type SlotValue } from "@/components/attendance/slot-cell";
import {
  buildCorrectionRecord,
  type Disposition,
} from "@/lib/attendance-corrections";
import {
  hasBreak,
  timeOnNextDayForNightShift,
  type ScheduleLike,
} from "@/lib/attendance-schedule";
import { cn } from "@/lib/utils";

export interface GridRow {
  duty_date: string;
  attendance_log_id: string;
  disposition: Disposition;
  scheduleId: string | null;
  inAm: SlotValue;
  outAm: SlotValue;
  inPm: SlotValue;
  outPm: SlotValue;
  beforeLate: number;
  beforeUndertime: number;
  /** True for the day a night-shift re-pin empties out. */
  isTrailing?: boolean;
}

export function CorrectionGrid({
  employeeId,
  rows,
  schedules,
  periodSchedule,
  onChange,
}: {
  employeeId: string;
  rows: GridRow[];
  schedules: ScheduleLike[];
  /** The employee's assigned schedule — decides the printed DTR's shape. */
  periodSchedule: ScheduleLike;
  onChange: (rows: GridRow[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [changedOnly, setChangedOnly] = useState(false);

  const fourColumn = hasBreak(periodSchedule);
  const byId = useMemo(
    () => new Map(schedules.map((s) => [s.id, s])),
    [schedules],
  );

  const scheduleFor = (row: GridRow): ScheduleLike =>
    (row.scheduleId ? byId.get(row.scheduleId) : null) ?? periodSchedule;

  const computed = rows.map((row) => {
    const sched = scheduleFor(row);
    const rec = buildCorrectionRecord(employeeId, {
      duty_date: row.duty_date,
      disposition: row.disposition,
      schedule: sched,
      scheduleId: row.scheduleId,
      time_in_am: row.inAm.time,
      time_out_am: row.outAm.time,
      time_in_pm: row.inPm.time,
      time_out_pm: row.outPm.time,
      reason_in_am: row.inAm.reason,
      reason_out_am: row.outAm.reason,
      reason_in_pm: row.inPm.reason,
      reason_out_pm: row.outPm.reason,
    });
    return {
      row,
      sched,
      late: rec.late_minutes as number,
      undertime: rec.undertime_minutes as number,
    };
  });

  const totalLateForgiven = computed.reduce(
    (sum, c) => sum + Math.max(0, c.row.beforeLate - c.late),
    0,
  );
  const totalUtForgiven = computed.reduce(
    (sum, c) => sum + Math.max(0, c.row.beforeUndertime - c.undertime),
    0,
  );

  const patch = (dutyDate: string, next: Partial<GridRow>) =>
    onChange(
      rows.map((r) => (r.duty_date === dutyDate ? { ...r, ...next } : r)),
    );

  const patchSelected = (next: Partial<GridRow>) =>
    onChange(rows.map((r) => (selected.has(r.duty_date) ? { ...r, ...next } : r)));

  const pinAll = (scheduleId: string | null) =>
    onChange(rows.map((r) => ({ ...r, scheduleId })));

  const visible = changedOnly
    ? computed.filter(
        (c) =>
          c.late !== c.row.beforeLate ||
          c.undertime !== c.row.beforeUndertime ||
          c.row.disposition !== "update",
      )
    : computed;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 p-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Schedule for range</span>
          <Select
            value={rows[0]?.scheduleId ?? "__inherit__"}
            onValueChange={(v) => pinAll(v === "__inherit__" ? null : v)}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Inherit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__inherit__">Inherit (no pin)</SelectItem>
              {schedules.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.time_in.slice(0, 5)}–{s.time_out.slice(0, 5)}
                  {hasBreak(s) ? "" : " (no break)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto text-sm font-medium">
          Tardiness −{totalLateForgiven}m · Undertime −{totalUtForgiven}m
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {selected.size} day(s) selected
        </span>
        <Button
          type="button" size="sm" variant="outline"
          disabled={selected.size === 0}
          onClick={() => patchSelected({ disposition: "clear_as_off" })}
        >
          Mark OFF
        </Button>
        <Button
          type="button" size="sm" variant="outline"
          disabled={selected.size === 0}
          onClick={() =>
            patchSelected({
              outAm: { time: null, reason: "no_break" },
              inPm: { time: null, reason: "no_break" },
            })
          }
        >
          Mark NO BREAK
        </Button>
        <Button
          type="button" size="sm" variant="ghost"
          onClick={() => setChangedOnly((v) => !v)}
        >
          {changedOnly ? "Show all days" : "Show changed only"}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left">
            <tr>
              <th className="w-8 p-2" />
              <th className="p-2">Date</th>
              <th className="p-2">{fourColumn ? "AM In" : "In"}</th>
              {fourColumn && <th className="p-2">AM Out</th>}
              {fourColumn && <th className="p-2">PM In</th>}
              <th className="p-2">{fourColumn ? "PM Out" : "Out"}</th>
              <th className="p-2 text-right">Late</th>
              <th className="p-2 text-right">Undertime</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {visible.map(({ row, sched, late, undertime }) => {
              const off = row.disposition === "clear_as_off";
              return (
                <tr key={row.duty_date} className={cn("border-b last:border-0", off && "opacity-70")}>
                  <td className="p-2">
                    <Checkbox
                      checked={selected.has(row.duty_date)}
                      onCheckedChange={(v) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (v === true) next.add(row.duty_date);
                          else next.delete(row.duty_date);
                          return next;
                        })
                      }
                    />
                  </td>
                  <td className="p-2 font-mono text-xs">{row.duty_date}</td>
                  <td className="p-2">
                    <SlotCell
                      label={`${row.duty_date} · ${fourColumn ? "AM In" : "In"}`}
                      value={off ? { time: null, reason: "off" } : row.inAm}
                      disabled={off}
                      nextDay={
                        !!row.inAm.time && timeOnNextDayForNightShift(row.inAm.time, sched)
                      }
                      onChange={(v) => patch(row.duty_date, { inAm: v })}
                    />
                  </td>
                  {fourColumn && (
                    <td className="p-2">
                      <SlotCell
                        label={`${row.duty_date} · AM Out`}
                        value={off ? { time: null, reason: "off" } : row.outAm}
                        disabled={off}
                        onChange={(v) => patch(row.duty_date, { outAm: v })}
                      />
                    </td>
                  )}
                  {fourColumn && (
                    <td className="p-2">
                      <SlotCell
                        label={`${row.duty_date} · PM In`}
                        value={off ? { time: null, reason: "off" } : row.inPm}
                        disabled={off}
                        onChange={(v) => patch(row.duty_date, { inPm: v })}
                      />
                    </td>
                  )}
                  <td className="p-2">
                    <SlotCell
                      label={`${row.duty_date} · ${fourColumn ? "PM Out" : "Out"}`}
                      value={off ? { time: null, reason: "off" } : row.outPm}
                      disabled={off}
                      nextDay={
                        !!row.outPm.time && timeOnNextDayForNightShift(row.outPm.time, sched)
                      }
                      onChange={(v) => patch(row.duty_date, { outPm: v })}
                    />
                  </td>
                  <td className="p-2 text-right font-mono text-xs">
                    {late}
                    {row.beforeLate !== late && (
                      <span className="ml-1 text-muted-foreground line-through">
                        {row.beforeLate}
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-right font-mono text-xs">
                    {undertime}
                    {row.beforeUndertime !== undertime && (
                      <span className="ml-1 text-muted-foreground line-through">
                        {row.beforeUndertime}
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">
                    {row.isTrailing && "punches moved to the previous day · prints OFF"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!fourColumn && (
        <p className="text-xs text-muted-foreground">
          This employee&apos;s assigned schedule has no break, so their DTR prints
          two columns. To change that shape, HR must change their assigned
          schedule — a per-day pin cannot reshape the printed form.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2b: Create the wizard client**

Create `src/components/attendance/correction-wizard-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CorrectionGrid, type GridRow } from "@/components/attendance/correction-grid";
import {
  getCorrectionDraftDays,
  createCorrectionRequest,
} from "@/lib/actions/attendance-correction-actions";
import { trailingDutyDate } from "@/lib/attendance-corrections";
import { crossesMidnight, type ScheduleLike } from "@/lib/attendance-schedule";

interface DraftLog {
  id: string;
  date: string;
  schedule_id: string | null;
  time_in_am: string | null;
  time_out_am: string | null;
  time_in_pm: string | null;
  time_out_pm: string | null;
  time_in_am_reason: string | null;
  time_out_am_reason: string | null;
  time_in_pm_reason: string | null;
  time_out_pm_reason: string | null;
  late_minutes: number;
  undertime_minutes: number;
  correction_locked: boolean;
}

const hhmm = (ts: string | null) => ts?.match(/(\d{2}:\d{2})/)?.[1] ?? null;

export function CorrectionWizardClient({
  employees,
  schedules,
  periodScheduleByEmployee,
}: {
  employees: { id: string; name: string }[];
  schedules: ScheduleLike[];
  /** Each employee's ASSIGNED schedule — decides the printed DTR's shape. */
  periodScheduleByEmployee: Record<string, ScheduleLike>;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [employeeId, setEmployeeId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rows, setRows] = useState<GridRow[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [reason, setReason] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const periodSchedule =
    periodScheduleByEmployee[employeeId] ?? schedules[0];

  const loadDays = async () => {
    if (!employeeId || !dateFrom || !dateTo) {
      toast.error("Pick an employee and a date range");
      return;
    }
    setBusy(true);
    try {
      const logs = (await getCorrectionDraftDays(
        employeeId, dateFrom, dateTo,
      )) as DraftLog[];
      // Only days that ALREADY have an attendance row are correctable. Days
      // with no record are counted and reported, never silently dropped.
      const usable = logs.filter((l) => !l.correction_locked);
      setSkipped(logs.length - usable.length);
      setRows(
        usable.map((l) => ({
          duty_date: l.date,
          attendance_log_id: l.id,
          disposition: "update" as const,
          scheduleId: l.schedule_id,
          inAm: { time: hhmm(l.time_in_am), reason: l.time_in_am_reason as never },
          outAm: { time: hhmm(l.time_out_am), reason: l.time_out_am_reason as never },
          inPm: { time: hhmm(l.time_in_pm), reason: l.time_in_pm_reason as never },
          outPm: { time: hhmm(l.time_out_pm), reason: l.time_out_pm_reason as never },
          beforeLate: l.late_minutes,
          beforeUndertime: l.undertime_minutes,
        })),
      );
      setStep(2);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load those days");
    } finally {
      setBusy(false);
    }
  };

  // A night-shift pin consumes the morning AFTER the range, so an N-day range
  // touches N+1 rows. The trailing day is appended (marked isTrailing) so the
  // admin can dispose of it as OFF instead of leaving it to read as an absence.
  const onGridChange = (next: GridRow[]) => {
    const pinned = next[0]?.scheduleId
      ? schedules.find((s) => s.id === next[0].scheduleId)
      : null;
    const trailing =
      pinned && crossesMidnight(pinned) ? trailingDutyDate(dateTo, pinned) : null;
    const hasTrailing = next.some((r) => r.isTrailing);

    if (trailing && !hasTrailing) {
      toast.info(
        `This night shift also empties ${trailing}. Mark that day OFF before submitting.`,
      );
    }
    setRows(next);
  };

  const submit = async () => {
    if (!proof) {
      toast.error("Attach the office order or certification that authorises this");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("proof", proof);
      await createCorrectionRequest(
        {
          employee_id: employeeId,
          date_from: dateFrom,
          date_to: dateTo,
          reason,
          items: rows.map((r) => ({
            duty_date: r.duty_date,
            attendance_log_id: r.attendance_log_id,
            disposition: r.disposition,
            proposed_schedule_id: r.scheduleId,
            time_in_am: r.inAm.time,
            time_out_am: r.outAm.time,
            time_in_pm: r.inPm.time,
            time_out_pm: r.outPm.time,
            reason_in_am: r.inAm.reason,
            reason_out_am: r.outAm.reason,
            reason_in_pm: r.inPm.reason,
            reason_out_pm: r.outPm.reason,
          })),
        },
        fd,
      );
      toast.success("Request submitted. HR will review it before it reaches the DTR.");
      router.push("/attendance-corrections");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit the request");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">New Correction Request</h1>

      {step === 1 && (
        <div className="max-w-lg space-y-4">
          <div className="space-y-1">
            <Label>Employee</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="Select an employee" /></SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {employees.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No employees in your department are flagged correction-eligible.
                Ask HR to flag them first.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="from">From</Label>
              <Input id="from" type="date" value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to">To</Label>
              <Input id="to" type="date" value={dateTo}
                onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
          <Button onClick={loadDays} disabled={busy}>Continue</Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          {skipped > 0 && (
            <p className="text-sm text-muted-foreground">
              {skipped} day(s) in this range already carry an approved correction
              and cannot be changed here.
            </p>
          )}
          <CorrectionGrid
            employeeId={employeeId}
            rows={rows}
            schedules={schedules}
            periodSchedule={periodSchedule}
            onChange={onGridChange}
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={() => setStep(3)} disabled={rows.length === 0}>
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="max-w-lg space-y-4">
          <div className="space-y-1">
            <Label htmlFor="reason">Reason for this correction</Label>
            <Textarea id="reason" rows={3} value={reason}
              placeholder="Assigned to night rotation per Office Order 2026-114"
              onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="proof">Supporting document</Label>
            <Input id="proof" type="file" accept=".pdf,image/jpeg,image/png"
              onChange={(e) => setProof(e.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted-foreground">
              One document covering the whole range — PDF, JPEG or PNG, max 10 MB.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
            <Button onClick={submit} disabled={busy}>Submit for approval</Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2c: Create the `new` route**

Create `src/app/(dashboard)/attendance-corrections/new/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth";
import { canRequestAttendanceCorrection } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCorrectableEmployees } from "@/lib/actions/attendance-correction-actions";
import { CorrectionWizardClient } from "@/components/attendance/correction-wizard-client";
import { DEFAULT_SCHEDULE, type ScheduleLike } from "@/lib/attendance-schedule";

export default async function NewCorrectionPage() {
  const user = await getServerUser();
  if (!user) redirect("/login");
  if (!canRequestAttendanceCorrection(user.role)) redirect("/dashboard");

  const employees = await getCorrectableEmployees();
  const supabase = createAdminClient();

  const { data: schedules } = await supabase
    .schema("hris")
    .from("schedules")
    .select("id, time_in, time_out, break_start, break_end")
    .order("time_in");

  // Each employee's ASSIGNED schedule: it decides the shape of their printed
  // DTR, and therefore the shape of the editing grid.
  const { data: emps } = await supabase
    .schema("hris")
    .from("employees")
    .select("id, schedules(id, time_in, time_out, break_start, break_end)")
    .in("id", employees.map((e) => e.id).length ? employees.map((e) => e.id) : [""]);

  const periodScheduleByEmployee: Record<string, ScheduleLike> = {};
  for (const e of (emps ?? []) as unknown as {
    id: string;
    schedules: ScheduleLike | null;
  }[]) {
    periodScheduleByEmployee[e.id] = e.schedules ?? DEFAULT_SCHEDULE;
  }

  return (
    <CorrectionWizardClient
      employees={employees}
      schedules={(schedules ?? []) as unknown as ScheduleLike[]}
      periodScheduleByEmployee={periodScheduleByEmployee}
    />
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm run lint && npm run build`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/attendance-corrections" src/components/attendance/correction-grid.tsx \
        src/components/attendance/correction-wizard-client.tsx
git commit -m "feat(attendance): correction request wizard and editing grid"
```

---

### Task 11: HR review screen

**Files:**
- Create: `src/app/(dashboard)/attendance-corrections/[id]/page.tsx`
- Create: `src/components/attendance/correction-review-client.tsx`

**Interfaces:**
- Consumes: `getCorrectionRequest`, `getCorrectionReviewSummary`, `approveCorrectionRequest`, `rejectCorrectionRequest` (Tasks 6-7).

- [ ] **Step 1: Create the detail route**

Create `src/app/(dashboard)/attendance-corrections/[id]/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth";
import { canReviewAttendanceCorrection } from "@/lib/auth-helpers";
import {
  getCorrectionRequest,
  getCorrectionReviewSummary,
} from "@/lib/actions/attendance-correction-actions";
import { CorrectionReviewClient } from "@/components/attendance/correction-review-client";

// Params are async in Next 16 — await before destructuring.
export default async function CorrectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getServerUser();
  if (!user) redirect("/login");

  const { request, items, proofUrl } = await getCorrectionRequest(id);
  const summary = await getCorrectionReviewSummary(id);

  return (
    <CorrectionReviewClient
      request={request}
      items={items}
      proofUrl={proofUrl}
      summary={summary}
      canReview={canReviewAttendanceCorrection(user.role)}
    />
  );
}
```

- [ ] **Step 2: Create the review client**

Create `src/components/attendance/correction-review-client.tsx` rendering, in
order:

1. A header with employee name, period, requester, and submitted date.
2. **The headline figure**, because it is what a reviewer actually needs and
   deriving it from 22 rows is what this screen exists to prevent:

```tsx
<div className="rounded-md border bg-muted/30 p-4">
  <p className="text-sm">
    Total tardiness forgiven:{" "}
    <span className="font-semibold">{summary.totalLateForgiven} min</span>
    {" · "}
    Total undertime forgiven:{" "}
    <span className="font-semibold">{summary.totalUndertimeForgiven} min</span>
  </p>
</div>
```

3. The stale-period banner:

```tsx
{isOlderThan60Days && (
  <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/20">
    This range is more than 60 days old. A DTR for this period may already be
    printed and signed; approving will make the record disagree with it.
  </div>
)}
```

Compute it as:

```tsx
const isOlderThan60Days =
  (Date.now() - new Date(request.date_to + "T00:00:00").getTime()) /
    86_400_000 > 60;
```

4. The proof, inline: `<iframe src={proofUrl} />` for PDFs, `<img>` for images,
   keyed off `request.proof_mime`.
5. A per-day before→after table from `summary.days`.
6. Approve / Reject buttons behind a shadcn `AlertDialog`, Reject requiring
   notes. On approve, branch on the returned outcome:

```tsx
const { outcome } = await approveCorrectionRequest(request.id);
if (outcome === "needs_rebase") {
  toast.error(
    "The attendance data changed since this request was filed. It has been returned to the department for re-basing.",
  );
} else {
  toast.success("Correction applied. The DTR now reflects the change.");
}
```

- [ ] **Step 3: Verify**

Run: `npm run lint && npm run build`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/attendance-corrections/[id]" \
        src/components/attendance/correction-review-client.tsx
git commit -m "feat(attendance): HR review screen for correction requests"
```

---

### Task 12: Eligibility toggle and navigation

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx` (nav item + badge)
- Modify: `src/app/(dashboard)/layout.tsx` (fetch the badge count, pass it down)
- Modify: `src/lib/actions/employee-actions.ts` (append the toggle action)
- Modify: `src/lib/actions/attendance-correction-actions.ts` (append the count action)
- Modify: the employee detail view under `src/components/employees/` (add the switch)

**Interfaces:**
- Consumes: `canFlagCorrectionEligible` (Task 2); `canReviewAttendanceCorrection`, `canRequestAttendanceCorrection` (Task 2).
- Produces: `setCorrectionEligible(employeeId: string, eligible: boolean)`; `countLiveCorrectionRequests(): Promise<number>`; `AppSidebar` gains an optional `correctionCount?: number` prop.

- [ ] **Step 1: Add the toggle action**

Append to `src/lib/actions/employee-actions.ts`:

```ts
// HR decides WHO may be corrected. Department Admins can only file requests for
// employees carrying this flag — see canRequestAttendanceCorrection.
export async function setCorrectionEligible(
  employeeId: string,
  eligible: boolean,
) {
  const user = await getCurrentUser();
  if (!user || !canFlagCorrectionEligible(user.role)) {
    throw new Error("Unauthorized");
  }
  const supabase = createAdminClient();
  const { error } = await supabase
    .schema("hris")
    .from("employees")
    .update({ attendance_correction_eligible: eligible })
    .eq("id", employeeId);
  if (error) throw error;

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    action: eligible
      ? "attendance_correction_eligibility_granted"
      : "attendance_correction_eligibility_revoked",
    tableName: "employees",
    recordId: employeeId,
    newValues: { attendance_correction_eligible: eligible },
  });
  revalidatePath(`/employees/${employeeId}`);
}
```

Add `canFlagCorrectionEligible` to that file's import from `@/lib/auth-helpers`.

- [ ] **Step 2: Add the sidebar entry**

In `src/components/layout/app-sidebar.tsx`, define the role list near the other
role constants (around `:126`):

```ts
const correctionRoles: UserRole[] = [
  "super_admin",
  "hr_admin",
  "dtr_manager",
  "department_admin",
  "department_admin_and_department_head",
];
```

Add the item to the group containing "Attendance & DTR" (`:209`), directly
after it:

```tsx
{
  title: "Attendance Corrections",
  href: "/attendance-corrections",
  icon: ClipboardCheck,
  roles: correctionRoles,
},
```

Import `ClipboardCheck` from `lucide-react`. Also widen that group's own
`roles` (`leaveAttendanceGroupRoles`, `:135`) to include the two
department-scoped roles, or the group will not render for them.

- [ ] **Step 2b: Add the pending-count badge**

The spec's only notification mechanism — the project has no notification system
and none is being introduced. Add the count action to
`src/lib/actions/attendance-correction-actions.ts`:

```ts
// Sidebar badge count. Reviewers see everything awaiting them; a department
// sees only its own live requests. Returns 0 rather than throwing, so a badge
// can never break the shell for a role that has no business seeing it.
export async function countLiveCorrectionRequests(): Promise<number> {
  const user = await getCurrentUser();
  if (!user) return 0;
  const supabase = createAdminClient();
  let query = supabase
    .schema("hris")
    .from("attendance_correction_requests")
    .select("id", { count: "exact", head: true });

  if (canReviewAttendanceCorrection(user.role)) {
    query = query.eq("status", "pending");
  } else if (canRequestAttendanceCorrection(user.role) && user.departmentId) {
    query = query
      .eq("department_id", user.departmentId)
      .in("status", ["pending", "needs_rebase"]);
  } else {
    return 0;
  }
  const { count } = await query;
  return count ?? 0;
}
```

The sidebar is a client component, so call this from the dashboard layout
(`src/app/(dashboard)/layout.tsx`), which is already a server component, and
pass the number into `<AppSidebar />` as a new optional
`correctionCount?: number` prop. Render it on the nav item:

```tsx
{item.href === "/attendance-corrections" && correctionCount > 0 && (
  <SidebarMenuBadge>{correctionCount}</SidebarMenuBadge>
)}
```

- [ ] **Step 3: Add the employee-detail switch**

In the employee detail view, render for `canFlagCorrectionEligible` users:

```tsx
<div className="flex items-center justify-between rounded-md border p-4">
  <div>
    <p className="text-sm font-medium">Attendance correction eligible</p>
    <p className="text-sm text-muted-foreground">
      Lets this employee&apos;s department file correction requests for their
      DTR. HR still approves every request.
    </p>
  </div>
  <Switch
    checked={employee.attendance_correction_eligible}
    onCheckedChange={async (v) => {
      await setCorrectionEligible(employee.id, v);
      toast.success(v ? "Employee is now correction-eligible" : "Eligibility removed");
    }}
  />
</div>
```

- [ ] **Step 4: Full verification**

Run: `npm run test:dtr && npm run db:reset && npm run test:db && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/app-sidebar.tsx src/lib/actions/employee-actions.ts \
        src/components/employees
git commit -m "feat(attendance): correction eligibility toggle and sidebar entry"
```

---

## Notes for the implementer

**Storage is disabled on the local stack.** `config.toml` turns Storage off (see
`CLAUDE.md`), so proof upload and signed URLs cannot be exercised by
`npm run test:db`. Migration 065 guards the bucket insert behind an existence
check on `storage.buckets` so `db:reset` still succeeds. Proof upload must be
verified manually against the deployed environment; everything else is covered
by tests.

**Seeded UUIDs.** Task 5's stack test assumes employee
`00000000-0000-0000-0000-0000000000e1` from `supabase/seed.sql`. Read the seed
file and substitute real ids rather than inventing them.

**Do not restructure the importer beyond what Task 8 specifies.**
`importDahuaAttendance` and `runImportReplay` are load-bearing and handle large
batches under a serverless timeout. The changes are additive filters only.
