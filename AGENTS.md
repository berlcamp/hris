<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# `.env.local` is the PRODUCTION database

`NEXT_PUBLIC_SUPABASE_URL` in `.env.local` points at the **live hosted Supabase
project**, not a local stack. It ships a service-role key, so anything run with that
env bypasses RLS and touches **real HR records for real employees** — payroll, leave
balances, service records. There is no undo.

**Never destroy or mass-modify production data, and never do it "just to test."** In
particular, do not:

- `DROP` or `TRUNCATE` a table, schema, or database
- `DELETE`/`UPDATE` without a `WHERE` clause you have confirmed narrows to specific rows
- `supabase db push`, `supabase db reset --linked`, or any command aimed at the remote project
- Add, rename, or drop columns directly against the remote to try something out
- Seed, backfill, or bulk-edit rows to manufacture test data
- Write throwaway scripts that import `createAdminClient` and mutate, just to check behaviour

**Test against the local Docker stack instead** — it is isolated on ports 54421/54422
and safe to wipe:

```bash
colima start && npm run db:start   # local stack
npm run db:reset                   # LOCAL only; wipes and reapplies migrations + seed
npm run test:db                    # integration tests against the local stack
npm run test:dtr                   # pure logic tests, no database at all
```

`npm run db:reset` is safe **because** it targets the local stack. The same reset aimed
at the remote is not. Keep it that way — do not link the CLI to the production project.

Reads against production are fine. For anything that writes, ask first. Writing a
migration file under `supabase/migrations/` is always fine — the developer applies it
themselves.
