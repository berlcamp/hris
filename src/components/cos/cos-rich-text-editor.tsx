"use client";

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
//   - Tab/Shift-Tab are turned into no-ops instead of sinkListItem/
//     liftListItem. This is required in addition to the schema change: those
//     commands build a ReplaceAroundStep directly (see
//     node_modules/prosemirror-schema-list) without first checking whether
//     the result fits the schema, so leaving them wired up would throw at
//     the now-disallowed nesting rather than fail quietly. Swallowing the
//     key also avoids Tab shifting focus out of the editor.
const NoNestListItem = ListItem.extend({
  content: "paragraph+",
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Tab: () => true,
      "Shift-Tab": () => true,
    };
  },
});

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
