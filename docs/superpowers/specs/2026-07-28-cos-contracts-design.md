# Contract of Service — Spec 3: Contracts, Templates, Renewal, Timeline, Printing

Date: 2026-07-28
Status: Approved for planning

## Context

COS-1 (`docs/superpowers/specs/2026-07-26-cos-foundation-design.md`) shipped the
COS employee registry, the `cos_manager` role and the `/cos` module shell. It
deliberately left a placeholder on the employee profile page:

> Contract management arrives with the Contracts module.

This spec fills it. COS-3 gives each COS employee a contract history: contracts
with unlimited renewals, reusable boilerplate templates, early termination, and
a printable contract document.

COS-3 is greenfield. Unlike COS-4's payroll, which ports an existing `adm-v26`
screen, `adm-v26` has no contract module — there is nothing to match and nothing
to port except one number-to-words helper.

### COS-2 is folded into this spec

The original five-spec split reserved COS-2 for a "reusable Tiptap rich-text
editor + merge-field system", with COS-3 building on it. That split is
**abandoned**. The editor and the merge-field system are built here, scoped to
contracts, and shipped as one feature.

Rationale: a reusable editor with no second consumer is speculative
generalisation. If a later module wants rich text, the editor lifts out then,
against a real second requirement rather than an imagined one.

COS-2 is now vacant. COS-4 and COS-5 are unaffected — neither depended on it.

### Decisions inherited from COS-1

These were pre-committed and are honoured rather than revisited:

- Server actions live in `cos-contract-actions.ts`, with `createContract` /
  `renewContract` among them.
- A `canManageCosTemplates()` helper exists, distinct from `canManageCos()`.
- Inactive employees cannot receive new contracts. COS-1 established the
  `status` column and recorded that the check belongs in create/renew.
- `cos_employees` uses soft delete specifically so contract history cannot be
  orphaned. Contracts therefore reference it with `ON DELETE RESTRICT`.
- The Contract History card's heading and position on the profile page are
  fixed, so this spec is a drop-in replacement for its body.

## Decisions

| Question | Decision |
|---|---|
| Rich-text editor | Tiptap StarterKit, scoped to COS-3 |
| Body storage | Tiptap JSON (`JSONB`), not HTML |
| Formatting subset | paragraphs, bold, italic, underline, ordered + unordered lists |
| Contract identity | employee + period. **No contract number** |
| Fund source | **Not carried** |
| Signatories | Stored per contract |
| Scope of work | Stored per contract |
| Renewal | New row with a `renewed_from_id` chain |
| Overlapping periods | Blocked by a database exclusion constraint |
| Lifecycle | `active` / `terminated`. **Expired is derived, never stored** |
| Duplicate | Prefilled create form, same employee, nothing written until submit |
| Printing | `@react-pdf/renderer`, matching the twelve existing PDF components |

### Why Tiptap rather than a hand-rolled editor

The formatting subset is small enough that a custom `contentEditable` looks
tempting. It is a trap: `document.execCommand` is deprecated with no
replacement, and selection handling, undo and paste-sanitising across browsers
are where custom editors consume unbounded time. Tiptap is ~150 KB and
well-maintained.

Because the toolbar is the only thing that can author this content, the
converter's input stays a closed, enumerable set — which is what makes the print
path testable.

### Why Tiptap JSON, not HTML

PDFs in this app are produced **client-side** (`await pdf(<Doc/>).toBlob()` —
see `src/components/nosa/nosa-pdf-button.tsx:22` and eight peers). Storing HTML
would put an HTML parser on the print path, and its unit tests would need a DOM
that `node --experimental-strip-types` does not provide.

Tiptap JSON is already a structured ProseMirror tree over a known node
vocabulary. The converter becomes a recursive walk with no parsing, and its
tests are literal objects with no DOM. Same editor, same subset, saner storage.

### Why the template is snapshotted but merge tokens are not resolved

Creating a contract from a template **copies the template's body** into the
contract. Editing a template afterwards never alters a contract already issued —
mandatory for a legal document, which must reproduce what was agreed.

The copied body keeps its merge tokens **unresolved**. Tokens are resolved at
print time against the contract's own columns. This is what makes an edited rate
or corrected date appear on the next printout instead of leaving stale text
frozen into the body.

Rejected: *reference the template by ID and merge at print* — a typo fix would
silently rewrite contracts already signed and filed. *Reference, then snapshot
on first print* — introduces a hidden state transition where a contract's
meaning changes the first time somebody prints it.

