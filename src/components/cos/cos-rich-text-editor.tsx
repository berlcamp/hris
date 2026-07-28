"use client";

import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ListItem } from "@tiptap/extension-list";
import Underline from "@tiptap/extension-underline";
import { Bold, Italic, List, ListOrdered, Underline as UnderlineIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem as SelectOption,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COS_MERGE_FIELDS } from "@/lib/cos-merge-fields";
import type { TiptapNode } from "@/lib/cos-contract-doc";
import { cn } from "@/lib/utils";

// Nested lists are unsupported by the print converter (see the
// `listItemBlocks` function in src/lib/cos-contract-doc.ts, which silently
// drops any non-paragraph child of a list item) — on a legal document,
// silently losing a clause is not acceptable. StarterKit's default ListItem
// lets a user create exactly that nesting by pressing Tab inside a list, so
// this extends it to make nesting impossible to author at all rather than
// merely undocumented:
//   - `content` is narrowed from the default "paragraph block*" to
//     "paragraph+": a list item may still wrap more than one paragraph (the
//     converter's own comment says a wrapped item is not re-numbered), but it
//     can no longer contain a bulletList/orderedList child, so even a paste
//     of pre-nested HTML is rejected by the schema instead of round-tripping
//     into a doc the converter will silently truncate.
//   - Tab/Shift-Tab are overridden to a no-op (return false) instead of
//     sinkListItem/liftListItem. This is required in addition to the schema
//     change: those commands build a ReplaceAroundStep directly (see
//     node_modules/prosemirror-schema-list) without first checking whether
//     the result fits the schema, so leaving them wired up would throw at
//     the now-disallowed nesting rather than fail quietly.
//     Returning `false` (not `true`) is deliberate: ProseMirror's keymap
//     calls preventDefault() only when a handler returns true, so `true`
//     here would swallow Tab/Shift-Tab entirely and trap keyboard focus
//     inside the editor with no way out but the mouse (WCAG 2.1.2). `false`
//     marks the key unhandled and lets it fall through to the browser's
//     normal focus movement. @tiptap/extension-list's ListKeymap only binds
//     Delete/Mod-Delete/Backspace/Mod-Backspace, so nothing else in this
//     extension set claims Tab — falling through is safe.
const NoNestListItem = ListItem.extend({
  content: "paragraph+",
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Tab: () => false,
      "Shift-Tab": () => false,
    };
  },
});

/**
 * Structural equality for Tiptap/ProseMirror JSON, used by the content-sync
 * effect below to decide whether an incoming `value` prop actually differs
 * from what the editor already holds. Deliberately NOT `JSON.stringify(a) ===
 * JSON.stringify(b)`: key order in the two sides can differ (one comes from
 * `editor.getJSON()`, schema-driven; the other from a template/form value
 * built by plain object literals), which would make a stringify comparison
 * report "different" for genuinely identical documents and defeat the guard.
 * Comparing field-by-field (marks compared as a set, attrs compared by key
 * regardless of insertion order) is insensitive to that.
 */
function nodesEqual(a: TiptapNode, b: TiptapNode): boolean {
  if (a === b) return true;
  if (a.type !== b.type || a.text !== b.text) return false;

  const aMarks = a.marks ?? [];
  const bMarks = b.marks ?? [];
  if (aMarks.length !== bMarks.length) return false;
  const aMarkTypes = aMarks.map((m) => m.type).sort();
  const bMarkTypes = bMarks.map((m) => m.type).sort();
  if (aMarkTypes.some((t, i) => t !== bMarkTypes[i])) return false;

  const aAttrs = a.attrs ?? {};
  const bAttrs = b.attrs ?? {};
  const aKeys = Object.keys(aAttrs);
  const bKeys = Object.keys(bAttrs);
  if (aKeys.length !== bKeys.length) return false;
  if (aKeys.some((k) => !Object.is(aAttrs[k], bAttrs[k]))) return false;

  const aContent = a.content ?? [];
  const bContent = b.content ?? [];
  if (aContent.length !== bContent.length) return false;
  for (let i = 0; i < aContent.length; i++) {
    if (!nodesEqual(aContent[i], bContent[i])) return false;
  }
  return true;
}

interface CosRichTextEditorProps {
  value: TiptapNode;
  onChange: (doc: TiptapNode) => void;
}

/**
 * The toolbar exposes EXACTLY the constructs src/lib/cos-contract-doc.ts can
 * print: paragraphs, bold/italic/underline, bulleted and numbered lists.
 * Do not add headings, tables or alignment without extending that converter —
 * anything it does not recognise is silently dropped from the PDF.
 */
