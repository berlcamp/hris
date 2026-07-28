// Tiptap (ProseMirror) JSON -> flat printable blocks.
//
// Emits plain data, NOT react-pdf elements. That is deliberate: keeping this
// free of JSX lets supabase/tests/cos-contract-unit.test.mts import it under
// `node --experimental-strip-types` with no React renderer and no DOM.
// src/components/pdf/cos-contract-pdf.tsx maps the blocks to <Text>/<View>.
//
// The supported vocabulary is exactly what the editor's toolbar can author:
// paragraphs, bold/italic/underline, bulleted and numbered lists. Anything else
// is DROPPED rather than thrown on, so a document authored before a toolbar
// change still prints instead of failing at the worst possible moment. The one
// deliberate exception is hardBreak (see toRuns): dropping it outright would
// silently run the surrounding text together rather than merely losing
// styling, so it gets an explicit substitute instead of being dropped.

import { resolveMergeFields, type MergeContext } from "./cos-merge-fields.ts";
// Type-only: erased entirely by `node --experimental-strip-types`, so this
// adds no runtime dependency for supabase/tests/cos-contract-unit.test.mts.
import type { ContractBody } from "./validations/cos-contract-schema.ts";

export interface TiptapNode {
  type: string;
  content?: TiptapNode[];
  text?: string;
  marks?: { type: string }[];
  attrs?: Record<string, unknown>;
}

export interface ContractRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

export interface ContractBlock {
  kind: "paragraph" | "listItem";
  /** "•", "1.", … for list items; null for paragraphs. */
  marker: string | null;
  runs: ContractRun[];
}

/**
 * react-pdf style for one run's bold/italic/underline flags. Pulled out of
 * src/components/pdf/cos-contract-pdf.tsx (the only consumer) so this exact
 * logic can be exercised by a render smoke test under
 * `node --experimental-strip-types`, which cannot parse that file's JSX.
 *
 * fontFamily is always "Times-Roman", never "Times-Bold": @react-pdf/font
 * registers "Times-Roman" as a full four-member family (Roman/Bold/Italic/
 * BoldItalic) selected via fontWeight/fontStyle, but "Times-Bold" is a
 * separate backwards-compat family registered with fontStyle "normal" ONLY
 * (@react-pdf/font/lib/index.browser.js). A run that is both bold and
 * italic previously asked FontFamily.resolve() for
 * {fontFamily:"Times-Bold", fontStyle:"italic"}, which does not exist in
 * that family and THROWS instead of falling back — verified live: plain/
 * italic/bold each resolved, bold+italic threw "Could not resolve font for
 * Times-Bold, fontWeight 400, fontStyle italic". Driving weight/style
 * against the "Times-Roman" family resolves all four combinations,
 * including bold+italic -> Times-BoldItalic.
 */
export function runTextStyle(run: ContractRun): {
  fontFamily: "Times-Roman";
  fontWeight: 400 | 700;
  fontStyle: "italic" | "normal";
  textDecoration: "underline" | "none";
} {
  return {
    fontFamily: "Times-Roman",
    fontWeight: run.bold ? 700 : 400,
    fontStyle: run.italic ? "italic" : "normal",
    textDecoration: run.underline ? "underline" : "none",
  };
}

/**
 * What an empty body stores. The column is NOT NULL — never write SQL null.
 *
 * Must contain at least one block node: the ProseMirror `doc` node's content
 * spec is `block+` (one-or-more), so `{ type: "doc", content: [] }` fails
 * schema validation — `doc.type.checkContent()` (called via
 * `enableContentCheck`, and unconditionally by `Node.check()`) throws
 * "Invalid content for node doc: <>". Tiptap only tolerates the empty array
 * because `enableContentCheck` defaults to false and nothing here calls
 * `.check()` — but this value is also written straight to the NOT NULL
 * `body` column for every template-less contract, i.e. it lives in the
 * database, not just in memory, so it needs to be a schema-valid doc on its
 * own terms rather than merely one Tiptap happens not to reject today.
 */
export const EMPTY_CONTRACT_DOC: TiptapNode = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

/**
 * True when a body holds nothing the user would mind losing.
 *
 * Lives here, next to EMPTY_CONTRACT_DOC, because the two must agree: this
 * predicate MUST return true for EMPTY_CONTRACT_DOC itself. When that pairing
 * was split across files it silently broke — EMPTY_CONTRACT_DOC gained its
 * mandatory `paragraph` child (see above) while the caller still tested
 * `content.length === 0`, so every brand-new contract looked non-empty and
 * picking a template popped a "this will discard what you have written"
 * warning over a blank form. Keep them together.
 *
 * Emptiness is judged by RUNS, not by block count: a doc of empty paragraphs
 * is what you get from a fresh editor or a few stray Enters. Anything else —
 * a list, or a paragraph with text — is deliberate authoring and counts as
 * content, even if the text is only whitespace.
 */
