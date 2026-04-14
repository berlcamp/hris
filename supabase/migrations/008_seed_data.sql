-- Migration 008: Seed Data
SET search_path TO hris, public, auth, extensions;

-- Default departments (Philippine LGU standard offices)
INSERT INTO hris.departments (id, name, code) VALUES
  (gen_random_uuid(), 'Office of the Mayor', 'OM'),
  (gen_random_uuid(), 'Human Resource Management Office', 'HRMO'),
  (gen_random_uuid(), 'Municipal Accounting Office', 'MAO'),
  (gen_random_uuid(), 'Municipal Budget Office', 'MBO'),
  (gen_random_uuid(), 'Municipal Treasurer''s Office', 'MTO'),
  (gen_random_uuid(), 'Municipal Planning and Development Office', 'MPDO'),
  (gen_random_uuid(), 'Municipal Engineering Office', 'MEO'),
  (gen_random_uuid(), 'Municipal Social Welfare and Development Office', 'MSWDO'),
  (gen_random_uuid(), 'Municipal Health Office', 'MHO'),
  (gen_random_uuid(), 'Municipal Agriculture Office', 'MAGRO');

-- Default super admin
INSERT INTO hris.user_profiles (email, full_name, role, is_active)
VALUES ('admin@lgu.gov.ph', 'System Administrator', 'super_admin', true);

-- Default leave types (CSC standard)
INSERT INTO hris.leave_types (code, name, max_credits, is_cumulative, is_convertible, applicable_to) VALUES
  ('VL', 'Vacation Leave', 15, true, true, 'all'),
  ('SL', 'Sick Leave', 15, true, true, 'all'),
  ('ML', 'Maternity Leave', 105, false, false, 'female'),
  ('PL', 'Paternity Leave', 7, false, false, 'male'),
  ('SPL', 'Special Privilege Leave', 3, false, false, 'all'),
  ('FL', 'Forced Leave', 5, false, false, 'all'),
  ('SoloParent', 'Solo Parent Leave', 7, false, false, 'solo_parent'),
  ('VAWC', 'VAWC Leave', 10, false, false, 'female'),
  ('CL', 'Calamity Leave', 5, false, false, 'all'),
  ('AL', 'Adoption Leave', 60, false, false, 'all'),
  ('RL', 'Rehabilitation Leave', NULL, false, false, 'all'),
  ('SEL', 'Special Emergency Leave', 5, false, false, 'all');
