-- Migration 010: Add CSC Form No. 6 fields to leave_applications
SET search_path TO hris, public;

-- Details of leave (6.B) - sub-options based on leave type
-- e.g., "Within the Philippines", "Abroad (specify)", "In Hospital", "Out Patient", etc.
ALTER TABLE hris.leave_applications
  ADD COLUMN details_of_leave TEXT;

-- Commutation (6.D) - whether commutation is requested
ALTER TABLE hris.leave_applications
  ADD COLUMN commutation_requested BOOLEAN DEFAULT false;

-- Specific leave dates - stores actual dates for accurate DTR overlay
-- e.g., {"2026-04-01","2026-04-05","2026-04-09"} for non-consecutive dates
-- start_date/end_date are kept as min/max bounds for query filtering
ALTER TABLE hris.leave_applications
  ADD COLUMN leave_dates DATE[] DEFAULT '{}';
