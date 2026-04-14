# HRIS Execution Plan — LGU Philippines

## Project Overview

A single-tenant Human Resource Information System for a Philippine Local Government Unit, compliant with CSC, COA, and DILG standards. Built with Next.js (App Router), Supabase (PostgreSQL, Auth, Storage), Tailwind CSS, and **shadcn/ui** as the primary component library.

---

## Phase 1: Project Foundation & Database Schema

**Goal:** Set up the development environment, initialize the project, and deploy the complete database schema with RLS policies.

### 1.1 Project Initialization

- [ ] Initialize Next.js project with App Router (`npx create-next-app@latest --app`)
- [ ] Install core dependencies:
  - `@supabase/supabase-js`, `@supabase/ssr`
  - `tailwindcss`, `postcss`, `autoprefixer`
  - `react-hook-form`, `zod` (form validation)
  - `@react-pdf/renderer` or `jspdf` (PDF generation)
  - `date-fns` (date handling)
  - `lucide-react` (icons)
- [ ] Configure Tailwind CSS
- [ ] Initialize **shadcn/ui** (`npx shadcn@latest init`):
  - Select style, base color, and CSS variables
  - This sets up `components/ui/` directory, `lib/utils.ts` (cn helper), and Tailwind config
- [ ] Install shadcn/ui components (install all that will be used across the system):
  ```bash
  npx shadcn@latest add button input label textarea select checkbox radio-group switch \
    form dialog alert-dialog sheet dropdown-menu command popover tooltip \
    table tabs card badge avatar separator skeleton \
    sidebar navigation-menu breadcrumb \
    calendar date-picker toast sonner \
    scroll-area collapsible accordion \
    progress chart
  ```
  **Full component list and where each is used:**

  | shadcn/ui Component | Used In |
  |---------------------|---------|
  | `Button` | All forms, actions, approval buttons, export triggers |
  | `Input` | All text fields across every form |
  | `Label` | All form field labels |
  | `Textarea` | Remarks, rejection reasons, legal basis fields |
  | `Select` | Role, department, employment type, leave type, salary grade dropdowns |
  | `Checkbox` | Bulk selection in tables, boolean fields |
  | `Radio Group` | Employment type selection, rating options |
  | `Switch` | Toggle is_active, boolean settings |
  | `Form` | All forms — wraps `react-hook-form` + `zod` with shadcn form field components (`FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`) |
  | `Dialog` | Confirmation modals, quick-edit modals, approval/rejection dialogs |
  | `Alert Dialog` | Destructive confirmations (deactivate user, cancel leave, reject NOSI/NOSA) |
  | `Sheet` | Mobile sidebar, employee quick-view panel, filter panel on mobile |
  | `Dropdown Menu` | Row action menus in tables (Edit, View, Delete, Approve, Reject) |
  | `Command` | Command palette for global search (search employees, quick navigation) |
  | `Popover` | Date pickers, filter dropdowns, employee quick-info hover cards |
  | `Tooltip` | Icon button labels, status explanations, truncated text |
  | `Table` | Used via reusable `<DataTable>` component in all CRUD listing pages (employees, NOSI, NOSA, leaves, attendance, audit log, salary grades, IPCR, users, documents, reports). See DataTable specification below |
  | `Tabs` | Employee profile tabs, NOSI eligible/records tabs, dashboard sections |
  | `Card` | Dashboard stat cards, report cards, summary cards |
  | `Badge` | Status indicators (approved/pending/rejected/draft), employment type, role |
  | `Avatar` | User profile image in sidebar, employee list |
  | `Separator` | Section dividers in forms and detail pages |
  | `Skeleton` | Loading states for all data-fetching pages |
  | `Sidebar` | Main application sidebar with role-based navigation |
  | `Navigation Menu` | Top nav items (if needed) |
  | `Breadcrumb` | Page hierarchy navigation (Dashboard > Employees > John Doe) |
  | `Calendar` | Leave date selection, attendance date navigation |
  | `Date Picker` | All date fields (hire date, effective date, date range filters) |
  | `Sonner` (toast) | Success/error notifications for all actions |
  | `Scroll Area` | Long lists in dialogs, document lists, sidebar overflow |
  | `Collapsible` | Expandable sections in employee profile, report filters |
  | `Accordion` | FAQ sections, grouped settings, bulk form sections |
  | `Progress` | Upload progress, bulk import progress |
  | `Chart` | Dashboard visualizations (employee counts, attendance, leave utilization) |
- [ ] Set up project directory structure:

```
src/
├── app/
│   ├── (auth)/
│   │   └── login/
│   ├── (dashboard)/
│   │   ├── layout.tsx          # Authenticated layout with sidebar
│   │   ├── page.tsx            # Dashboard home
│   │   ├── employees/
│   │   ├── nosi/
│   │   ├── nosa/
│   │   ├── leaves/
│   │   ├── attendance/
│   │   ├── performance/
│   │   ├── reports/
│   │   └── admin/
│   ├── api/
│   │   └── auth/
│   ├── layout.tsx
│   └── page.tsx                # Redirect to login or dashboard
├── components/
│   ├── ui/                     # shadcn/ui primitives (auto-generated, do not manually edit)
│   ├── forms/                  # Composite form components using shadcn Form + FormField
│   ├── tables/
│   │   ├── data-table.tsx      # Reusable <DataTable> component (shadcn Table + @tanstack/react-table)
│   │   ├── data-table-pagination.tsx
│   │   ├── data-table-toolbar.tsx
│   │   ├── data-table-faceted-filter.tsx
│   │   ├── data-table-view-options.tsx
│   │   └── columns/            # Column definitions per module
│   ├── pdf/                    # PDF templates (@react-pdf/renderer)
│   └── layout/                 # Sidebar (shadcn Sidebar), header, breadcrumbs
├── lib/
│   ├── supabase/
│   │   ├── client.ts           # Browser client
│   │   ├── server.ts           # Server client
│   │   └── middleware.ts       # Auth middleware helper
│   ├── constants.ts
│   ├── types.ts                # TypeScript types from DB schema
│   └── utils.ts
├── hooks/                      # Custom React hooks
└── middleware.ts                # Next.js middleware for auth guard
```

- [ ] Create `.env.local` template with Supabase keys
- [ ] Set up Supabase project (remote or local via `supabase init`)

### 1.1a Reusable `<DataTable>` Component

Build a single reusable `<DataTable>` component that is used for **every CRUD listing page** in the system. This avoids duplicating table logic across modules.

**Location:** `components/tables/data-table.tsx`

**Features (built once, reused everywhere):**
- Built on shadcn `Table` + `@tanstack/react-table`
- Accepts generic `TData` and column definitions
- Server-side pagination with `DataTablePagination` (page size selector via `Select`, prev/next `Button`)
- Column sorting (clickable headers)
- Column visibility toggle via `DataTableViewOptions` (`Dropdown Menu` with `Checkbox` per column)
- Global search `Input` (debounced)
- Faceted filters via `DataTableFacetedFilter` (`Popover` with `Command` list + `Badge` count)
- Toolbar via `DataTableToolbar` (search + filters + view options + action buttons)
- Row selection with `Checkbox` (for bulk actions)
- Row actions via `Dropdown Menu` (View, Edit, Delete, Approve, Reject — configurable per module)
- Empty state message
- Loading state with shadcn `Skeleton` rows

