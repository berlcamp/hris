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
// change still prints instead of failing at the worst possible moment.

import { resolveMergeFields, type MergeContext } from "./cos-merge-fields.ts";

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

/** What an empty body stores. The column is NOT NULL — never write SQL null. */
export const EMPTY_CONTRACT_DOC: TiptapNode = { type: "doc", content: [] };

const BULLET = "•";

function hasMark(node: TiptapNode, mark: string): boolean {
  return (node.marks ?? []).some((m) => m.type === mark);
}

/** Collects the text runs of one paragraph-like node, merge fields resolved. */
function toRuns(node: TiptapNode, ctx: MergeContext): ContractRun[] {
  const runs: ContractRun[] = [];
  for (const child of node.content ?? []) {
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
