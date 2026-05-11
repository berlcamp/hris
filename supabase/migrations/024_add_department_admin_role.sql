-- Migration 024: Add department_admin to user_role enum
SET search_path TO hris, public, auth, extensions;

-- Add new value to the enum (idempotent — safe to re-run)
ALTER TYPE hris.user_role ADD VALUE IF NOT EXISTS 'department_admin';