**Supporting files:**
| File | Purpose |
|------|---------|
| `data-table.tsx` | Main `<DataTable>` component |
| `data-table-pagination.tsx` | Pagination controls (page size `Select`, page nav `Button`) |
| `data-table-toolbar.tsx` | Search `Input` + filter slots + bulk action `Button` + export `Button` |
| `data-table-faceted-filter.tsx` | Multi-select filter (`Popover` + `Command` + `Checkbox` + `Badge`) |
| `data-table-view-options.tsx` | Column visibility toggle (`Dropdown Menu` + `Checkbox`) |
| `columns/*.tsx` | Column definitions per module (employees, NOSI, NOSA, leaves, etc.) |

**Usage pattern (every CRUD page follows this):**
```tsx
// Example: /employees/page.tsx
import { DataTable } from "@/components/tables/data-table"
import { columns } from "@/components/tables/columns/employee-columns"

export default async function EmployeesPage() {
  const { data, count } = await getEmployees(searchParams)
  return <DataTable columns={columns} data={data} totalCount={count} />
}
```

**Pages using `<DataTable>`:**
- `/admin/users` — user_profiles CRUD
- `/admin/salary-grades` — salary grade table management
- `/employees` — employee list
- `/nosi` — NOSI records tab
- `/nosa` — NOSA records list
- `/leaves` — leave applications list
- `/leaves/credits` — leave credits table view
- `/attendance` — attendance log list
- `/attendance/dtr` — DTR daily entries
- `/performance` — IPCR records list
- `/reports/*` — all report preview tables
- `/employees/[id]` — salary history tab, documents tab, service records tab

### 1.1b Layout Design with `/frontend-design` Skill

> **IMPORTANT:** Use the **`/frontend-design` skill** to design and generate the first application layout before building out individual pages. This ensures a polished, production-grade design foundation rather than generic scaffolding.

- [ ] Invoke `/frontend-design` to create the core application shell:
  - **Authenticated layout** (`app/(dashboard)/layout.tsx`):
    - shadcn `SidebarProvider` wrapping the page
    - `<AppSidebar>` with LGU branding, role-based nav groups, user footer with `Avatar`
    - Top header bar with `Breadcrumb`, global search (`Command` palette trigger), user `Dropdown Menu`
    - Main content area with consistent padding and max-width
  - **Login page** (`app/(auth)/login/page.tsx`):
    - Centered `Card` with LGU logo, system name, Google sign-in `Button`
    - Clean, government-appropriate design (not generic SaaS)
  - **Dashboard page** (`app/(dashboard)/page.tsx`):
    - Stat `Card` grid layout
    - Chart area using shadcn `Chart` in `Card`
    - Pending approvals section
  - **Design tokens and theme:**
    - Color scheme appropriate for Philippine government (professional, not flashy)
    - Consistent spacing, typography, and component sizing
    - Dark mode support (optional, via shadcn theme toggle)
- [ ] Review and refine the generated layout before proceeding to module pages
- [ ] All subsequent module pages inherit this layout and follow the established design patterns

### 1.2 Database Schema (Supabase SQL — Custom Schema `hris`)

> **All tables, enums, functions, triggers, and RLS policies live in the `hris` schema, NOT the default `public` schema.**
> This keeps HRIS objects isolated, avoids conflicts with Supabase internals in `public`, and makes backups/migrations cleaner.

Execute the following SQL migrations in order:

#### Migration 000: Schema Setup

```sql
-- Create custom schema
CREATE SCHEMA IF NOT EXISTS hris;

-- Grant usage to authenticated and anon roles (required for Supabase RLS)
GRANT USAGE ON SCHEMA hris TO authenticated;
GRANT USAGE ON SCHEMA hris TO anon;
GRANT USAGE ON SCHEMA hris TO service_role;

-- Set default search path so queries don't need hris. prefix in application code
ALTER DATABASE postgres SET search_path TO hris, public, auth, extensions;

-- For the current session
SET search_path TO hris, public, auth, extensions;
```

> **Supabase client config:** When initializing the Supabase client, set the `db.schema` option to `"hris"`:
> ```ts
> // lib/supabase/client.ts
> const supabase = createBrowserClient(url, key, {
>   db: { schema: 'hris' }
> })
>
> // lib/supabase/server.ts
> const supabase = createServerClient(url, key, {
>   db: { schema: 'hris' },
>   cookies: { ... }
> })
> ```
>
> **Type generation:** Use `supabase gen types typescript --schema hris` to generate types from the custom schema.

#### Migration 001: Enums and Core Tables

```sql
-- Set schema context for this migration
SET search_path TO hris, public, auth, extensions;

-- Enums (created in hris schema)
CREATE TYPE hris.user_role AS ENUM ('super_admin', 'hr_admin', 'department_head', 'employee');
CREATE TYPE hris.employment_type AS ENUM ('plantilla', 'jo', 'cos');
CREATE TYPE hris.employee_status AS ENUM ('active', 'inactive', 'retired', 'terminated', 'resigned');
CREATE TYPE hris.approval_status AS ENUM ('draft', 'pending', 'approved', 'rejected', 'cancelled');
CREATE TYPE hris.leave_type_code AS ENUM ('VL', 'SL', 'ML', 'PL', 'SPL', 'FL', 'SoloParent', 'VAWC', 'RA9262', 'CL', 'AL', 'RL', 'SEL');
CREATE TYPE hris.document_type AS ENUM ('201_file', 'nosi', 'nosa', 'service_record', 'leave_form', 'dtr', 'ipcr', 'other');
CREATE TYPE hris.salary_change_reason AS ENUM ('initial', 'step_increment', 'promotion', 'reclassification', 'salary_standardization', 'adjustment', 'demotion');

-- Departments
CREATE TABLE hris.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  head_employee_id UUID,  -- FK added after employees table
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User Profiles (source of truth for access control)
CREATE TABLE hris.user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'employee',
  department_id UUID REFERENCES departments(id),
  is_active BOOLEAN DEFAULT true,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Positions (Plantilla of Positions)
CREATE TABLE hris.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  item_number TEXT UNIQUE,              -- Plantilla item number
  salary_grade INT NOT NULL,
  department_id UUID REFERENCES departments(id),
  is_filled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Employees
CREATE TABLE hris.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID UNIQUE REFERENCES user_profiles(id),
  employee_no TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  suffix TEXT,
  birth_date DATE,
  gender TEXT,
  civil_status TEXT,
  address TEXT,
  phone TEXT,
  employment_type employment_type NOT NULL,
  position_id UUID REFERENCES positions(id),
  department_id UUID REFERENCES departments(id),
  salary_grade INT NOT NULL,
  step_increment INT NOT NULL DEFAULT 1,
  hire_date DATE NOT NULL,
  end_of_contract DATE,                  -- For JO/COS
  status employee_status DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add FK for department head
ALTER TABLE hris.departments
  ADD CONSTRAINT fk_dept_head FOREIGN KEY (head_employee_id) REFERENCES hris.employees(id);
```

