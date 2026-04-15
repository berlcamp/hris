-- Migration 009: Add biometric_no to employees
SET search_path TO hris, public;

-- Auto-incrementing biometric number for mapping attendance from biometric devices
ALTER TABLE hris.employees
  ADD COLUMN biometric_no SERIAL;

-- Ensure biometric_no is unique
ALTER TABLE hris.employees
  ADD CONSTRAINT employees_biometric_no_key UNIQUE (biometric_no);