export function CosRichTextEditor({ value, onChange }: CosRichTextEditorProps) {
  const editor = useEditor({
    // Next 16 renders this component on the server first; Tiptap must not try
    // to hydrate its own DOM before the client takes over.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        // Replaced by NoNestListItem below so nested lists cannot be
        // authored — see the comment on that extension.
        listItem: false,
        // code/strike/link are marks the converter (hasMark in
        // cos-contract-doc.ts) does not recognise — bold/italic/underline
        // only. Left enabled, StarterKit still binds keyboard shortcuts for
        // all three (Mod-e, Mod-Shift-s, and autolink/linkOnPaste for URLs)
        // with no toolbar exposure, so a user could apply strikethrough to
        // void a clause, see it in the editor, and have it silently vanish
        // from the printed contract. Disabled outright, matching how
        // heading/codeBlock/blockquote/horizontalRule are already off.
        code: false,
        strike: false,
        link: false,
        // hardBreak (Mod-Enter / Shift-Enter) inserts a node toRuns() used to
        // skip with no substitute separator, silently running the text
        // before and after it together on print — the same failure shape as
        // the nested-list bug, for line breaks instead of list structure.
        // Disabled here so the keybinding cannot author one; toRuns() also
        // now handles a hardBreak defensively (emits an explicit "\n" run)
        // for any body that reaches the converter from outside this editor.
        hardBreak: false,
        // StarterKit 3.29.1 bundles its own Underline and enables it unless
        // told otherwise, which would register the "underline" extension
        // name twice alongside the explicit import below (Tiptap warns
        // "Duplicate extension names found" at runtime). Keep the explicit
        // @tiptap/extension-underline import — it is one of the four
        // packages this module's brief required installing — and disable
        // StarterKit's copy instead of removing the import.
        underline: false,
      }),
      NoNestListItem,
      Underline,
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getJSON() as TiptapNode),
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[320px] p-3 focus:outline-none",
      },
    },
  });

  // useEditor is called with the default deps ([]), so after the first
  // render it only ever calls editor.setOptions(...) on rerender (see
  // EditorInstanceManager.onRender in @tiptap/react) — that merges options
  // and updates the view's state, but it never re-parses `content` into a
  // new document. The ProseMirror doc is built once, at construction, so the
  // `value` prop is otherwise write-once: picking a template after mount
  // (applyTemplate in cos-contract-form.tsx) updates form state but the
  // visible editor stays on whatever it started with. This effect pushes an
  // external `value` change into the live editor explicitly.
  //
  // The equality guard is essential, not an optimisation: every keystroke
  // fires onUpdate -> onChange -> a new `value` reference from the parent's
  // re-render. Without the guard this effect would call setContent on every
  // keystroke, which rebuilds the ProseMirror doc and blows away the user's
  // cursor position and undo history mid-typing. nodesEqual (above) compares
  // structurally rather than by reference or by JSON.stringify, so a `value`
  // that is a *new but equivalent* object (the common case while typing)
  // correctly counts as "no change" and setContent is skipped.
  useEffect(() => {
    if (!editor) return;
    if (nodesEqual(editor.getJSON() as TiptapNode, value)) return;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return null;

  const insertToken = (token: string) => {
    editor.chain().focus().insertContent(`{{${token}}}`).run();
  };

  return (
    <div className="rounded-md border">
      <div className="flex flex-wrap items-center gap-1 border-b p-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Bold"
          aria-pressed={editor.isActive("bold")}
          className={cn(editor.isActive("bold") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Italic"
          aria-pressed={editor.isActive("italic")}
          className={cn(editor.isActive("italic") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Underline"
          aria-pressed={editor.isActive("underline")}
          className={cn(editor.isActive("underline") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Bulleted list"
          aria-pressed={editor.isActive("bulletList")}
          className={cn(editor.isActive("bulletList") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Numbered list"
          aria-pressed={editor.isActive("orderedList")}
          className={cn(editor.isActive("orderedList") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" />
        </Button>

        <div className="ml-auto w-56">
          <Select
            items={COS_MERGE_FIELDS.map((f) => ({
              value: f.token,
              label: f.label,
            }))}
            onValueChange={(v) => insertToken(v as string)}
          >
            <SelectTrigger size="sm">
              <SelectValue placeholder="Insert merge field" />
            </SelectTrigger>
            <SelectContent>
              {COS_MERGE_FIELDS.map((f) => (
                <SelectOption key={f.token} value={f.token}>
                  {f.label}
                </SelectOption>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
