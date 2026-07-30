# Attendance Corrections — Design

Date: 2026-07-30

## Problem

LGU employees do not all work one fixed pattern:

- Some rotate day to day; a guard may work 10PM–6AM this week and days the next.
- Some work 8AM–5PM straight through with no noon break.

Neither is discovered in advance. It surfaces only when the DTR comes out wrong —
a night shift printing as two half-days with ~835 minutes of tardiness, or a
worked-through-lunch day printing with two blank cells that read as missed
punches.

Today the only remedy is HR or a DTR Manager hand-editing one attendance entry
at a time. The department that actually knows what happened cannot touch it:
`department_admin` and `department_head` are excluded from
`ATTENDANCE_ACCESS_ROLES` (`src/lib/auth-helpers.ts:106`).

This spec adds a **proof-backed, HR-approved correction workflow** that lets a
Department Admin fix these days for eligible employees in their department.

## What already exists (do not rebuild)

The computation engine already handles both shift shapes. The gap is workflow,
not math.

| Capability | Where |
|---|---|
| Shift templates, per-employee assignment | `hris.schedules`, `employees.schedule_id` (migration 030) |
| **Per-day schedule pin** | `attendance_logs.schedule_id` (migration 047) |
| Midnight-crossing shifts, duty-date resolution | `crossesMidnight` / `dutyDateFor` / `timeOnNextDayForNightShift` (`src/lib/attendance-schedule.ts`) |
| No-break shifts (single in/out) | `bucketPunchesForDuty` no-break path (`attendance-schedule.ts:283`) |
| Per-slot reasons that excuse a blank slot | `time_in_am_reason` … `time_out_pm_reason` (migrations 041 → 042 → 053 → 054) |
| Late / undertime math | `lateMinutesFor`, `pmLateMinutesFor`, `undertimeMinutesFor` |
| Who created / last edited an entry | `created_by`, `updated_by` (migration 046) |
| Replay protection for human edits | `runImportReplay` skips `source != 'biometric'` (`attendance-actions.ts:1353`) |
| Two-column printed DTR for no-break schedules | `dtr-form-column.tsx:499` |

## The three-layer model

Getting this wrong is the main source of confusion, so it is stated explicitly.

1. **Employee-level schedule** (`employees.schedule_id`) decides the **shape of
   the printed DTR for the whole period**. `getDepartmentDtrBulk` and
   `getEmployeeDtrRange` build `DtrScheduleInfo.has_break` from `empSchedule`
   only (`attendance-actions.ts:1838`, `:2205`), and `dtr-form-column.tsx:385`
   picks 4-column vs 2-column layout from it once, for every row. **A per-day
   pin cannot reshape a single row.** Changing an employee's normal pattern is
   HR's job, on the employee record.
2. **Per-day schedule pin** (`attendance_logs.schedule_id`) is the **baseline
   for that day's late/undertime math**, and for night shifts it decides which
   duty date a punch belongs to. The DTR builders honor it through
   `loadOverrideSchedules`.
3. **Per-slot reasons** decide **what prints in a slot the layout leaves
   blank** — and, for the AM-in and PM-out slots only, waive the charge.

Corrections operate on layers 2 and 3. Layer 1 stays with HR.

## Worked examples

### Night shift, 10PM–6AM

Employee punches 21:55 and 06:05 the next morning.

| | Inherited 8–5 schedule | Pinned "Night 22:00–05:00, no break" |
|---|---|---|
| Duty date of the 06:05 punch | Tuesday (its own day) | **Monday** — `dutyDateFor` sends it back |
| Mon `time_in_am` | 21:55 | 21:55 |
| Mon late | **835 min** | **0** |
| Mon undertime | **240 min** (no clock-out) | **0** |
| Tue | phantom row: 06:05 in, 240 min undertime | emptied — needs disposition |

Re-pinning **moves punches between duty dates**. An N-day night-shift range
therefore touches **N+1 rows**: the trailing day is emptied, and because
`computeAttendanceFlags` sets `is_absent = true` on a row with no punches, it
must be explicitly disposed of rather than left blank.

