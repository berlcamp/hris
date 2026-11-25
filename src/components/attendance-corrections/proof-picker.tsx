"use client";

import { useRef } from "react";
import { FileText, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  ALLOWED_PROOF_TYPES,
  MAX_PROOF_FILES,
  proofRejection,
} from "@/lib/attendance-proof";

export interface PickedProof {
  id: string;
  file: File;
  /** Object URL. The owner of the list revokes whatever is left on unmount. */
  url: string;
}

// Holds files only until the form is submitted: nothing is uploaded on pick, so
// removing one here leaves nothing behind in Storage.
export function ProofPicker({
  id,
  proofs,
  onChange,
  disabled = false,
}: {
  id: string;
  proofs: PickedProof[];
  onChange: (next: PickedProof[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (files: File[]) => {
    const next = [...proofs];
    for (const file of files) {
      const duplicate = next.some(
        (p) =>
          p.file.name === file.name &&
          p.file.size === file.size &&
          p.file.lastModified === file.lastModified,
      );
      if (duplicate) continue;
      const rejection = proofRejection(file.size, file.type);
      if (rejection) {
        toast.error(`${file.name}: ${rejection}`);
        continue;
      }
      if (next.length >= MAX_PROOF_FILES) {
        toast.error(`Attach up to ${MAX_PROOF_FILES} files.`);
        break;
      }
      next.push({
        id: crypto.randomUUID(),
        file,
        url: URL.createObjectURL(file),
      });
    }
    onChange(next);
  };

  const remove = (proof: PickedProof) => {
    URL.revokeObjectURL(proof.url);
    onChange(proofs.filter((p) => p.id !== proof.id));
  };

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        id={id}
        type="file"
        multiple
        className="hidden"
        accept={ALLOWED_PROOF_TYPES.join(",")}
        disabled={disabled}
        onChange={(e) => {
          add(Array.from(e.target.files ?? []));
          // So a file that was just removed can be picked again.
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || proofs.length >= MAX_PROOF_FILES}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-4 w-4" />
        {proofs.length > 0 ? "Add more files" : "Choose files"}
      </Button>
      {proofs.length > 0 && (
        <ul className="flex flex-wrap gap-3">
          {proofs.map((proof) => (
            <li key={proof.id} className="relative w-24">
              <a
                href={proof.url}
                target="_blank"
                rel="noopener noreferrer"
                title={proof.file.name}
                className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-md border bg-muted/40"
              >
                {proof.file.type.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local object URL
                  <img
                    src={proof.url}
                    alt={proof.file.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                    <FileText className="h-8 w-8" aria-hidden />
                    PDF
                  </span>
                )}
              </a>
              <Button
                type="button"
                variant="destructive"
                size="icon"
                disabled={disabled}
                onClick={() => remove(proof)}
                aria-label={`Remove ${proof.file.name}`}
                className="absolute -right-2 -top-2 h-6 w-6 rounded-full border bg-background"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {proof.file.name}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
