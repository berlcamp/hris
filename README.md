# LGU HRIS

Human Resource Information System for an LGU, built on Next.js 16 and Supabase
(Postgres + Auth). Every table lives in the `hris` schema. Architecture and
conventions are in [`CLAUDE.md`](CLAUDE.md); the database rules are in
[`AGENTS.md`](AGENTS.md).

## Local development

You work against a **local Supabase stack running in Docker**, never against the
hosted project. The hosted database holds real employee records, and none of the
steps below need it.

### Prerequisites

- **Node 22.** Run `nvm use` (the repo has an `.nvmrc`). The tests rely on
  `--experimental-strip-types`.
- **Docker.**
  - macOS: [Colima](https://github.com/abiosoft/colima) (`brew install colima docker`),
    or Docker Desktop.
  - Windows: Docker Desktop with the WSL 2 backend. Run the commands from WSL.
  - Linux: Docker Engine.

  Give Docker at least 4 GiB of memory.

You don't need to install the Supabase CLI globally. It's a devDependency, and the
`npm run db:*` scripts use it.

### First-time setup

```bash
npm install

colima start          # macOS + Colima only; skip if you use Docker Desktop
npm run db:start      # first run pulls the images, which takes a few minutes
npm run db:reset      # applies every migration in supabase/migrations + supabase/seed.sql

cp .env.example .env.development.local
npx supabase status   # copy ANON_KEY and SERVICE_ROLE_KEY into .env.development.local

npm run dev
```

Don't create a `.env.local`. On the main developer's machine that file points at
production, and you shouldn't have one at all.

### Signing in locally

Google sign-in can't reach a Supabase project on `127.0.0.1`, so the local stack
uses a password route instead. Open:

**http://localhost:3000/api/auth/dev-login**

It lists every active account; click one to sign in as that user. The seed creates
one account per core role, and all of them use the password `localdev`:

| Email                 | Role              |
| --------------------- | ----------------- |
| `admin@lgu.gov.ph`    | `super_admin`     |
| `hr@lgu.gov.ph`       | `hr_admin`        |
| `depthead@lgu.gov.ph` | `department_head` |
| `employee@lgu.gov.ph` | `employee`        |

The route only works when `NEXT_PUBLIC_SUPABASE_URL` points at `127.0.0.1` or
`localhost` **and** `DEV_LOGIN_PASSWORD` is set. Anywhere else it returns 404.

To test another role (`dtr_manager`, `jo_manager`, …), sign in as `admin@lgu.gov.ph`
and add a user under **Admin → Users**. If you then want to sign in as that user,
add a matching `auth.users` row to `supabase/seed.sql`, following the existing ones.

### Ports

The stack uses non-default ports so it can run next to other Supabase projects:

| Service  | Port    |
| -------- | ------- |
| API      | `54421` |
| Postgres | `54422` |

Connect to the database directly at
`postgresql://postgres:postgres@127.0.0.1:54422/postgres`.

Studio, Realtime, Storage, Edge Functions and Analytics are disabled in
`supabase/config.toml` to keep memory use down. (Analytics also breaks under
Colima.) Use `psql` or any Postgres client instead of Studio.

### Day-to-day commands

```bash
npm run dev        # app on http://localhost:3000
npm run db:reset   # wipe the local DB and rebuild it from migrations + seed
npm run db:stop    # stop the stack (data is kept until the next reset)
npm run db:new <name>   # scaffold a migration; rename it to the next NNN_ prefix
npm run db:types   # regenerate src/lib/database.types.ts from the local DB

npm run test:dtr   # pure unit tests, no database needed
npm run test:db    # integration tests; the local stack must be running
npm test           # everything

npm run lint && npm run build   # run both before opening a PR
```

### Database changes

- Add a new file under `supabase/migrations/` that continues the `NNN_` numbering.
  Start it with `SET search_path TO hris, public, auth, extensions;`.
- Run `npm run db:reset` to make sure every migration applies cleanly from scratch.
- Never edit a migration that has already been merged. Write a new one instead.
- Production migrations are applied by the maintainer. Never run `supabase db push`
  or link the CLI to the hosted project.

### Troubleshooting

- **`db:start` says a port is already allocated.** Another Supabase stack or a local
  Postgres is using 54421/54422. Stop it, or run `npx supabase stop --all`.
- **`db:reset` fails at migration 012/013/048.** Make sure
  `0115_local_legacy_staging_stubs.sql` is present; it creates the legacy staging
  tables those migrations import from.
- **The dev-login page returns 404.** Check `.env.development.local`: the URL has to
  be `http://127.0.0.1:54421` and `DEV_LOGIN_PASSWORD` has to be set. Restart
  `npm run dev` after changing env files.
- **Dev sign-in fails with "Invalid login credentials".** `DEV_LOGIN_PASSWORD` doesn't
  match the seeded password (`localdev`), or you haven't run `npm run db:reset` since
  pulling the new seed.
- **Queries come back empty.** You probably left out `.schema("hris")` before
  `.from(...)`.