### Why Expired is derived

A stored `expired` status needs a scheduled job to stay truthful and drifts the
moment the job fails. `period_end < today` is computed at read time and cannot
be wrong. Only `terminated` — an explicit human act with a date and a reason —
is stored.

## Database schema

One migration, `063_cos_contracts_module.sql`. It follows `058`'s conventions:
soft delete, `cos_manager`-only RLS, `authenticated` revoked to SELECT so every
write must pass through a server action.

`ALTER TYPE ... ADD VALUE` is not needed — COS-3 introduces no new role.

### `hris.cos_contract_templates`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | TEXT NOT NULL | unique among live rows |
| `description` | TEXT | |
| `body` | JSONB NOT NULL | Tiptap document, tokens unresolved |
| `is_active` | BOOLEAN NOT NULL DEFAULT true | drops out of the picker; contracts already created from it are unaffected, since they hold their own snapshot |
| `created_at` / `updated_at` / `created_by` / `updated_by` / `deleted_at` | | as `cos_employees` |

```sql
CREATE UNIQUE INDEX uq_cos_contract_templates_name
  ON hris.cos_contract_templates(lower(btrim(name))) WHERE deleted_at IS NULL;
```

### `hris.cos_contracts`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `cos_employee_id` | UUID NOT NULL | → `cos_employees(id)` `ON DELETE RESTRICT` |
| `period_start` / `period_end` | DATE NOT NULL | `CHECK (period_end >= period_start)` |
| `monthly_rate` | NUMERIC(12,2) | prefilled from the employee, stored per contract |
| `position_title` | TEXT | prefilled from the employee, stored per contract |
| `scope_of_work` | TEXT | |
| `signatory_name` / `signatory_position` | TEXT | |
| `witness_name` / `witness_position` | TEXT | |
| `body` | JSONB NOT NULL | snapshotted from the template, tokens unresolved. Choosing no template is allowed and stores the editor's empty document, never SQL `NULL` — the print path then has one shape to handle instead of two |
| `template_id` | UUID | → `cos_contract_templates(id)` `ON DELETE SET NULL`. Provenance only — never used to render |
| `renewed_from_id` | UUID | → `cos_contracts(id)` `ON DELETE RESTRICT`, **UNIQUE** |
| `status` | TEXT NOT NULL DEFAULT `'active'` | `CHECK (status IN ('active','terminated'))` |
| `terminated_on` | DATE | |
| `termination_reason` | TEXT | |
| `created_at` / `updated_at` / `created_by` / `updated_by` / `deleted_at` | | as `cos_employees` |

`monthly_rate` and `position_title` are copied onto the contract rather than
read through to the employee: both legitimately differ between engagements, and
a printed contract must not change when the registry is later corrected.

Constraints:

```sql
-- Termination date and status move together, in both directions.
CONSTRAINT cos_contracts_termination_consistent CHECK (
  (status = 'terminated') = (terminated_on IS NOT NULL)
),
CONSTRAINT cos_contracts_terminated_within_period CHECK (
  terminated_on IS NULL
  OR (terminated_on >= period_start AND terminated_on <= period_end)
),
-- A contract may be renewed at most once, so a chain cannot fork.
CONSTRAINT uq_cos_contracts_renewed_from UNIQUE (renewed_from_id)
```

### The overlap constraint

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

ALTER TABLE hris.cos_contracts
  ADD CONSTRAINT cos_contracts_no_overlap
  EXCLUDE USING gist (
    cos_employee_id WITH =,
    daterange(period_start, COALESCE(terminated_on, period_end), '[]') WITH &&
  ) WHERE (deleted_at IS NULL);
```

`COALESCE(terminated_on, period_end)` is load-bearing: it releases the unused
tail of a terminated contract so a replacement can start the next day. Without
it, ending someone's contract early would block re-engaging them for the rest of
the original period.

`btree_gist` supplies the `uuid WITH =` operator class; `WHERE (deleted_at IS
NULL)` keeps soft-deleted rows from blocking reuse, matching the partial unique
indexes in 058.

This was verified against local Postgres before being written down. All four
behaviours hold: overlaps rejected, adjacent periods accepted, early termination
frees the tail, soft-deleted rows do not block.

### RLS

Identical in shape to `058`, including the deliberate `REVOKE ALL ... FROM
authenticated` followed by `GRANT SELECT`. Migration 020's default privileges
grant ALL to `authenticated` the instant `CREATE TABLE` runs, so the REVOKE is
required rather than decorative. Writes must go through the server actions,
which hold the soft-delete rule, the `super_admin` delete gate and `logAudit`.

```sql
CREATE POLICY "cos_manager_all_cos_contracts" ON hris.cos_contracts
  FOR ALL USING (
    hris.get_user_role() IN ('super_admin', 'hr_admin', 'cos_manager')
  );