### 8AM–5PM with noon break, worked straight through

Punches at 08:00 and 17:00, no break punches.

Bucketing takes the window path: `time_in_am = 08:00`, `time_out_pm = 17:00`,
both middle slots null. `lateMinutesFor` → 0. `undertimeMinutesFor` → 0,
because `pmLateMinutesFor` returns 0 when `time_in_pm` is null.

**The math is already correct. Nothing is over-charged.** The only defect is
that the printed DTR shows AM Departure and PM Arrival blank, which reads as a
missed punch to whoever signs.

The fix is a **reason** in those two slots, not a schedule pin (which cannot
reshape the row — see layer 1) and not fabricated 12:00/13:00 punches (which
falsify the record and are indistinguishable from a real lunch punch). This
requires one new reason code, `no_break`.

## Decisions

| Question | Decision |
|---|---|
| Roster vs. correction | **Correction.** Off-pattern days are discovered after the fact; no roster is built. |
| What gets corrected | Misread days (re-pin the schedule) and wrong/incomplete slots. **Not** days with no attendance record at all. |
| Approval | **Everything requires HR/DTR Manager approval** before it reaches a DTR. |
| Eligibility | HR flags **specific employees**. |
| Request scope | Employee + **date range**, **one** proof document. |
| Retroactivity | **No limit.** Any past date may be corrected. See Risks. |
| Reason codes for requesters | `travel`, `field_work`, `official_business`, `off`, `no_break`. **`holiday` excluded.** |
| Dept Admin reach | Employees whose **effective department** (`detailed_department_id ?? department_id`) is theirs. |

## Data model — migration 065

### Eligibility flag

```sql
ALTER TABLE hris.employees
  ADD COLUMN IF NOT EXISTS attendance_correction_eligible BOOLEAN NOT NULL DEFAULT false;
```

### New reason code `no_break`

Extends the CHECK on all five reason columns (`no_time_reason`,
`time_in_am_reason`, `time_out_am_reason`, `time_in_pm_reason`,
`time_out_pm_reason`) to accept `'no_break'`, using the same re-runnable
`DO`-block pattern as migrations 053 and 054 — drop the prior named and
auto-named constraints, re-add with the widened list.

`src/lib/constants.ts` gains the code in `NO_TIME_REASONS`, with
`NO_TIME_REASON_LABELS.no_break = "NO BREAK"` and
`NO_TIME_REASON_SHORT.no_break = "NB"`.

No PDF change is needed: `SlotCell` already renders whatever short label the
slot carries.

### Requests

```sql
CREATE TABLE hris.attendance_correction_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       UUID NOT NULL REFERENCES hris.employees(id),
  department_id     UUID REFERENCES hris.departments(id),  -- effective dept, snapshot
  date_from         DATE NOT NULL,
  date_to           DATE NOT NULL,
  reason            TEXT NOT NULL,
  proof_path        TEXT NOT NULL,
  proof_filename    TEXT NOT NULL,
  proof_mime        TEXT,
  proof_size        INT,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','rejected','cancelled','stale')),
  requested_by      UUID,
  requested_by_email TEXT,
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by       UUID,
  reviewed_by_email TEXT,
  reviewed_at       TIMESTAMPTZ,
  review_notes      TEXT,
  applied_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT acr_range_chk CHECK (date_to >= date_from)
);
```

At most one pending request per employee per overlapping range (requires
`btree_gist`):

```sql
ALTER TABLE hris.attendance_correction_requests
  ADD CONSTRAINT acr_no_overlapping_pending
  EXCLUDE USING gist (
    employee_id WITH =,
    daterange(date_from, date_to, '[]') WITH &&
  ) WHERE (status = 'pending');
```

### Items

