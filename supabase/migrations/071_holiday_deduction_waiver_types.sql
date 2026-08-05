-- Migration 071: Late/undertime waiver day types on hris.holidays
--
-- Adds 'no_am_deductions' and 'no_pm_deductions' to holidays.type.
--
-- These are NOT holidays. They are ordinary working days on which the org
-- waives late/undertime for one session — a city-wide flag ceremony that eats
-- the morning, an afternoon program everybody is pulled into. Employees still
-- report for the other half, and a no-show is still an absence; only the
-- late/undertime charge for the named session is dropped when the DTR is built
-- (see holidayExcusesAm / holidayExcusesPm in src/lib/dtr-builder.ts).
--
-- Contrast with 'half_am'/'half_pm', which declare that half of the day a
-- non-working holiday: those also suppress the absence and print HOLIDAY over
-- the covered cells on the printed DTR. The waiver types print nothing.

SET search_path TO hris, public, auth, extensions;

-- Migration 040 declared the CHECK inline on the column, so Postgres auto-named
-- it holidays_type_check. Drop the named form too, so re-running after a future
-- rename is still a no-op.
ALTER TABLE hris.holidays DROP CONSTRAINT IF EXISTS holidays_type_check;
ALTER TABLE hris.holidays DROP CONSTRAINT IF EXISTS holidays_type_allowed;

ALTER TABLE hris.holidays
  ADD CONSTRAINT holidays_type_check CHECK (
    type IN (
      'full',
      'half_am',
      'half_pm',
      'no_am_deductions',
      'no_pm_deductions'
    )
  );