export function isContractDocEmpty(doc: TiptapNode): boolean {
  if (!doc.content || doc.content.length === 0) return true;
  return doc.content.every(
    (node) => node.type === "paragraph" && !node.content?.length,
  );
}

/**
 * Bridges `TiptapNode` (this module's `type: string`, deliberately widened so
 * `contractDocToBlocks` can accept and drop unrecognised node types without a
 * compile-time fight) into a form's `body` field, whose zod schema narrows
 * `type` to the literal `"doc"` (see the shared `tiptapDoc` const in
 * cos-contract-schema.ts, reused by both cosContractFormSchema.body and
 * cosContractTemplateFormSchema.body — one schema, one type, not two that
 * merely look alike). The two types describe the same runtime value — the
 * editor is the only author of `body` at runtime — so this is a type-level
 * view mismatch, not an unsafe runtime cast. Not generic: both forms' `body`
 * field is provably the same `ContractBody`, so there is nothing for a type
 * parameter to vary over. Centralised here so every call site (the contract
 * form's defaultValues, its template-apply handler, its editor onChange, and
 * the template form's equivalents) goes through one named assertion instead
 * of scattering ad-hoc `as CosContractFormValues["body"]` casts.
 */
export function asFormBody(doc: TiptapNode): ContractBody {
  return doc as ContractBody;
}

const BULLET = "•";

function hasMark(node: TiptapNode, mark: string): boolean {
  return (node.marks ?? []).some((m) => m.type === mark);
}

/** Collects the text runs of one paragraph-like node, merge fields resolved. */
function toRuns(node: TiptapNode, ctx: MergeContext): ContractRun[] {
  const runs: ContractRun[] = [];
  for (const child of node.content ?? []) {
    if (child.type === "hardBreak") {
      // A manual line break (Mod-Enter/Shift-Enter) inside a paragraph. The
      // editor (cos-rich-text-editor.tsx) disables the keybinding that
      // creates one, but this stays defensive for any body that reaches the
      // converter from outside that editor: silently skipping the node like
      // an unrecognised type would run the text before and after it
      // together (e.g. "Position: ClerkDepartment: HR") with no signal that
      // a clause boundary was lost — worse than dropped styling, because
      // dropped styling never changes what the words say. Emitting an
      // explicit "\n" run keeps the boundary for whatever renders
      // ContractRun into the PDF.
      runs.push({ text: "\n", bold: false, italic: false, underline: false });
      continue;
    }
    if (child.type !== "text" || typeof child.text !== "string") continue;
    runs.push({
      text: resolveMergeFields(child.text, ctx),
      bold: hasMark(child, "bold"),
      italic: hasMark(child, "italic"),
      underline: hasMark(child, "underline"),
    });
  }
  return runs;
}

function listItemBlocks(
  list: TiptapNode,
  ordered: boolean,
  ctx: MergeContext,
): ContractBlock[] {
  const blocks: ContractBlock[] = [];
  let index = 0;
  for (const item of list.content ?? []) {
    if (item.type !== "listItem") continue;
    index += 1;
    // A listItem wraps one or more paragraphs; each becomes its own block, but
    // only the first carries the marker so a wrapped item is not re-numbered.
    let first = true;
    for (const child of item.content ?? []) {
      if (child.type !== "paragraph") continue;
      blocks.push({
        kind: "listItem",
        marker: first ? (ordered ? `${index}.` : BULLET) : null,
        runs: toRuns(child, ctx),
      });
      first = false;
    }
  }
  return blocks;
}

export function contractDocToBlocks(
  doc: TiptapNode,
  ctx: MergeContext,
): ContractBlock[] {
  const blocks: ContractBlock[] = [];
  for (const node of doc.content ?? []) {
    switch (node.type) {
      case "paragraph":
        blocks.push({
          kind: "paragraph",
          marker: null,
          runs: toRuns(node, ctx),
        });
        break;
      case "bulletList":
        blocks.push(...listItemBlocks(node, false, ctx));
        break;
      case "orderedList":
        blocks.push(...listItemBlocks(node, true, ctx));
        break;
      default:
        // Dropped on purpose — see the file header.
        break;
    }
  }
  return blocks;
}