```sql
CREATE TABLE hris.attendance_correction_items (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id             UUID NOT NULL REFERENCES hris.attendance_correction_requests(id) ON DELETE CASCADE,
  duty_date              DATE NOT NULL,
  attendance_log_id      UUID NOT NULL REFERENCES hris.attendance_logs(id),
  disposition            TEXT NOT NULL DEFAULT 'update'
                           CHECK (disposition IN ('update','clear_as_off')),
  proposed_schedule_id   UUID REFERENCES hris.schedules(id),
  proposed_time_in_am    TIMESTAMPTZ,
  proposed_time_out_am   TIMESTAMPTZ,
  proposed_time_in_pm    TIMESTAMPTZ,
  proposed_time_out_pm   TIMESTAMPTZ,
  proposed_in_am_reason  TEXT CHECK (proposed_in_am_reason  IN ('travel','field_work','official_business','off','no_break')),
  proposed_out_am_reason TEXT CHECK (proposed_out_am_reason IN ('travel','field_work','official_business','off','no_break')),
  proposed_in_pm_reason  TEXT CHECK (proposed_in_pm_reason  IN ('travel','field_work','official_business','off','no_break')),
  proposed_out_pm_reason TEXT CHECK (proposed_out_pm_reason IN ('travel','field_work','official_business','off','no_break')),
  before                 JSONB NOT NULL,
  UNIQUE (request_id, duty_date)
);
```

Two deliberate constraints:

- The reason CHECK is **narrower than the column it feeds**. `attendance_logs`
  accepts `holiday`; correction items do not. Holidays stay with HR and the
  central `hris.holidays` table (migration 040) without touching existing
  constraints.
- `attendance_log_id` is `NOT NULL`, so an item can only exist for a date that
  **already has an attendance row**. This enforces the "not the missing-punch
  case" scope decision in the schema rather than in application code.

### Import protection

```sql
ALTER TABLE hris.attendance_logs
  ADD COLUMN IF NOT EXISTS correction_locked BOOLEAN NOT NULL DEFAULT false;
```

Set by the apply step. `runImportReplay` already skips human-edited days via
`source != 'biometric'`, but `importDahuaAttendance` with **overwrite existing
ON** upserts unconditionally (`attendance-actions.ts:1148`) and would clobber a
corrected day. Both import paths must exclude `correction_locked` rows and
report them in the skipped count. An explicit flag is used rather than relying
on `source`, which other flows may legitimately reset.

### Proof storage

New **private** Supabase bucket `attendance-proofs`, path
`{employee_id}/{request_id}/{filename}`, served through a signed URL from a
server action. This deliberately differs from the existing `201-files` bucket,
which is public (`document-actions.ts:62`) — a document naming an employee and
their hours should not sit behind a guessable URL.

Accepted: PDF, JPEG, PNG. Max 10 MB.

## Flow

1. **Dept Admin** submits a request. Nothing in `attendance_logs` changes;
   status is `pending`. DTRs continue to print the old values.
2. **HR / DTR Manager** reviews the per-day diff and the proof, then approves or
   rejects with notes.
3. **On approval**, the server action recomputes every affected row in
   TypeScript using the existing shared helpers — `buildManualEntryRecord`,
   `computeAttendanceFlags`, `attendance-schedule.ts` — resolving each day's
   schedule as: item pin → existing row pin → employee schedule → org default.
   It then passes the finished rows as JSONB to a single Postgres function
   `hris.apply_attendance_correction(...)` which performs the drift check and
   the write in one transaction.

   The split matters: `late_minutes`, `undertime_minutes` and `is_absent` are
   **stored columns** (migration 004), so they must be recomputed on apply — and
   reimplementing that math in SQL would duplicate `attendance-schedule.ts` and
   drift from it. TypeScript computes; SQL commits atomically.

4. Applied rows get `source = 'manual'`, `correction_locked = true`, and the
   reviewer stamped in `updated_by` / `updated_at`.
5. `logAudit` fires on: eligibility flag toggle, request submit, approve,
   reject, and apply.

### `clear_as_off`

Writes null times and `off` reasons to the emptied trailing day of a
night-shift consolidation. It prints OFF and stays off the absence count, using
existing behavior rather than new logic.

## Permissions

Three new helpers in `src/lib/auth-helpers.ts`:

```
canRequestAttendanceCorrection  →  department_admin, department_admin_and_department_head
canReviewAttendanceCorrection   →  super_admin, hr_admin, dtr_manager
canFlagCorrectionEligible       →  super_admin, hr_admin, dtr_manager
```

