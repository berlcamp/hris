-- ============================================================
-- HRIS · Seed data (local/dev only).
--
-- Fixtures for the DTR / attendance test harnesses. Production org data is
-- entered through the admin UI and imported by migrations 012/013/048 — this
-- file only exists so `npm run db:reset` yields a stack you can test against.
--
-- The employees below are shaped around the biometric-import bucketing bug:
-- each one exercises a different punch pattern against the default
-- 08:00–17:00 / 12:00–13:00 schedule seeded by migration 036.
-- ============================================================

set search_path to hris, public;

-- Department
insert into hris.departments (id, name, code) values
  ('00000000-0000-0000-0000-0000000000d1', 'Office of the City Mayor', 'OCM')
on conflict (name) do nothing;

-- A no-break shift, to prove the fix does not disturb the no-break path.
insert into hris.schedules (id, name, time_in, time_out, break_start, break_end, notes)
values
  ('00000000-0000-0000-0000-0000000000a1', 'Straight 8:00 AM – 4:00 PM (no break)',
   '08:00', '16:00', null, null, 'No-break shift fixture.')
on conflict (name) do nothing;

-- A night shift, to prove duty-date rollover still works.
insert into hris.schedules (id, name, time_in, time_out, break_start, break_end, notes)
values
  ('00000000-0000-0000-0000-0000000000a2', 'Night 10:00 PM – 6:00 AM',
   '22:00', '06:00', '02:00', '03:00', 'Midnight-crossing fixture.')
on conflict (name) do nothing;

-- Employees. All on the default schedule (schedule_id null => is_default row)
-- except NIGHT_EMP / NOBREAK_EMP.
insert into hris.employees
  (id, employee_no, first_name, middle_name, last_name,
   employment_type, department_id, salary_grade, step_increment, hire_date, status)
values
  -- The reported case: absent AM, single 12:45 punch.
  ('00000000-0000-0000-0000-0000000000e1', 'TEST-001', 'Halfday', 'A', 'Latearrival',
   'plantilla', '00000000-0000-0000-0000-0000000000d1', 11, 1, '2015-01-05', 'active'),
  -- Control: a completely normal 4-punch day.
  ('00000000-0000-0000-0000-0000000000e2', 'TEST-002', 'Normal', 'B', 'Fourpunch',
   'plantilla', '00000000-0000-0000-0000-0000000000d1', 11, 1, '2015-01-05', 'active'),
  -- Left early: AM punches only, no PM return.
  ('00000000-0000-0000-0000-0000000000e3', 'TEST-003', 'Morning', 'C', 'Onlyworker',
   'plantilla', '00000000-0000-0000-0000-0000000000d1', 11, 1, '2015-01-05', 'active')
on conflict (employee_no) do nothing;

update hris.employees set schedule_id = '00000000-0000-0000-0000-0000000000a1'
where employee_no = 'TEST-003';
