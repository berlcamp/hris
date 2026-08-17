/**
 * Minimal .xlsx (SpreadsheetML) writer — no dependencies.
 *
 * The app already ships a CSV export, but HR opens these files in Excel and
 * wants real sheets (typed number cells, a frozen bold header, autofilter),
 * which CSV cannot carry. Pulling in `exceljs`/`xlsx` for that would add a
 * megabyte to a client bundle, so this builds the OOXML package by hand.
 *
 * The ZIP is written with the STORE method (no compression) — a spreadsheet of
 * a few thousand HR rows is small, and skipping DEFLATE means no compression
 * library at all. Excel, LibreOffice and Google Sheets all read stored zips.
 *
 * Pure and DOM-free so it can be unit tested under `node --test`; the browser
 * side of the export (Blob + download) lives in
 * `src/components/tables/export-excel-button.tsx`.
 */

export type XlsxCellValue = string | number | boolean | null | undefined;

export interface XlsxColumn<TRow> {
  /** Header text written to row 1. */
  header: string;
  /** Cell value for a row. Return a number to get a real numeric cell. */
  value: (row: TRow) => XlsxCellValue;
}

const ENCODER = new TextEncoder();

/* -------------------------------------------------------------------------- */
/* XML                                                                        */
/* -------------------------------------------------------------------------- */

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Control characters below 0x20 (except tab/LF/CR) are illegal in XML 1.0 and
 * make Excel declare the whole workbook corrupt. Legacy HR text imported from
 * CSV does contain them, so they are dropped rather than escaped.
 */
function sanitizeText(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    const isIllegalControl =
      code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d;
    if (!isIllegalControl) out += ch;
  }
  return out;
}

/** 0 -> "A", 25 -> "Z", 26 -> "AA". */
export function columnLetter(index: number): string {
  let letters = "";
  let n = index;
  while (n >= 0) {
    letters = String.fromCharCode((n % 26) + 65) + letters;
    n = Math.floor(n / 26) - 1;
  }
  return letters;
}

/** Excel rejects these characters in a sheet name, and caps it at 31 chars. */
export function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[[\]:*?/\\]/g, " ").trim();
  return (cleaned || "Sheet1").slice(0, 31);
}

function cellXml(ref: string, value: XlsxCellValue, styleIndex: number): string {
  const s = styleIndex ? ` s="${styleIndex}"` : "";
  if (value === null || value === undefined || value === "") {
    return `<c r="${ref}"${s}/>`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}"${s}><v>${value}</v></c>`;
  }
  const text = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(
    sanitizeText(text),
  )}</t></is></c>`;
}

function sheetXml<TRow>(columns: XlsxColumn<TRow>[], rows: TRow[]): string {
  const widths = columns.map((c) => c.header.length);

  const body = rows
    .map((row, r) => {
      const cells = columns
        .map((col, c) => {
          const value = col.value(row);
          const rendered =
            value === null || value === undefined ? "" : String(value);
          if (rendered.length > widths[c]) widths[c] = rendered.length;
          return cellXml(`${columnLetter(c)}${r + 2}`, value, 0);
        })
        .join("");
      return `<row r="${r + 2}">${cells}</row>`;
    })
    .join("");

  const header = columns
    .map((col, c) => cellXml(`${columnLetter(c)}1`, col.header, 1))
    .join("");

  const cols = widths
    .map(
      (w, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${Math.min(
          60,
          Math.max(10, w + 2),
        )}" customWidth="1"/>`,
    )
    .join("");

  const lastColumn = columnLetter(Math.max(0, columns.length - 1));
  const dimension = `A1:${lastColumn}${rows.length + 1}`;

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="${dimension}"/>` +
    `<sheetViews><sheetView workbookViewId="0">` +
    `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` +
    `</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    (cols ? `<cols>${cols}</cols>` : "") +
    `<sheetData><row r="1">${header}</row>${body}</sheetData>` +
    `<autoFilter ref="${dimension}"/>` +
    `</worksheet>`
  );
}

const CONTENT_TYPES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
  `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
  `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
  `</Types>`;

const ROOT_RELS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
  `</Relationships>`;

const WORKBOOK_RELS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  `</Relationships>`;

// Style 0 is the default cell; style 1 is the bold header row.
const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="2">` +
  `<font><sz val="11"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
  `</fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="2">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

function workbookXml(sheetName: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`
  );
}

/* -------------------------------------------------------------------------- */
/* ZIP (store-only)                                                           */
/* -------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/**
 * Builds a ZIP archive with every entry stored uncompressed. Timestamps are
 * fixed (1980-01-01) so the same input always produces the same bytes.
 */
function zip(entries: ZipEntry[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = ENCODER.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new Uint8Array(30 + nameBytes.length + size);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true); // version needed
    localView.setUint16(6, 0x0800, true); // UTF-8 filename flag
    localView.setUint16(8, 0, true); // method: store
    localView.setUint16(10, 0, true); // mod time
    localView.setUint16(12, 33, true); // mod date = 1980-01-01
    localView.setUint32(14, crc, true);
    localView.setUint32(18, size, true);
    localView.setUint32(22, size, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true); // extra length
    local.set(nameBytes, 30);
    local.set(entry.data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true); // version made by
    centralView.setUint16(6, 20, true); // version needed
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 33, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, size, true);
    centralView.setUint32(24, size, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true); // extra
    centralView.setUint16(32, 0, true); // comment
    centralView.setUint16(34, 0, true); // disk number
    centralView.setUint16(36, 0, true); // internal attrs
    centralView.setUint32(38, 0, true); // external attrs
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  const total =
    locals.reduce((sum, l) => sum + l.length, 0) + centralSize + end.length;
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/** Builds a single-sheet .xlsx workbook and returns its raw bytes. */
export function buildXlsx<TRow>(options: {
  sheetName: string;
  columns: XlsxColumn<TRow>[];
  rows: TRow[];
}): Uint8Array {
  const sheetName = sanitizeSheetName(options.sheetName);
  return zip([
    { name: "[Content_Types].xml", data: ENCODER.encode(CONTENT_TYPES_XML) },
    { name: "_rels/.rels", data: ENCODER.encode(ROOT_RELS_XML) },
    { name: "xl/workbook.xml", data: ENCODER.encode(workbookXml(sheetName)) },
    { name: "xl/_rels/workbook.xml.rels", data: ENCODER.encode(WORKBOOK_RELS_XML) },
    { name: "xl/styles.xml", data: ENCODER.encode(STYLES_XML) },
    {
      name: "xl/worksheets/sheet1.xml",
      data: ENCODER.encode(sheetXml(options.columns, options.rows)),
    },
  ]);
}

export const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