**`department_admin` is NOT added to `ATTENDANCE_ACCESS_ROLES`.** That would
grant the Dahua importer, bulk DTR generation and entry deletion. Corrections
live on their own route gated by the narrow helper.

### Scope

A Dept Admin reaches employees where
`COALESCE(detailed_department_id, department_id) = <their department>` **and**
`attendance_correction_eligible = true`.

This is **exclusive, not additive**: an employee whose home department is CEO
but who is detailed to CHO is reachable by the CHO admin and not the CEO admin.
That matches `dtr-signatory.ts:43`, where the effective department already
decides who signs the employee's DTR — the detailed department supervises the
duty and knows the hours.

The request's `department_id` snapshots the effective department at submit
time, so a later re-detail does not orphan a pending request.

## UI

### Dept Admin — `/attendance-corrections`

List of own requests, plus a three-step wizard:

1. Employee (eligible, effective-department only) + date range.
2. The editing grid.
3. Narrative reason + one proof upload → submit.

### The grid

The example below is an employee whose **assigned** schedule is the night shift,
so the grid — and the printed DTR — are two-column.

```
Schedule for range  [ Night Shift 10PM–6AM ▾ ]     Tardiness −835m · Undertime −240m
Selected: 8 days    [ Mark OFF ]  [ Mark NO BREAK ]  [ Set reason ▾ ]  [ Reset ]

      Date            In       Out       Late   Undertime
  ☐  Mon Jul 06    [21:55]  [06:05]⁺¹     0        0        was 835 / 240
  ☐  Tue Jul 07    [21:58]  [06:00]⁺¹     0        0        was 838 / 240
  ☐  Sat Jul 11      OFF      OFF         —        —
  ☐  Tue Jul 21    [21:55]  [  OB  ]      0        0        −240m forgiven
  ☐  Wed Jul 22      —        —           —        —        punches moved to Tue 21 · prints OFF
```

Design rules:

- **The grid renders the shape of the DTR that will actually print** — driven by
  the employee's period schedule (layer 1), not the per-day pin. Editing a
  two-column grid and receiving a four-column DTR would be a lie.

  So an employee assigned 8–5 *with* break who worked one night still gets a
  **four-column** grid: the admin enters the times in AM Arrival / PM Departure
  and marks the two middle slots `NO BREAK`, exactly as they will print. If that
  employee's real pattern has changed for good, the answer is for HR to change
  their assigned schedule — not for a correction to fake the layout. The grid
  says so inline when a pinned schedule's break-shape disagrees with the
  employee's assigned one.
- **`⁺¹` marks next-day times.** A 06:05 belonging to the previous duty date is
  the single most confusing thing about night shifts; mark it, don't hide it.
- **Bulk-first.** One office order over one stretch is the real driver, so the
  schedule pin and the "mark selected" actions sit *above* the grid. Per-row
  editing is the exception path. Nobody should make 22 identical edits.
- **The delta column is the feedback loop.** `was 835 / 240` beside `0 / 0` is
  what tells the admin the pin worked, without their ever learning what
  `dutyDateFor` does. Recomputed live, client-side, with the same helpers the
  server will use on approval.
- **Consolidation is stated, not silent.** The emptied trailing row explains
  where its punches went. An unexplained blank row generates a panicked call.
- **Forgiveness is labelled** at the cell that caused it (`−240m forgiven`), and
  it is the same figure that totals in HR's review footer.
- Default to changed rows once edits exist, with a toggle for all days.

### The slot cell

One control per slot, not two. A slot holds a time *or* a reason, so it gets one
affordance: a chip (`08:03` or `OB`) that opens a popover.

```
┌─ Tue Jul 21 · PM Out ──────────────────────┐
│  Time   [ 17:00          ]                 │
│  ──────────────  or  ──────────────────    │
│  [ TRAVEL ] [ FW ] [ OB ] [ OFF ] [ NB ]   │
│  ☐ keep the time and print the reason      │
└────────────────────────────────────────────┘
```