```

The same policy shape applies to `cos_contract_templates`. Template *editing* is
narrowed in the application layer, not in RLS — see below.

## Role and permissions

`canManageCos()` already exists and covers contracts. COS-3 adds the helper
COS-1 named:

```ts
// src/lib/auth-helpers.ts
const COS_TEMPLATE_EDITOR_ROLES: readonly UserRole[] = [
  "super_admin",
  "hr_admin",
] as const;

export function canManageCosTemplates(
  role: UserRole | null | undefined,
): boolean {
  return !!role && COS_TEMPLATE_EDITOR_ROLES.includes(role);
}
```

COS-1's requested permission list separated "Manage Templates" and "Edit
Templates" from "Create Contracts", which reads as templates being the narrower
privilege. A `cos_manager` therefore *uses* templates when creating contracts
but cannot rewrite the legal boilerplate. This mirrors `canManageSalaryGrades`,
where `hr_record_manager` reaches the page but cannot edit the table.

Destructive deletes stay `super_admin`-only throughout, matching COS-1.

## Server actions

Two files under `src/lib/actions/`, `"use server"`, admin client, each calling
its permission helper first and `logAudit()` after every write, then
`revalidatePath()`. Both funnel reads through a single private `baseQuery()`
applying `.schema("hris")` and `.is("deleted_at", null)`, exactly as
`cos-employee-actions.ts` does, so the soft-delete filter cannot be forgotten at
a call site.

### `cos-contract-actions.ts`

| Action | Notes |
|---|---|
| `getCosContracts(filters?)` | optional employee / status / period filters; derived expiry computed on read |
| `getCosContract(id)` | joins employee and template name |
| `getContractsForEmployee(employeeId)` | ordered oldest-first; drives the profile timeline |
| `createCosContract(input)` | rejects inactive employees; snapshots the chosen template's body |
| `updateCosContract(id, input)` | same validation; cannot change `cos_employee_id` |
| `renewCosContract(id, input)` | inserts a new row with `renewed_from_id = id` |
| `terminateCosContract(id, input)` | sets `status`, `terminated_on`, `termination_reason` |
| `deleteCosContract(id)` | `super_admin` only; sets `deleted_at` |

### `cos-contract-template-actions.ts`

`getCosContractTemplates`, `getCosContractTemplate`, `createCosContractTemplate`,
`updateCosContractTemplate`, `deleteCosContractTemplate` — the last
`super_admin` only. All gated on `canManageCosTemplates` except the two reads,
which use `canManageCos` so contract authors can populate the template picker.

### Business rules and where each is enforced

| Rule | Enforcement |
|---|---|
| Inactive employee gets no new contract | `createCosContract`, `renewCosContract` |
| No overlapping periods for one employee | DB exclusion constraint; `23P01` mapped to a field error on `period_start` |
| A contract is renewed at most once | `UNIQUE (renewed_from_id)`; `23505` mapped to a field error |
| Renewal starts after the source's effective end | Action-level check before insert. "Effective end" means `COALESCE(terminated_on, period_end)` — the same expression the exclusion constraint uses, so the friendly check and the database can never disagree |
| `terminated_on` falls inside the period | DB `CHECK` plus an action-level check for the friendly message |
| An already-terminated contract cannot be terminated again | Action-level check |
| `period_end >= period_start` | DB `CHECK` plus zod |

Database errors are never surfaced raw. Each mapped code returns
`{ error, field }` in the shape `createCosEmployee` already uses for duplicate
`cos_no`, so the forms can attach messages to the offending input.

## UI

### Routes

```
src/app/(dashboard)/cos/contracts/page.tsx            list
src/app/(dashboard)/cos/contracts/loading.tsx         skeleton
src/app/(dashboard)/cos/contracts/new/page.tsx        create
src/app/(dashboard)/cos/contracts/[id]/page.tsx       detail + print
src/app/(dashboard)/cos/contracts/[id]/edit/page.tsx  edit
src/app/(dashboard)/cos/templates/page.tsx            list
src/app/(dashboard)/cos/templates/new/page.tsx        create
src/app/(dashboard)/cos/templates/[id]/edit/page.tsx  edit
```

Server components, guarded `getCurrentUser()` → role helper →
`redirect("/dashboard")`. Route params and `searchParams` are async in Next 16 —
await before destructuring.

### Sidebar

Two items join the existing Contract of Service group:

```
Contract of Service
  ├─ COS Employees      /cos/employees    (COS-1)
  ├─ Contracts          /cos/contracts    icon: FileText
  └─ Contract Templates /cos/templates    icon: LayoutTemplate
