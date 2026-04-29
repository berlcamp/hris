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

export function parseCsvTextToRows(text: string): string[][] {
  const lines = text.split(/\r?\n/);
  const rows: string[][] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    rows.push(parseCsvLine(line));
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
