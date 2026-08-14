/**
 * What a correction request's supporting document may be, and where it lives.
 *
 * Shared by the form and the server action because the file no longer travels
 * between them: the browser uploads it straight to Storage through a signed URL
 * (createProofUploadTicket), and the action receives only a reference. Both
 * sides therefore need the same limits — the client to refuse a bad file before
 * spending the upload, the server to re-check what actually landed in the
 * bucket rather than trust what the client says it sent.
 *
 * Kept out of attendance-correction-actions.ts because a "use server" module
 * may only export async functions.
 */

export const PROOF_BUCKET = "attendance-proofs";
export const MAX_PROOF_BYTES = 10 * 1024 * 1024;
export const ALLOWED_PROOF_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
];

const MAX_PROOF_MB = Math.round(MAX_PROOF_BYTES / (1024 * 1024));

/**
 * The complaint about a proof, or null when it is acceptable.
 *
 * Takes size and MIME separately rather than a File, so the server can run the
 * identical rule over the metadata Storage reports for the uploaded object.
 */
export function proofRejection(
  size: number | null | undefined,
  mime: string | null | undefined,
): string | null {
  if (!size) return "The supporting document is empty";
  if (size > MAX_PROOF_BYTES) {
    return `The supporting document must be ${MAX_PROOF_MB} MB or smaller`;
  }
  if (!mime || !ALLOWED_PROOF_TYPES.includes(mime)) {
    return "The supporting document must be a PDF, JPEG or PNG";
  }
  return null;
}

/**
 * Where a request's proof is stored: `<employee>/<request>/<file>`.
 *
 * The request id is in the path so the server can prove an uploaded object
 * belongs to the filing that claims it — see createCorrectionRequest, which
 * refuses any path outside this prefix and then creates the request row under
 * that same id.
 */
export function proofObjectPath(
  employeeId: string,
  requestId: string,
  filename: string,
): string {
  return `${employeeId}/${requestId}/${sanitizeProofFilename(filename)}`;
}

/**
 * A storage key is a URL path segment, and the browser now picks it. Strip any
 * directory part and anything that is not plain filename material, keeping the
 * tail so the extension survives.
 */
export function sanitizeProofFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? "";
  const safe = base
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[._]+/, "")
    .slice(-120);
  return safe || "proof";
}