```

Contracts is gated on `cosRoles`; Contract Templates on the narrower editor list.

### Contract list

Composes the existing `<DataTable>` — no bespoke table. Columns in
`src/components/tables/columns/cos-contract-columns.tsx`: employee name, period,
monthly rate, status badge, actions. Faceted filters on status and department;
search over employee name and COS no.

The status badge renders the derived state, not the column: `Terminated` when
`status = 'terminated'`, else `Expired` when `period_end < today`, else `Active`.
One helper in `src/lib/cos-constants.ts` computes it so list, detail and
timeline cannot disagree.

### Contract form

One `cos-contract-form.tsx` for create and edit, shadcn `Form` +
react-hook-form + `zodResolver`, in `Card` sections: Employee & Period, Terms,
Signatories, Contract Body.

The employee `Select` lists active employees only, and is disabled on edit.
Choosing a template loads its body into the editor; changing template afterwards
warns that unsaved body edits will be replaced.

### Editor

`src/components/cos/cos-rich-text-editor.tsx` — Tiptap `useEditor` with
StarterKit trimmed to paragraphs and both list types, plus the Underline
extension. Toolbar: bold, italic, underline, bullet list, ordered list. Nothing
else is exposed, because nothing else can print.

A merge-field menu inserts tokens at the cursor. Tokens are plain text inside
the document, so they survive round-tripping without a custom Tiptap node.

### Employee profile timeline

The Contract History card body is replaced. Contracts render oldest-first as a
chain — original, then each renewal indented beneath its predecessor — each row
showing period, monthly rate, derived status badge, and View / Print / Renew /
Duplicate actions. Renew is hidden when the contract is already renewed or
terminated. The empty state keeps COS-1's copy for employees with no contracts.

"New Contract" is disabled for an inactive employee, with the reason in a
tooltip, matching the rule COS-1 recorded.

## Printing

`src/components/pdf/cos-contract-pdf.tsx` (the document) and
`src/components/cos/cos-contract-pdf-button.tsx` (a client component calling
`pdf(...).toBlob()`), following the existing pattern in
`src/components/nosa/nosa-pdf-button.tsx`.

Two pure helpers hold the logic, so both are testable without a browser:

### `src/lib/cos-merge-fields.ts`

Resolves tokens against the contract and its employee:

| Token | Source |
|---|---|
| `{{employee_name}}` | `formatCosEmployeeName` from COS-1 |
| `{{employee_first_name}}` / `{{employee_last_name}}` | employee |
| `{{cos_no}}` | employee |
| `{{position}}` | contract `position_title` |
| `{{department}}` | employee's department name |
| `{{address}}` | employee |
| `{{period_start}}` / `{{period_end}}` | contract, formatted `MMMM d, yyyy` |
| `{{monthly_rate}}` | contract, formatted PHP currency |
| `{{monthly_rate_words}}` | `numberToWords`, ported from `adm-v26/lib/pdf/generatePRUnspsc.ts` |
| `{{scope_of_work}}` | contract |
| `{{signatory_name}}` / `{{signatory_position}}` | contract |
| `{{witness_name}}` / `{{witness_position}}` | contract |
| `{{today}}` | render date |

An unresolved token renders as an empty string, never as the raw `{{...}}`.
`numberToWords` is ported **once** into hris — it is duplicated across two files
in `adm-v26`, and that duplication is not carried over.

### `src/lib/cos-contract-doc.ts`

Walks the Tiptap JSON and emits `@react-pdf/renderer` primitives:

| Tiptap node/mark | react-pdf output |
|---|---|
| `paragraph` | `<Text>` with paragraph spacing |
| `bold` / `italic` / `underline` | `<Text>` with the matching `fontWeight` / `fontStyle` / `textDecoration` |
| `bulletList` / `orderedList` + `listItem` | `<View>` rows with a bullet or index gutter |
| `text` | string content, with merge fields already resolved |

Unknown node types are **dropped, not thrown on**, so a document authored before
a toolbar change still prints rather than failing at the worst moment.

## Verification

In the order CLAUDE.md prescribes, most valuable first.

1. **Real-stack test** — `supabase/tests/cos-contracts.test.mts` against local
   PostgREST + Postgres:
   - the exclusion constraint rejects an overlap for the same employee
   - adjacent periods (`end`, then `end + 1 day`) are accepted
   - terminating early frees the tail: a contract starting after
     `terminated_on` is accepted
   - a soft-deleted contract does not block reusing its period
   - two employees may hold contracts over the same dates
   - `UNIQUE (renewed_from_id)` rejects renewing one contract twice
   - the termination `CHECK`s reject `status='terminated'` without a date, a
     date without the status, and a date outside the period
   - `ON DELETE RESTRICT` blocks a hard `DELETE` of an employee who holds a
     contract. The app never issues one — `deleteCosEmployee` soft-deletes — so
     this asserts the backstop that makes that discipline safe, not a code path
   - soft-deleting an employee leaves their contracts readable, so history
     survives the registry row being retired
   - soft-deleted contracts are absent from list and single reads
2. **Pure unit tests** — `supabase/tests/cos-contract-unit.test.mts`:
   - merge-field resolution, including null/missing values and unknown tokens
   - `numberToWords` at 0, 1, 999, 1,000, 1,000,000 and two-decimal centavos
   - the JSON walk over every supported node and mark, nested lists, and an
     unknown node type
   - the derived-status helper at the Active / Expired / Terminated boundaries,
     including `period_end` exactly today
3. `npm run lint && npm run build`.

Both new test files are wired into the `test:cos-db` and `test:cos` npm scripts
alongside COS-1's.

Migration files are written, not applied — the developer applies them to
production directly.

## Files

| New file | Mirrors |
|---|---|
| `supabase/migrations/063_cos_contracts_module.sql` | `058_cos_module_foundation.sql` |
| `src/lib/actions/cos-contract-actions.ts` | `cos-employee-actions.ts` |
| `src/lib/actions/cos-contract-template-actions.ts` | `cos-employee-actions.ts` |
| `src/lib/validations/cos-contract-schema.ts` | `cos-employee-schema.ts` |
| `src/lib/cos-merge-fields.ts` | new |
| `src/lib/cos-contract-doc.ts` | new |
| `src/components/cos/cos-rich-text-editor.tsx` | new |
| `src/components/cos/cos-contract-form.tsx` | `cos-employee-form.tsx` |
| `src/components/cos/cos-contract-timeline.tsx` | new |
| `src/components/cos/cos-contract-pdf-button.tsx` | `nosa-pdf-button.tsx` |
| `src/components/cos/cos-template-form.tsx` | `cos-employee-form.tsx` |
| `src/components/pdf/cos-contract-pdf.tsx` | `nosa-pdf.tsx` |
| `src/components/tables/columns/cos-contract-columns.tsx` | `cos-employee-columns.tsx` |
| `src/components/tables/columns/cos-template-columns.tsx` | `cos-employee-columns.tsx` |
| 8 route files under `src/app/(dashboard)/cos/` | COS-1 peers |

Modified: `src/lib/auth-helpers.ts` (`canManageCosTemplates`),
`src/lib/cos-constants.ts` (contract statuses, derived-status helper),
`src/components/layout/app-sidebar.tsx` (two items),
`src/app/(dashboard)/cos/employees/[id]/page.tsx` (timeline replaces the
placeholder), `src/lib/database.types.ts` (regenerated), `package.json`
(Tiptap dependencies, test scripts).

## Out of scope

- COS payroll, OBR printing, and the `/cos-payroll` teardown (COS-4)
- Hiding `employment_type = 'cos'` from `/employees` (COS-4)
- Dashboard statistics and contract-expiry notifications (COS-5)
- Per-user permission grants (separate spec, if wanted)
- Contract numbering and fund source — explicitly excluded, not deferred
- Tables, headings and alignment in the editor — outside the agreed subset
- E-signature or approval workflow
