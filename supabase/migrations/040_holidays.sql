-- Migration 040: Holidays
--
-- Declared holidays that the DTR uses to stamp a day (or half a day) as
-- "HOLIDAY" instead of expecting attendance. A holiday is one calendar date
-- with a type:
--   'full'    – whole day is a holiday (the DTR row reads HOLIDAY)
--   'half_am' – morning is a holiday (AM cells read HOLIDAY, PM expects work)
--   'half_pm' – afternoon is a holiday (PM cells read HOLIDAY, AM expects work)
--
-- One row per calendar date. The DTR generators (individual + bulk) look up
-- this table for the printed period and overlay the HOLIDAY label; full-day
-- holidays are never counted as absences.

SET search_path TO hris, public, auth, extensions;

CREATE TABLE IF NOT EXISTS hris.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'full'
    CHECK (type IN ('full', 'half_am', 'half_pm')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_holidays_date ON hris.holidays(date);
