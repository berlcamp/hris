@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

- **Next.js 16.2** (App Router, React 19) — note Next 16 breaking changes; the local `node_modules/next/dist/docs/` is the source of truth
- **Supabase** (Postgres + Auth + Storage) — all HRIS tables live in a custom `hris` schema, not `public`
- **TypeScript strict**, path alias `@/*` → `./src/*`
- **Tailwind v4** (PostCSS, no tailwind.config; tokens in `src/app/globals.css`)
- **shadcn/ui** style `base-nova`, neutral base, lucide icons; UI primitives auto-generated under `src/components/ui/` (do not hand-edit)
- **react-hook-form + zod** for all forms (schemas in `src/lib/validations/`)
- **@tanstack/react-table** wrapped by reusable `<DataTable>` (`src/components/tables/data-table.tsx`)
- **@react-pdf/renderer** for printable docs (`src/components/pdf/`)

## Commands

```bash
npm run dev      # next dev
npm run build    # next build
npm run start    # next start (serves the built app)
npm run lint     # eslint (flat config, eslint-config-next core-web-vitals + typescript)
```

### Local Supabase stack (Docker) + tests

Requires **Node 22** (`nvm use` — the tests use `--experimental-strip-types`) and Docker
via **Colima** (`colima start`, no Docker Desktop / no sudo). The Supabase CLI is a
devDependency, so `npm run db:*` resolves it from `node_modules/.bin`.

```bash
colima start && npm run db:start   # start the local stack
npm run db:reset                   # apply all migrations + supabase/seed.sql
npm run test:dtr                   # pure unit tests (no stack needed)
npm run test:db                    # real Postgres + PostgREST (stack must be up)
npm test                           # both
```

Verification order, most valuable first:

1. **Real stack** (`supabase/tests/*.test.mts`) — exercises the actual code path against
   real PostgREST + Postgres. The only way to catch serialization/timezone bugs that
   reasoning about SQL cannot see (migration 035 exists because one bit this project).
2. **Pure unit tests** for date/time logic in `src/lib/attendance-schedule.ts` — fast and
   where the DTR bucketing rules belong.
3. `npm run lint && npm run build` before closing any change.

**This project runs on non-default ports** (API `54421`, DB `54422`) so it can coexist
with the sibling `prime-hrm-2` stack in the same Colima VM. Studio, Realtime, Storage,
Edge Runtime and Analytics are **disabled** in `config.toml`: two stacks do not fit in
8 GiB, and Analytics' `vector` container cannot bind-mount Colima's Docker socket
(`operation not supported`) and takes the whole stack down with it.

`supabase/migrations/0115_local_legacy_staging_stubs.sql` creates the four `public.*`
legacy staging tables (`adm_employees`, `hr_service_records`,
`hr_service_records_activity_log`, `hr_plantilla`) that migrations 012/013/048 import
from. They exist in production only, so without the stubs `db reset` dies at 012. Every
statement is `CREATE TABLE IF NOT EXISTS`, so it is a **no-op in production**.

Database migrations are SQL files under `supabase/migrations/` numbered `NNN_*.sql`. They are not auto-run by the app. **The developer applies migrations to production directly and immediately — your job is done once the migration file is written. Do NOT suggest `supabase db push`, the Supabase CLI/dashboard, or any other "apply this migration" step; do not add reminders to run it.** New migrations must keep the numeric prefix sequence and start with `SET search_path TO hris, public, auth, extensions;` when they touch the `hris` schema.

To regenerate DB types: `supabase gen types typescript --schema hris > src/lib/database.types.ts` (the in-repo `src/lib/types.ts` is a hand-maintained mirror used by app code).

## Next 16 conventions that bite

This project uses the new Next 16 file/API conventions. Old habits will break things:

- **`src/proxy.ts`, not `middleware.ts`** — the `middleware` convention is deprecated and renamed to `proxy`. Export a `proxy()` function (not `middleware()`); auth-session refresh lives there via `updateSession` from `src/lib/supabase/middleware.ts`.
- `cookies()` and `headers()` are async — `await` them (see `src/lib/supabase/server.ts`).
- Route handlers, page params, and `searchParams` are all async in App Router; await before destructuring.
- Before adding any new framework-level file or API, read the corresponding doc under `node_modules/next/dist/docs/` and respect deprecation notices.

## Architecture

### Auth and authorization

- Login is **Google OAuth via Supabase**. The OAuth callback at `src/app/auth/callback/route.ts` exchanges the code, then checks `hris.user_profiles` is_active for the email — users are allowlisted by row, **not by self-signup**. Unlisted/inactive users are signed out and redirected to `/login?error=unauthorized`.
- Route protection happens in `src/proxy.ts` → `updateSession` (`src/lib/supabase/middleware.ts`). It refreshes the session, redirects unauthenticated users away from non-public routes, and bounces authenticated users away from `/login`.
- Role model: `super_admin | hr_admin | department_head | employee` (see `src/lib/types.ts`). Role-based UI gating lives in `src/components/layout/app-sidebar.tsx` (per-item `roles: UserRole[]`).
- **Server-side identity**: always go through `getCurrentUser()` (`src/lib/actions/auth-actions.ts`) or `getServerUser()` (`src/lib/auth.ts`). Both fetch the auth user, then look up `hris.user_profiles` by email using the **admin client** (bypassing RLS) so the join works even for the user's own profile row.