Type-to-parse does the work: `1700` → 17:00, `ob` → Official Business. One
keystroke path for both kinds of value. The coexistence case (a slot carrying
both a time and a reason, per `attendance-actions.ts:414`) is a checkbox rather
than a permanent second control — it is rare and should not be taxed for on
every cell.

Extract as a shared `<SlotCell>` component. `manual-entry-form.tsx` today has
two divergent editors — `TimeWithReason` (`:89`) pairs a time input with a
separate Select, and `RangeDateRow` (`:141`) offers four bare time inputs with
**no reason support at all**. Adopting the shared cell there closes that gap,
but is a **follow-up**, not part of this feature.

### HR review queue

Per-day before→after diff, proof rendered inline, and a footer stating plainly:

> total tardiness forgiven: X min · total undertime forgiven: Y min

That is the figure that matters, and a reviewer should not have to derive it by
scanning 22 rows. A banner flags ranges over 60 days old. Approve / reject with
notes.

A pending-count badge on the sidebar item is the notification; the project has
no notification system and none is introduced.

### HR — eligibility

`attendance_correction_eligible` toggle on the employee record, gated by
`canFlagCorrectionEligible`.

## Convention note

`CLAUDE.md` directs new list pages to compose `<DataTable>`. That wraps a
read-only table; an editable grid is not what it does. The correction grid
composes `@tanstack/react-table` directly with editable cells. Flagged here
rather than quietly diverging.

## Error handling

| Case | Behavior |
|---|---|
| A log row changed since its `before` snapshot | Whole request → `stale`, returned to requester. No partial apply. |
| Overlapping pending request | Blocked by `acr_no_overlapping_pending`; surfaced as a plain message, not a raw constraint error. |
| Pinned schedule deleted before approval | Validated at approval time; missing → `stale`, rather than silently reverting to the inherited schedule. |
| Proof upload fails | Upload precedes the row insert; no request is created. |
| Apply fails midway | Single Postgres function, one transaction — all-or-nothing. |
| Requester loses access to the employee mid-flight | Request stays visible to HR; the requester loses edit rights. |

## Testing

Matching the two suites the project already has:

**`npm run test:dtr`** (pure, no stack):
- Night-shift consolidation produces N+1 affected rows and the correct duty-date
  reassignment.
- `clear_as_off` yields a non-absent day printing OFF.
- Reason on AM-in zeroes `late_minutes`; reason on PM-out zeroes
  `undertime_minutes`; middle-slot reasons change neither.
- 8–5-with-break worked straight through: 0 late, 0 undertime, and `no_break` in
  both middle slots.

**`npm run test:db`** (real Postgres + PostgREST, stack up):
- `apply_attendance_correction` is atomic; a mid-batch failure rolls back fully.
- The drift guard rejects a request whose snapshot is stale.
- `acr_no_overlapping_pending` rejects a second overlapping pending request.
- Recompute round-trips correctly through real `TIMESTAMPTZ` serialization —
  per `CLAUDE.md`, the only way to catch the bug class migration 035 exists for.
- Both import paths skip `correction_locked` rows.

Then `npm run lint && npm run build`.

## Out of scope

- Rosters / advance shift planning.
- Correcting a date with **no** attendance record (the missing-punch case).
- Employee-initiated corrections.
- Retroactivity limits or period locking.
- Rewriting `manual-entry-form.tsx` to use the shared `<SlotCell>`.

## Risks

**No retroactivity limit** is an explicit decision. An approved correction to a
month whose DTR was already printed, signed and filed will silently disagree
with the paper copy. Mitigations, none blocking: the >60-day banner on the
review screen, and a full audit-log entry on every apply.

**Reasons are the highest-leverage control in the feature** — higher than
editing a time. Selecting OFFICIAL BUSINESS on the AM slot erases an entire
day's tardiness in one click (`attendance-actions.ts:446`). This is why the
review screen surfaces minutes forgiven as a headline figure rather than
displaying a bare reason code.

**Import paths are battle-tested code.** Adding the `correction_locked` guard
touches `importDahuaAttendance` and `runImportReplay`. Both need DB-level test
coverage before the change ships.