#### Migration 002: Salary, NOSI, NOSA

```sql
SET search_path TO hris, public, auth, extensions;

-- Salary Grade Table (SSL reference)
CREATE TABLE hris.salary_grade_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade INT NOT NULL,
  step INT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  tranche INT NOT NULL DEFAULT 1,          -- SSL tranche
  effective_year INT NOT NULL,
  UNIQUE(grade, step, tranche)
);

-- Salary History
CREATE TABLE hris.salary_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  salary_grade INT NOT NULL,
  step INT NOT NULL,
  salary_amount NUMERIC(12,2) NOT NULL,
  effective_date DATE NOT NULL,
  reason salary_change_reason NOT NULL,
  reference_id UUID,                       -- FK to nosi or nosa record
  remarks TEXT,
  created_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- NOSI Records
CREATE TABLE hris.nosi_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  current_salary_grade INT NOT NULL,
  current_step INT NOT NULL,
  new_step INT NOT NULL,
  current_salary NUMERIC(12,2) NOT NULL,
  new_salary NUMERIC(12,2) NOT NULL,
  effective_date DATE NOT NULL,
  last_increment_date DATE,
  years_in_step INT,
  status approval_status DEFAULT 'draft',
  generated_by UUID REFERENCES user_profiles(id),
  reviewed_by UUID REFERENCES user_profiles(id),
  approved_by UUID REFERENCES user_profiles(id),
  reviewed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- NOSA Records
CREATE TABLE hris.nosa_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  previous_salary_grade INT NOT NULL,
  previous_step INT NOT NULL,
  previous_salary NUMERIC(12,2) NOT NULL,
  new_salary_grade INT NOT NULL,
  new_step INT NOT NULL,
  new_salary NUMERIC(12,2) NOT NULL,
  reason salary_change_reason NOT NULL,
  effective_date DATE NOT NULL,
  status approval_status DEFAULT 'draft',
  generated_by UUID REFERENCES user_profiles(id),
  reviewed_by UUID REFERENCES user_profiles(id),
  approved_by UUID REFERENCES user_profiles(id),
  reviewed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  legal_basis TEXT,                         -- e.g., "SSL Tranche 5", "Promotion"
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### Migration 003: Leave Management

```sql
SET search_path TO hris, public, auth, extensions;

-- Leave Types Configuration
CREATE TABLE hris.leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code leave_type_code UNIQUE NOT NULL,
  name TEXT NOT NULL,
  max_credits NUMERIC(5,2),               -- NULL = unlimited
  is_cumulative BOOLEAN DEFAULT false,     -- Can carry over
  is_convertible BOOLEAN DEFAULT false,    -- Cash conversion eligible
  applicable_to TEXT DEFAULT 'all',        -- 'all', 'female', 'male', 'solo_parent'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Leave Credits (per employee, per year)
CREATE TABLE hris.leave_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  leave_type_id UUID NOT NULL REFERENCES leave_types(id),
  year INT NOT NULL,
  total_credits NUMERIC(5,2) NOT NULL DEFAULT 0,
  used_credits NUMERIC(5,2) NOT NULL DEFAULT 0,
  balance NUMERIC(5,2) GENERATED ALWAYS AS (total_credits - used_credits) STORED,
  UNIQUE(employee_id, leave_type_id, year)
);