### Three Supabase clients — pick deliberately

| File | Use when |
|---|---|
| `src/lib/supabase/client.ts` | Client components only (browser session) |
| `src/lib/supabase/server.ts` | Server components / route handlers / actions that should run as the signed-in user under RLS |
| `src/lib/supabase/admin.ts` | Server actions that need to bypass RLS (allowlist checks, audit log inserts, cross-department reads). Uses `NEXT_PUBLIC_SERVICE_ROLE_KEY` — **never import from a client component** |

Most server actions in `src/lib/actions/*.ts` use the **admin client** and re-implement role-based filtering in TypeScript (e.g. `if (user.role === "department_head") query.eq("department_id", user.departmentId)`). Don't switch one to the user-scoped server client without auditing all queries against the RLS policies in `supabase/migrations/007_rls_policies.sql`.

### `hris` schema, not `public`

Every Supabase query must call `.schema("hris")` before `.from(...)`. The DB-level `search_path` is set to `hris, public, auth, extensions`, but the JS client does **not** honor that — omitting `.schema("hris")` silently queries `public` and returns empty/errors.

### Server actions are the data layer

All mutations and most reads go through server actions in `src/lib/actions/` (each file has `"use server"` at the top), grouped by domain (`employee-actions`, `nosi-actions`, `nosa-actions`, `leave-actions`, `leave-accrual-actions`, `attendance-actions`, `ipcr-actions`, `plantilla-actions`, `salary-grade-actions`, `salary-csv-import-actions`, `leave-credits-csv-import-actions`, `service-record-actions`, `document-actions`, `dashboard-actions`, `audit-actions`, `user-actions`, `settings-actions`, `auth-actions`, `employee-id-generator-actions`). Pages are mostly server components that call these actions directly; client components import them and call them from form handlers. After writes, call `revalidatePath(...)` for affected routes.

Audit trail: any mutating action should call `logAudit()` from `src/lib/audit.ts` after the write. It uses the admin client and swallows errors so a failed audit never breaks the main flow — keep that property.

### Domain modules (LGU HRIS)

Routes under `src/app/(dashboard)/` map 1:1 to HR domains: `employees`, `plantilla` (positions), `nosi` (Notice of Step Increment), `nosa` (Notice of Salary Adjustment), `leaves` (+`/credits`, `/apply`), `attendance` (+`/dtr`, `/entry`), `performance` (IPCR), `reports/*`, `admin/*` (users, salary-grades, salary-import, leave-credits-import, ipcr-periods, audit-log, settings). Components mirror this grouping under `src/components/<domain>/`, table column defs under `src/components/tables/columns/`, and zod schemas under `src/lib/validations/`.

Salary/NOSI mechanics worth knowing before editing:
- `NOSI_BASIS_SALARY_REASONS` in `src/lib/constants.ts` lists the salary-history reasons that **reset the "years in step" clock**. Logic that computes NOSI eligibility uses the latest `effective_date` across those reasons — don't add a new reason without updating that list.
- `salary_history` is the source of truth; `employees.salary_grade`/`step_increment` mirror the latest entry.
- Leave credits use a `leave_credit_accruals` ledger (migration 015) — `addLedgerEntry` in `src/lib/leave-credits-helpers.ts` is the single insert point, with idempotency keys for monthly accrual and CSV imports.

### Reusable `<DataTable>` is the table convention

Every CRUD list page composes `DataTable` (`src/components/tables/data-table.tsx`) with column defs from `src/components/tables/columns/<domain>-columns.tsx`. Don't build bespoke tables for new modules — add a columns file and reuse.

## Conventions

- Page route group `(dashboard)` shares the auth-required layout (`src/app/(dashboard)/layout.tsx`) with `SidebarProvider`/`AppSidebar`; `(auth)` is the unauthenticated shell.
- Use `cn()` from `src/lib/utils.ts` for class merging.
- Toasts: `sonner`. Confirmations: shadcn `AlertDialog`. Forms: shadcn `Form` + react-hook-form + zod resolver.
- CSV parsing for imports: `src/lib/parse-csv.ts` (handles quoted fields).
- Names/identity: legacy datasets use messy name formats — see `src/lib/employee-name-match.ts` and `src/lib/actions/employee-id-generator-actions.ts` for the matching/normalization helpers; reuse rather than re-invent.
- Security headers (X-Frame-Options DENY, HSTS, etc.) are set in `next.config.ts` — keep them when editing config.

## Environment

`.env.local` requires:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SERVICE_ROLE_KEY` (despite the `NEXT_PUBLIC_` prefix this is **only** read from server code via `createAdminClient`; never reference it from a `"use client"` module)
