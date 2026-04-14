-- Migration 000: Schema Setup
-- Create custom hris schema to isolate HRIS objects from Supabase public schema

CREATE SCHEMA IF NOT EXISTS hris;

-- Grant usage to authenticated and anon roles (required for Supabase RLS)
GRANT USAGE ON SCHEMA hris TO authenticated;
GRANT USAGE ON SCHEMA hris TO anon;
GRANT USAGE ON SCHEMA hris TO service_role;

-- Set default search path so queries don't need hris. prefix in application code
ALTER DATABASE postgres SET search_path TO hris, public, auth, extensions;

-- For the current session
SET search_path TO hris, public, auth, extensions;