-- Leave Applications
CREATE TABLE hris.leave_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  leave_type_id UUID NOT NULL REFERENCES leave_types(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_applied NUMERIC(5,2) NOT NULL,
  reason TEXT,
  status approval_status DEFAULT 'pending',
  department_head_id UUID REFERENCES user_profiles(id),
  hr_reviewer_id UUID REFERENCES user_profiles(id),
  dept_approved_at TIMESTAMPTZ,
  hr_approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### Migration 004: Attendance & DTR

```sql
SET search_path TO hris, public, auth, extensions;

-- Attendance Logs
CREATE TABLE hris.attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  date DATE NOT NULL,
  time_in_am TIMESTAMPTZ,
  time_out_am TIMESTAMPTZ,
  time_in_pm TIMESTAMPTZ,
  time_out_pm TIMESTAMPTZ,
  is_late BOOLEAN DEFAULT false,
  late_minutes INT DEFAULT 0,
  is_undertime BOOLEAN DEFAULT false,
  undertime_minutes INT DEFAULT 0,
  is_absent BOOLEAN DEFAULT false,
  remarks TEXT,
  source TEXT DEFAULT 'manual',            -- 'manual', 'biometric'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, date)
);

-- Monthly DTR Summary
CREATE TABLE hris.dtr_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  month INT NOT NULL,
  year INT NOT NULL,
  total_days_present INT DEFAULT 0,
  total_days_absent INT DEFAULT 0,
  total_late_minutes INT DEFAULT 0,
  total_undertime_minutes INT DEFAULT 0,
  generated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, month, year)
);
```

#### Migration 005: Performance (IPCR)

```sql
SET search_path TO hris, public, auth, extensions;

-- IPCR Periods
CREATE TABLE hris.ipcr_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                      -- e.g., "Jan-Jun 2026"
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- IPCR Records
CREATE TABLE hris.ipcr_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  period_id UUID NOT NULL REFERENCES ipcr_periods(id),
  numerical_rating NUMERIC(4,2),
  adjectival_rating TEXT,                  -- Outstanding, Very Satisfactory, etc.
  status approval_status DEFAULT 'draft',
  reviewed_by UUID REFERENCES user_profiles(id),
  approved_by UUID REFERENCES user_profiles(id),
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, period_id)
);
```

#### Migration 006: Documents & Audit

```sql
SET search_path TO hris, public, auth, extensions;

-- Documents (201 Files, generated PDFs)
CREATE TABLE hris.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INT,
  mime_type TEXT,
  type document_type NOT NULL,
  reference_id UUID,                       -- FK to source record
  uploaded_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Audit Log (COA-ready)
CREATE TABLE hris.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id),
  user_email TEXT,
  action TEXT NOT NULL,                    -- 'INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'EXPORT'
  table_name TEXT,
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Service Records (auto-generated from employee history)
CREATE TABLE hris.service_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  date_from DATE NOT NULL,
  date_to DATE,
  designation TEXT NOT NULL,
  status_type TEXT,                        -- Plantilla/COS/JO
  salary NUMERIC(12,2),
  office TEXT,
  branch TEXT,
  leave_without_pay INT DEFAULT 0,
  separation_date DATE,
  separation_cause TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_employees_department ON hris.employees(department_id);
CREATE INDEX idx_employees_status ON hris.employees(status);
CREATE INDEX idx_salary_history_employee ON hris.salary_history(employee_id);
CREATE INDEX idx_nosi_employee ON hris.nosi_records(employee_id);
CREATE INDEX idx_nosa_employee ON hris.nosa_records(employee_id);
CREATE INDEX idx_leave_employee ON hris.leave_applications(employee_id);
CREATE INDEX idx_attendance_employee_date ON hris.attendance_logs(employee_id, date);
CREATE INDEX idx_audit_log_user ON hris.audit_log(user_id);
CREATE INDEX idx_audit_log_table ON hris.audit_log(table_name, record_id);
CREATE INDEX idx_documents_employee ON hris.documents(employee_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION hris.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER trg_user_profiles_updated_at BEFORE UPDATE ON hris.user_profiles FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();
CREATE TRIGGER trg_employees_updated_at BEFORE UPDATE ON hris.employees FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();
CREATE TRIGGER trg_nosi_updated_at BEFORE UPDATE ON hris.nosi_records FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();
CREATE TRIGGER trg_nosa_updated_at BEFORE UPDATE ON hris.nosa_records FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();
CREATE TRIGGER trg_leave_updated_at BEFORE UPDATE ON hris.leave_applications FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();
CREATE TRIGGER trg_ipcr_updated_at BEFORE UPDATE ON hris.ipcr_records FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();
CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON hris.departments FOR EACH ROW EXECUTE FUNCTION hris.update_updated_at();
```

### 1.3 Row Level Security (RLS) Policies

```sql
SET search_path TO hris, public, auth, extensions;

-- Enable RLS on all tables in hris schema
ALTER TABLE hris.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.salary_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.nosi_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.nosa_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.leave_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.ipcr_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.leave_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE hris.service_records ENABLE ROW LEVEL SECURITY;

-- Grant table-level access to roles (required for RLS on custom schemas)
GRANT ALL ON ALL TABLES IN SCHEMA hris TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA hris TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA hris TO service_role;

-- Helper: get current user's role
CREATE OR REPLACE FUNCTION hris.get_user_role()
RETURNS hris.user_role AS $$
  SELECT role FROM hris.user_profiles
  WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: get current user's department
CREATE OR REPLACE FUNCTION hris.get_user_department_id()
RETURNS UUID AS $$
  SELECT department_id FROM hris.user_profiles
  WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: get current user's employee_id
CREATE OR REPLACE FUNCTION hris.get_employee_id()
RETURNS UUID AS $$
  SELECT e.id FROM hris.employees e
  JOIN hris.user_profiles up ON e.user_profile_id = up.id
  WHERE up.email = (SELECT email FROM auth.users WHERE id = auth.uid())
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- user_profiles: admins see all, dept heads see own dept, employees see self
CREATE POLICY "super_admin_full_access" ON hris.user_profiles
  FOR ALL USING (hris.get_user_role() = 'super_admin');

CREATE POLICY "hr_admin_full_read" ON hris.user_profiles
  FOR SELECT USING (hris.get_user_role() = 'hr_admin');

CREATE POLICY "dept_head_own_dept" ON hris.user_profiles
  FOR SELECT USING (
    hris.get_user_role() = 'department_head'
    AND department_id = hris.get_user_department_id()
  );

CREATE POLICY "employee_self" ON hris.user_profiles
  FOR SELECT USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- employees: same pattern
CREATE POLICY "admin_all_employees" ON hris.employees
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

CREATE POLICY "dept_head_dept_employees" ON hris.employees
  FOR SELECT USING (
    hris.get_user_role() = 'department_head'
    AND department_id = hris.get_user_department_id()
  );

CREATE POLICY "employee_self_record" ON hris.employees
  FOR SELECT USING (id = hris.get_employee_id());

-- Apply similar patterns to salary_history, nosi_records, nosa_records,
-- leave_applications, attendance_logs, documents, ipcr_records, service_records.
-- (Each follows: admin=all, dept_head=department, employee=self)

-- leave_applications: employees can INSERT their own
CREATE POLICY "employee_create_leave" ON hris.leave_applications
  FOR INSERT WITH CHECK (employee_id = hris.get_employee_id());

CREATE POLICY "employee_view_own_leave" ON hris.leave_applications
  FOR SELECT USING (employee_id = hris.get_employee_id());

CREATE POLICY "dept_head_dept_leave" ON hris.leave_applications
  FOR ALL USING (
    hris.get_user_role() = 'department_head'
    AND employee_id IN (
      SELECT id FROM hris.employees WHERE department_id = hris.get_user_department_id()
    )
  );

CREATE POLICY "hr_all_leave" ON hris.leave_applications
  FOR ALL USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

-- audit_log: only admin can read
CREATE POLICY "admin_audit_log" ON hris.audit_log
  FOR SELECT USING (hris.get_user_role() IN ('super_admin', 'hr_admin'));

CREATE POLICY "system_insert_audit" ON hris.audit_log
  FOR INSERT WITH CHECK (true);  -- Allow inserts from triggers/functions
```

### 1.4 Seed Script

```sql
SET search_path TO hris, public, auth, extensions;

-- Default departments
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
```

### 1.5 Deliverables Checklist — Phase 1

- [ ] Next.js project running locally
- [ ] Supabase project created and connected
- [ ] Custom `hris` schema created with proper grants
- [ ] All migrations applied, tables created in `hris` schema
- [ ] RLS policies active on all `hris` tables
- [ ] Seed data inserted (super admin, departments, leave types)
- [ ] TypeScript types generated from `hris` schema (`supabase gen types typescript --schema hris`)

---

## Phase 2: Authentication & User Management

**Goal:** Implement Google OAuth login with email-based access control and the super admin user management interface.

### 2.1 Google OAuth Setup

- [ ] Configure Google OAuth provider in Supabase Dashboard
  - Set authorized redirect URI
  - Restrict to organization domain (optional)
- [ ] Create Supabase client utilities:
  - `lib/supabase/client.ts` — browser client (`createBrowserClient`)
  - `lib/supabase/server.ts` — server client (`createServerClient`)
- [ ] Create `middleware.ts` — refresh session on every request

### 2.2 Login Flow Implementation

- [ ] Build `/login` page:
  - Use shadcn `Card` for the login container, `Button` for Google Sign-In
  - On sign-in callback, check `user_profiles` for matching email
  - If no match → sign out immediately, show "Access Denied" using shadcn `Alert Dialog`
  - If match → redirect to `/dashboard`
- [ ] Create `/api/auth/callback` route handler:
  - Exchange auth code for session
  - Verify email exists in `user_profiles`
  - If unauthorized, revoke session and redirect to `/login?error=unauthorized`
- [ ] Store role in session metadata or fetch on each request via `user_profiles`

### 2.3 Auth Guard Middleware

- [ ] `middleware.ts`:
  - Protect all `/dashboard/*` routes
  - Redirect unauthenticated users to `/login`
  - Attach user role to request for downstream use

### 2.4 User Management (Super Admin)

- [ ] `/admin/users` page:
  - Use `<DataTable>` with user columns: name, email, role (`Badge`), department, active status (`Badge` variant)
  - Toolbar: search by name/email, faceted filter by role and department
  - Row actions via `Dropdown Menu`: Edit, Deactivate
- [ ] `/admin/users/new` — Create user form:
  - Use shadcn `Form` (wrapping react-hook-form + zod) with `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`
  - Fields: full_name (`Input`), email (`Input`), role (`Select`), department (`Select`), is_active (`Switch`)
  - Validation: email must be valid Google email format (zod schema)
  - Insert into `user_profiles` only (no auth.users manipulation)
  - Submit with shadcn `Button`, success/error via `Sonner` toast
- [ ] `/admin/users/[id]/edit` — Edit user (same shadcn form pattern)
- [ ] Deactivate user — shadcn `Alert Dialog` for confirmation, set `is_active = false`

### 2.5 Role-Based Navigation

- [ ] Create `<AppSidebar>` using shadcn `Sidebar` component:
  - Use `SidebarProvider`, `SidebarHeader`, `SidebarContent`, `SidebarGroup`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarFooter`
  - User info in `SidebarFooter` with `Avatar` and `Dropdown Menu` (profile, logout)
  - Collapsible groups with `Collapsible` for module sections
  - Navigation items filtered by role:
    - **super_admin**: All modules + Admin panel
    - **hr_admin**: All modules except Admin panel
    - **department_head**: Dashboard, Employees (own dept), Leaves, Attendance, Performance
    - **employee**: Dashboard, My Profile, My Leaves, My DTR, My IPCR
  - Mobile responsive via shadcn `Sheet` (auto-handled by Sidebar component)

### 2.6 Deliverables Checklist — Phase 2

- [ ] Google OAuth login working
- [ ] Unauthorized emails blocked at login
- [ ] Super admin can create/edit/deactivate users
- [ ] Role-based sidebar navigation
- [ ] Session persistence and refresh working

---

## Phase 3: Employee Management & 201 Files

**Goal:** Build the employee records module — the core data that all other modules depend on.

### 3.1 Employee List Page

- [ ] `/employees` page:
  - `<DataTable>` with employee columns: Employee No, Name, Department, Position, Employment Type (`Badge`), Status (`Badge` with color variants)
  - Toolbar: search by name/employee number, faceted filters for department, employment type, status
  - Row actions via `Dropdown Menu`: View, Edit, Deactivate
  - Server-side pagination
  - Export to CSV via toolbar `Button`
- [ ] Role-based visibility:
  - Admin/HR: all employees
  - Dept head: own department only
  - Employee: redirects to own profile

### 3.2 Employee Profile

- [ ] `/employees/[id]` — Tabbed profile page using shadcn `Tabs` (`TabsList`, `TabsTrigger`, `TabsContent`):
  - **Personal Info** tab: display in shadcn `Card` sections, edit via `Dialog` with `Form`
  - **Employment** tab: employee no, type (`Badge`), position, department, salary grade/step, hire date
  - **Salary History** tab: `<DataTable>` of all salary changes with reason `Badge`
  - **Service Record** tab: auto-generated from employment history, download `Button`
  - **Documents** tab: 201 file list in `<DataTable>`, upload `Button` with `Dialog`
  - **Leave Credits** tab: current balances in `Card` grid
  - Page header with `Avatar`, `Breadcrumb` navigation, and action `Dropdown Menu`
- [ ] `/employees/new` — Create employee form:
  - Multi-section `Form` (shadcn Form + react-hook-form + zod)
  - Link to user profile via searchable `Command` (combobox) for unlinked profiles
  - Date fields with shadcn `Date Picker` (uses `Calendar` + `Popover`)
  - Department and position via `Select`
  - Employment type via `Radio Group`
  - Auto-generate employee number (format: `LGU-YYYY-NNNN`)
  - Submit `Button` with loading state, `Sonner` toast on success
- [ ] `/employees/[id]/edit` — Edit employee (same shadcn form pattern, pre-populated)

### 3.3 201 File Management

- [ ] Document upload component:
  - Upload `Dialog` with drag-and-drop zone, `Progress` bar for upload status
  - Upload to Supabase Storage bucket `201-files`
  - Accept: PDF, JPG, PNG (max 10MB per file)
  - Categorize via `Select`: PDS, appointment papers, oath of office, certifications, training certs, etc.
- [ ] Document list using `<DataTable>` with `Scroll Area`, download/preview `Button` per row
- [ ] Delete document — `Alert Dialog` for confirmation (admin only)

### 3.4 Service Record Auto-Generation

- [ ] Query employment history from `service_records` table
- [ ] Generate PDF matching CSC Service Record format
- [ ] Store generated PDF in documents table

### 3.5 Deliverables Checklist — Phase 3

- [ ] Employee CRUD operations working
- [ ] Employee list with search, filter, pagination
- [ ] Employee profile with all tabs
- [ ] 201 file upload/download
- [ ] Service record auto-generation
- [ ] Role-based data visibility enforced

---

## Phase 4: NOSI & NOSA Modules

**Goal:** Implement salary step increment (NOSI) and salary adjustment (NOSA) workflows with PDF generation.

### 4.1 NOSI Module

- [ ] **Auto-Detection Logic** (`lib/nosi.ts`):
  - Query employees where years since last step increment >= 3
  - Cross-reference with `salary_history` for last `step_increment` entry
  - Consider IPCR rating (must be at least "Satisfactory")
  - Return list of eligible employees
- [ ] `/nosi` page:
  - shadcn `Tabs`: "Eligible Employees" (`<DataTable>` with auto-detected list) and "NOSI Records" (`<DataTable>` with status `Badge` faceted filter)
- [ ] `/nosi/new` — Generate NOSI:
  - shadcn `Form` with employee searchable `Command` combobox (or pre-filled from eligible list)
  - Auto-populate fields in read-only `Input`: current SG, current step, new step, current salary, new salary (from `salary_grade_table`)
  - Effective date via `Date Picker`
  - Save as draft with `Button`, `Sonner` toast on success
- [ ] `/nosi/[id]` — NOSI detail page:
  - Detail layout using shadcn `Card` sections
  - Status shown as `Badge` with color variant (draft=gray, pending=yellow, approved=green, rejected=red)
  - Approval actions (based on role) using `Button` variants:
    - HR: "Submit for Review" `Button`
    - Department Head: "Approve" (success) / "Reject" (destructive) `Button` — rejection opens `Dialog` with `Textarea` for reason
    - Approving Authority (super_admin): Final approval `Button`
  - Status timeline using custom stepper with `Separator` and `Badge`
  - "Generate PDF" `Button` after approval
- [ ] **On Approval**:
  - Update `employees.step_increment`
  - Insert record into `salary_history`
  - Generate NOSI PDF
  - Save PDF to `documents`

### 4.2 NOSI PDF Template

- [ ] Match CSC NOSI format:
  - Header: LGU name, logo
  - Employee details: name, position, department
  - Current SG/Step and salary
  - New Step and salary
  - Effective date
  - Signature blocks: HR Officer, Department Head, LCE

### 4.3 NOSA Module

- [ ] `/nosa` page:
  - `<DataTable>` listing all NOSA records with status `Badge` faceted filter
  - "Create NOSA" `Button` in page header
- [ ] `/nosa/new` — Create NOSA:
  - shadcn `Form` with employee `Command` combobox
  - Previous salary in read-only `Input` (auto-filled from current)
  - New salary grade and step via `Select`, amount auto-populated
  - Reason via `Select`: promotion, reclassification, salary standardization, other
  - Legal basis in `Textarea`
  - Effective date via `Date Picker`
- [ ] `/nosa/[id]` — Detail and approval (same shadcn pattern as NOSI: `Card` layout, `Badge` status, approval `Button` actions, rejection `Dialog`)
- [ ] **On Approval**:
  - Update `employees.salary_grade` and `step_increment`
  - Insert into `salary_history`
  - Generate NOSA PDF
  - If position changed, update `employees.position_id`

### 4.4 NOSA PDF Template

- [ ] Match standard NOSA format:
  - Previous and new salary details
  - Reason and legal basis
  - Signature blocks

### 4.5 Salary Grade Reference Table Management

- [ ] `/admin/salary-grades` (admin only):
  - `<DataTable>` for salary grade/step/amount listing
  - Inline edit via `Dialog` with `Form` (grade `Input`, step `Input`, amount `Input`)
  - "Add Entry" `Button`, delete via `Alert Dialog`
  - Bulk import: CSV upload `Dialog` with file input, preview in `<DataTable>`, confirm with `Button`
  - Tranche selector via `Select`

### 4.6 Deliverables Checklist — Phase 4

- [ ] NOSI eligibility auto-detection
- [ ] NOSI creation and approval workflow
- [ ] NOSA creation and approval workflow
- [ ] NOSI/NOSA PDF generation
- [ ] Salary history updated on approval
- [ ] Salary grade reference table management

---

## Phase 5: Leave Management

**Goal:** Implement leave application, approval workflow, credit tracking, and CSC Form 6 generation.

### 5.1 Leave Credits

- [ ] Auto-provision annual credits:
  - VL: 15 days/year (1.25/month)
  - SL: 15 days/year (1.25/month)
  - Carry-over logic for cumulative leave types
- [ ] `/leaves/credits` — view credits in shadcn `Card` grid (per leave type showing total, used, balance) or `Table` view by employee (HR)
- [ ] Manual credit adjustment: `Dialog` with `Form` (`Input` for amount, `Textarea` for reason), HR only

### 5.2 Leave Application

- [ ] `/leaves/apply` — Leave application form:
  - shadcn `Form` with:
    - Leave type via `Select` (filtered by eligibility)
    - Date range via two `Date Picker` components (start/end) using `Calendar` + `Popover`
    - Auto-calculate working days displayed in `Badge`
    - Balance check shown as inline validation (`FormMessage`)
    - Reason/details in `Textarea`
    - Supporting document upload `Button` (for SL with medical cert, etc.)
  - Submit `Button`, cancel `Button` (outline variant)
- [ ] Validation:
  - Cannot exceed available credits
  - Cannot overlap with existing approved leave
  - Maternity leave: minimum 60 days

### 5.3 Leave Approval Workflow

- [ ] `/leaves` — List view:
  - `<DataTable>` with columns: leave type (`Badge`), date range, days, status (`Badge`), row `Dropdown Menu` actions
  - Toolbar: faceted filters for status and leave type, date range `Date Picker`
  - Employee: own applications with status
  - Dept Head: pending applications from department (highlighted `Badge` count)
  - HR: all pending applications
- [ ] Approval flow:
  1. Employee submits → status: `pending`
  2. Department Head approves → HR review
  3. HR approves → status: `approved`, deduct credits
  4. Rejection at any step → status: `rejected` with reason
- [ ] Email/notification on status change (optional, Phase 7)

### 5.4 CSC Form 6 Generation

- [ ] Generate PDF matching CSC Form No. 6 (Application for Leave):
  - Employee details
  - Leave type and dates
  - Certification of leave credits
  - Recommendation and approval signatures

### 5.5 Leave Ledger

- [ ] `/reports/leave-ledger` — per-employee ledger:
  - All leave transactions (earned, used, balance)
  - Filterable by year
  - Exportable to PDF/CSV

### 5.6 Deliverables Checklist — Phase 5

- [ ] Leave credit auto-provisioning and tracking
- [ ] Leave application with validation
- [ ] Three-step approval workflow
- [ ] Credit deduction on approval
- [ ] CSC Form 6 PDF generation
- [ ] Leave ledger report

---

## Phase 6: Attendance & DTR

**Goal:** Implement daily time record logging, late/undertime tracking, and monthly DTR generation.

### 6.1 Attendance Logging

- [ ] `/attendance` page:
  - Manual time entry: shadcn `Form` with `Date Picker` for date, `Input` (time type) for AM in/out and PM in/out
  - Bulk entry for HR: employee `Command` combobox, date range `Date Picker`, time inputs in `Table` rows
  - Biometric CSV import `Dialog`:
    - File upload `Button`
    - Preview parsed data in `<DataTable>` with `Scroll Area`
    - Conflict detection shown as warning `Badge` per row
    - Confirm import `Button`, cancel `Button`
    - `Progress` bar during import

### 6.2 Late & Undertime Calculation

- [ ] Configure standard work hours:
  - AM: 8:00 AM - 12:00 PM
  - PM: 1:00 PM - 5:00 PM
  - Grace period: configurable (default 0)
- [ ] Auto-calculate:
  - Late minutes (time_in_am > 8:00)
  - Undertime minutes (time_out_pm < 5:00)
  - Half-day detection
  - Absent detection (no log on working day)

### 6.3 Monthly DTR Generation

- [ ] `/attendance/dtr` — Monthly DTR view:
  - Employee `Command` combobox, month/year `Select` dropdowns
  - Daily entries in `<DataTable>` (CSC DTR format), late/absent highlighted with `Badge`
  - Summary `Card` at bottom: total present, absent, late, undertime
- [ ] Generate DTR PDF:
  - Match CSC Daily Time Record format
  - Include certification line
- [ ] DTR Summary for payroll:
  - Aggregate late/undertime per employee per month
  - Export to CSV

### 6.4 Deliverables Checklist — Phase 6

- [ ] Manual attendance entry
- [ ] Biometric CSV import
- [ ] Late/undertime auto-calculation
- [ ] Monthly DTR view and PDF generation
- [ ] DTR summary export

---

## Phase 7: Performance Management (IPCR)

**Goal:** Track Individual Performance Commitment and Review ratings.

### 7.1 IPCR Period Management

- [ ] `/admin/ipcr-periods` — CRUD in `<DataTable>`, create/edit via `Dialog` with `Form` (`Input` for name, `Date Picker` for dates, `Switch` for active)
- [ ] Set active period toggle via `Switch`

### 7.2 IPCR Records

- [ ] `/performance` page:
  - `<DataTable>` listing employees with IPCR status `Badge` for active period
  - Toolbar: faceted filters for department, status, adjectival rating
  - Row actions via `Dropdown Menu`
- [ ] `/performance/[id]` — IPCR entry:
  - shadcn `Form` in `Card` layout
  - Numerical rating via `Input` (1.00 - 5.00)
  - Auto-map adjectival rating shown as `Badge` (color-coded):
    - 4.500 - 5.000: Outstanding (green)
    - 3.500 - 4.499: Very Satisfactory (blue)
    - 2.500 - 3.499: Satisfactory (yellow)
    - 1.500 - 2.499: Unsatisfactory (orange)
    - below 1.500: Poor (red)
  - Status `Badge`: draft → pending → approved
  - Reviewer and approver fields via `Select`
  - Approval/rejection `Button` actions with `Dialog` for rejection reason

### 7.3 IPCR Integration

- [ ] NOSI eligibility requires at least "Satisfactory" IPCR
- [ ] Performance history viewable on employee profile

### 7.4 Deliverables Checklist — Phase 7

- [ ] IPCR period CRUD
- [ ] IPCR rating entry and approval
- [ ] Adjectival rating auto-mapping
- [ ] Integration with NOSI eligibility

---

## Phase 8: Dashboard & Reports

**Goal:** Build the main dashboard and compliance-ready reports.

### 8.1 Dashboard

- [ ] `/dashboard` — Role-specific dashboard:
  - **All roles**: Welcome `Card` with greeting and quick-link `Button` grid
  - **Admin/HR**:
    - Stat `Card` grid: Total employees (by type in `Badge`), pending approvals count
    - Employees per department — shadcn `Chart` (bar)
    - Upcoming step increments (next 90 days) in `<DataTable>` (compact variant)
    - Pending approvals: `Tabs` (Leaves | NOSI | NOSA) each with `<DataTable>` (compact variant)
    - Recent hires / separations in `Card` list
  - **Dept Head**:
    - Stat `Card`: department employee count, pending leaves count
    - Department pending leaves `<DataTable>` (compact variant)
    - IPCR completion `Progress` bar
  - **Employee**:
    - Leave balances in `Card` grid (per leave type)
    - Pending applications `Table`
    - Next step increment date in `Card`
    - Latest IPCR rating in `Card` with `Badge`

### 8.2 Charts & Visualizations

- [ ] Use shadcn `Chart` component (built on Recharts):
  - Employee count by department — `BarChart`
  - Employee count by type — `PieChart`
  - Monthly attendance summary — `LineChart`
  - Leave utilization — stacked `BarChart`
  - All charts wrapped in shadcn `Card` with `CardHeader`, `CardTitle`, `CardContent`

### 8.3 Reports Module

- [ ] `/reports` page with report catalog:
  - **Plantilla Report**: All plantilla positions with incumbent data
  - **Leave Ledger**: Per-employee leave transaction history
  - **Service Record**: Per-employee CSC format
  - **Salary History**: Per-employee salary changes
  - **NOSI Summary**: All NOSI records for a given period
  - **NOSA Summary**: All NOSA records for a given period
  - **DTR Summary**: Monthly attendance summary
  - **IPCR Summary**: Performance ratings by period
  - **Audit Trail**: System activity log (COA compliance)
- [ ] Each report:
  - Filter parameters: date range (`Date Picker`), department (`Select`), employee (`Command` combobox)
  - Filters in `Collapsible` panel
  - Preview in-browser using `<DataTable>` (with export toolbar)
  - Export buttons: PDF `Button`, CSV `Button` (with icons)
- [ ] Audit trail report:
  - Filter by user, action, table, date range
  - Shows: who did what, when, to which record

### 8.4 Deliverables Checklist — Phase 8

- [ ] Dashboard with role-specific widgets
- [ ] Charts and visualizations
- [ ] All reports generating correctly
- [ ] PDF and CSV export for all reports
- [ ] Audit trail accessible

---

## Phase 9: Polish, Security & Production Readiness

**Goal:** Harden the system, add finishing touches, and prepare for deployment.

### 9.1 Security Hardening

- [ ] Verify all RLS policies with test cases
- [ ] Add rate limiting on API routes
- [ ] Input sanitization on all forms
- [ ] CSRF protection (built into Next.js)
- [ ] Validate file upload types and sizes server-side
- [ ] Ensure no sensitive data in client-side bundles
- [ ] Add Content Security Policy headers

### 9.2 Audit Logging Enhancement

- [ ] Database triggers for automatic audit logging on INSERT/UPDATE/DELETE
- [ ] Log all login attempts (success and failure)
- [ ] Log all document downloads
- [ ] Log all report exports
- [ ] COA-ready format: who, what, when, where

### 9.3 UI/UX Polish

- [ ] Loading states using shadcn `Skeleton` for all data-fetching pages (table rows, cards, form fields)
- [ ] Error boundaries and error pages (404, 500, unauthorized) using `Card` with error illustration
- [ ] `Sonner` toast notifications for all actions (success, error, warning)
- [ ] Confirmation `Alert Dialog` for all destructive actions
- [ ] Responsive layout: desktop-first, shadcn `Sheet` for mobile nav, responsive `Card` grid
- [ ] Print-friendly styles for reports (hide shadcn chrome, full-width tables)
- [ ] Keyboard navigation: shadcn components have built-in a11y, verify tab order and focus rings

### 9.4 System Configuration

- [ ] `/admin/settings` page:
  - Sections in `Card` containers with `Separator` dividers
  - LGU name (`Input`) and logo upload (`Button`) — used in PDF headers
  - Standard work hours (`Input` time type)
  - Grace period for attendance (`Input` number)
  - Leave credit provisioning rules (`Form` with `Input` fields)
  - NOSI eligibility years (`Input` number)
  - Save per-section with `Button`, `Sonner` toast on success
- [ ] Store in a `system_settings` key-value table

### 9.5 Deployment

- [ ] Configure Vercel (or preferred host) for Next.js deployment
- [ ] Set environment variables in production
- [ ] Configure Supabase production project
- [ ] Set up Supabase Storage buckets with proper policies
- [ ] Enable Supabase backups
- [ ] Set up custom domain (if applicable)
- [ ] SSL/TLS verification

### 9.6 Deliverables Checklist — Phase 9

- [ ] All RLS policies verified
- [ ] Audit logging comprehensive
- [ ] UI polished with loading states and error handling
- [ ] System configuration page working
- [ ] Production deployment complete

---

## Phase Checklist

Mark each phase with `[X]` when completed.

### Phase 1 — Foundation & Database Schema
- [ ] **Status:** Not Started
- **Model:** `claude-opus-4-6`
- **Rationale:** Architecture decisions, complex SQL schema with 16+ tables, RLS policies with security implications, enum design, trigger functions, and seed data. This phase sets the foundation everything else depends on — mistakes here cascade through every module. Opus's stronger reasoning catches edge cases in FK relationships, RLS policy gaps, and schema normalization.
- **Key Outputs:** Next.js project, full PostgreSQL schema, RLS policies, seed data, TypeScript types

### Phase 1.1b — Layout Design (`/frontend-design` skill)
- [ ] **Status:** Not Started
- **Model:** `claude-opus-4-6`
- **Rationale:** The `/frontend-design` skill produces the best results with Opus. This generates the entire application shell (sidebar, header, dashboard layout, login page) with production-grade design quality. A polished first layout sets the visual standard for all subsequent module pages. Doing this cheaply leads to a generic look that's hard to fix later.
- **Key Outputs:** Authenticated layout, login page, dashboard skeleton, design tokens, color scheme

### Phase 2 — Authentication & User Management
- [ ] **Status:** Not Started
- **Model:** `claude-opus-4-6`
- **Rationale:** Security-critical phase. Google OAuth integration, email-based access gating, session management, RLS enforcement at the application layer, and role-based route protection. Auth bugs are the most costly — a flaw here can expose the entire system. Opus is better at reasoning about auth edge cases (race conditions, session hijacking, email spoofing).
- **Key Outputs:** Google OAuth login, email access control, user CRUD (super admin), role-based sidebar

### Phase 3 — Employee Management & 201 Files
- [ ] **Status:** Not Started
- **Model:** `claude-sonnet-4-6`
- **Rationale:** Standard CRUD patterns following the `<DataTable>`, shadcn `Form`, and layout patterns established in Phases 1-2. Employee list, profile tabs, create/edit forms, document uploads. Well-defined requirements with no ambiguity. Sonnet handles repetitive CRUD generation efficiently and follows established patterns reliably.
- **Key Outputs:** Employee CRUD, `<DataTable>` with filters, tabbed profile, 201 file upload, service record generation

### Phase 4 — NOSI & NOSA Modules
- [ ] **Status:** Not Started
- **Model:** `claude-sonnet-4-6`
- **Rationale:** Moderately complex business logic (NOSI eligibility detection based on 3-year rule, salary grade table lookups) but well-scoped. Approval workflows follow a repeatable pattern (draft → pending → approved/rejected). PDF generation is template work. Sonnet handles this level of business logic well, especially since the approval pattern is defined once and reused.
- **Key Outputs:** NOSI auto-detection, NOSI/NOSA CRUD with approval workflow, PDF generation, salary history updates

### Phase 5 — Leave Management
- [ ] **Status:** Not Started
- **Model:** `claude-sonnet-4-6`
- **Rationale:** Leave credit calculations (1.25/month, carry-over, cap checks) and the three-step approval workflow (Employee → Dept Head → HR) follow patterns already built in Phase 4. CSC leave rules are well-documented. Date arithmetic and credit deduction logic are straightforward. Sonnet is efficient here.
- **Key Outputs:** Leave application form, credit tracking, three-step approval, CSC Form 6 PDF, leave ledger

### Phase 6 — Attendance & DTR
- [ ] **Status:** Not Started
- **Model:** `claude-sonnet-4-6`
- **Rationale:** Time entry forms, CSV biometric import with conflict detection, late/undertime minute calculations, and monthly DTR aggregation. Algorithmic but formulaic — the rules (8AM start, 5PM end, grace period) are clear. CSV parsing and DTR PDF generation are well-established patterns. Sonnet handles this cleanly.
- **Key Outputs:** Manual time entry, biometric CSV import, late/undertime calculation, monthly DTR view and PDF

### Phase 7 — Performance Management (IPCR)
- [ ] **Status:** Not Started
- **Model:** `claude-sonnet-4-6`
- **Rationale:** The simplest module — IPCR period CRUD, rating entry (numeric → adjectival mapping), and basic approval. Follows the same `<DataTable>` + `Form` + approval pattern from Phases 4-5. The only integration point (NOSI eligibility check) is a simple query. Sonnet is more than sufficient.
- **Key Outputs:** IPCR period management, rating entry with auto-mapping, approval workflow, NOSI integration

### Phase 8 — Dashboard & Reports
- [ ] **Status:** Not Started
- **Model:** `claude-sonnet-4-6`
- **Rationale:** Data aggregation queries, shadcn `Chart` components (bar, pie, line), role-specific dashboard widgets, and report generation. Repetitive pattern: query data → render in `Card`/`Chart`/`<DataTable>` → export as PDF/CSV. Each report follows the same structure. Sonnet efficiently generates multiple similar components.
- **Key Outputs:** Role-specific dashboard, charts, all compliance reports (Plantilla, leave ledger, salary history, audit trail), PDF/CSV export

### Phase 9 — Polish, Security & Production Readiness
- [ ] **Status:** Not Started
- **Model:** `claude-opus-4-6`
- **Rationale:** Security audit of all RLS policies across 12+ tables, edge case review for approval workflows, production hardening (rate limiting, CSP headers, input sanitization). Opus's stronger reasoning is critical for catching subtle RLS gaps (e.g., a dept head accessing another department's data through a join), identifying missing audit log triggers, and reviewing the full attack surface before deployment.
- **Key Outputs:** RLS policy verification, audit logging triggers, UI polish (skeletons, error pages, toasts), system settings, production deployment

---

### Model Usage Summary

```
Opus  (4 phases):  Phase 1, 1.1b, 2, 9  — Foundation, auth, security, design
Sonnet (6 phases): Phase 3, 4, 5, 6, 7, 8 — CRUD modules, business logic, reports
```

**Cost optimization note:** ~60% of the work runs on Sonnet, keeping costs lower while reserving Opus for the phases where reasoning quality directly impacts system security and architectural integrity.

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| UI Components | **shadcn/ui** | Accessible, composable, customizable primitives built on Radix UI + Tailwind. Not a dependency — components are copied into `components/ui/` and owned by the project |
| Auth | Supabase Auth + Google OAuth | Native integration, handles session management |
| Access control | RLS + email check in user_profiles | Server-enforced, no client-side bypass possible |
| PDF generation | `@react-pdf/renderer` | React-based, supports complex layouts for CSC forms |
| State management | React Server Components + `use` hook | Minimal client state, server-first architecture |
| Data tables | Reusable `<DataTable>` (shadcn `Table` + `@tanstack/react-table`) | Single component used across all CRUD pages. shadcn provides styled primitives, tanstack handles sorting, filtering, pagination. Includes toolbar, faceted filters, row actions, and column visibility |
| Layout design | `/frontend-design` skill | Used to generate the first application shell (sidebar, header, dashboard, login) with production-grade design quality before building module pages |
| Forms | shadcn `Form` + `react-hook-form` + `zod` | shadcn Form wraps react-hook-form with accessible `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage` |
| Dialogs & Modals | shadcn `Dialog`, `Alert Dialog`, `Sheet` | Dialog for forms/info, Alert Dialog for destructive confirmations, Sheet for mobile panels |
| Navigation | shadcn `Sidebar`, `Breadcrumb`, `Navigation Menu` | Sidebar component handles collapsible nav with mobile Sheet, Breadcrumb for page hierarchy |
| Notifications | shadcn `Sonner` (toast) | Built-in toast with success/error/warning variants |
| Styling | Tailwind CSS | Utility-first, rapid development, powers shadcn/ui theming |
| File storage | Supabase Storage | Integrated with RLS, same auth context |

## Implementation Notes

- **Database schema**: All objects live in the custom `hris` schema (not `public`). Supabase clients must set `db: { schema: 'hris' }`. Type generation uses `--schema hris`. The `search_path` is set to `hris, public, auth, extensions` so application queries resolve without explicit prefixing.
- **Employee number format**: `LGU-YYYY-NNNN` (e.g., `LGU-2026-0001`)
- **Salary Grade Table**: Based on Republic Act No. 11466 (SSL 5) and subsequent tranches
- **NOSI eligibility**: 3 years of continuous satisfactory service at current step (CSC rules)
- **Leave credits**: VL and SL earn 1.25 days/month; unused VL/SL are cumulative and convertible to cash upon retirement
- **DTR format**: Follows CSC Memorandum Circular on DTR
- **Audit logs**: Retained indefinitely for COA compliance
- **All dates**: Stored in UTC, displayed in Philippine Standard Time (UTC+8)
