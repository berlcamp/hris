/**
 * Parse one CSV line with quoted fields ("double ""quote"" inside").
 */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q && c === '"' && line[i + 1] === '"') {
      cur += '"';
      i++;
      continue;
    }
    if (c === '"') {
      q = !q;
      continue;
    }
    if (!q && c === ",") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

/**
 * Tokenize the whole CSV text, tracking quote state across the entire
 * buffer rather than per-line. `parseCsvLine` above cannot do this: it is
 * handed one line at a time by a naive `split(/\r?\n/)`, so a `\r\n` (or
 * `\n`) that appears *inside* a quoted field — a real shape in the legacy
 * `jos.csv` `remarks` column, e.g. `"DATE STARTED : ...\r\nRESUME: ..."` —
 * ends up split into two corrupt fragments instead of staying one field.
 *
 * This scans character-by-character: a newline only ends a record when it
 * is not inside an open quote; otherwise it is appended to the current
 * field like any other character. Per RFC 4180, `""` inside a quoted field
 * is a literal `"`, and quotes toggle quote-state everywhere else. Fields
 * are trimmed and wholly-blank lines are skipped, matching prior behaviour.
 */
export function parseCsvTextToRows(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  // Start index (in `text`) of the record currently being built, so the
  // blank-record check below can test the *raw* text of the record — same
  // semantics as the old `!line.trim()` check on a raw line — rather than
  // the post-trim fields, which would wrongly treat a lone `""` (a row with
  // one legitimately-empty quoted field) as blank.
  let recordStart = 0;

  const endField = () => {
    row.push(field.trim());
    field = "";
  };

  const endRow = (recordEnd: number) => {
    endField();
    if (text.slice(recordStart, recordEnd).trim().length > 0) {
      rows.push(row);
    }
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
        continue;
      }
      if (c === '"') {
        inQuotes = false;
        continue;
      }
      field += c;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      endField();
      continue;
    }
    if (c === "\r") {
      // Bare \r (old Mac line endings) or the \r of \r\n — either way it
      // ends the record; a following \n is consumed here too so it isn't
      // seen as a second, empty record.
      if (text[i + 1] === "\n") i++;
      endRow(i);
      recordStart = i + 1;
      continue;
    }
    if (c === "\n") {
      endRow(i);
      recordStart = i + 1;
      continue;
    }

    field += c;
  }

  // Flush a final unterminated line (no trailing newline at EOF).
  if (recordStart < text.length || field.length > 0 || row.length > 0) {
    endRow(text.length);
  }

  return rows;
}

const NAME_HEADER_RE =
  /^(full\s*name|fullname|employee\s*name|employee|name|csc\s*full\s*name)$/i;

/**
 * Single-column CSV: every non-empty row is a name.
 * Multi-column: first row is header; picks column matching typical full-name headers, else column 0.
 */
export function extractFullNameColumn(rows: string[][]): string[] {
  if (rows.length === 0) return [];

  if (rows.every((r) => r.length === 1)) {
    const headerCell = rows[0][0]?.trim().replace(/^\uFEFF/, "") ?? "";
    if (NAME_HEADER_RE.test(headerCell)) {
      return rows.slice(1).map((r) => r[0]?.trim() ?? "").filter(Boolean);
    }
    return rows.map((r) => r[0]?.trim() ?? "").filter(Boolean);
  }

  const header = rows[0].map((h) => h.trim().replace(/^\uFEFF/, ""));
  let col = header.findIndex((h) => NAME_HEADER_RE.test(h));
  if (col < 0) col = 0;

  const names: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cell = rows[i][col]?.trim() ?? "";
    if (cell) names.push(cell);
  }
  return names;
}
