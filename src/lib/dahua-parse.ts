// Dahua face recognition devices export attendance via USB as SpreadsheetML XML
// (or, on some firmware, CSV). The export for a full period can be several MB.
//
// Parsing is pure string manipulation with no DB/auth needs, so it runs in the
// browser — keeping the raw file off the wire. Server Actions cap request bodies
// at 1MB by default, so uploading a multi-MB export to a "use server" parser
// fails with a 500. Parse here, then send only the compact parsed rows to the
// server actions in attendance-actions.ts.
//
// Format: Row 1 = title, Row 2 = date range, Row 3 = headers, Row 4+ = data
// Headers: No., No.(employee), Name, Recorded Time, Recognition Mode, Status, Attendance Status, Face Mask

export interface DahuaParsedRow {
  employeeNo: string;
  employeeName: string;
  date: string;
  time: string;
  status: string;
  matched: boolean;
  employeeId: string | null;
}

function extractCellValues(rowXml: string): string[] {
  const values: string[] = [];
  // Match each Cell, handling MergeAcross which means the cell spans multiple columns
  const cellRegex = /<Cell[^>]*?(?:ss:MergeAcross="(\d+)")?[^>]*>\s*(?:<Data[^>]*>(.*?)<\/Data>)?/gs;
  let match;
  while ((match = cellRegex.exec(rowXml)) !== null) {
    const mergeAcross = match[1] ? parseInt(match[1], 10) : 0;
    const value = match[2] ?? "";
    values.push(value);
    // MergeAcross means this cell spans extra columns
    for (let i = 0; i < mergeAcross; i++) {
      values.push("");
    }
  }
  return values;
}

export function parseDahuaFile(content: string): DahuaParsedRow[] {
  // Detect format: XML (SpreadsheetML) or CSV
  const trimmed = content.trim();
  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<Workbook")) {
    return parseDahuaXml(trimmed);
  }
  return parseDahuaCsv(trimmed);
}

function parseDahuaXml(xmlContent: string): DahuaParsedRow[] {
  const rows: DahuaParsedRow[] = [];

  // Extract all <Row> elements
  const rowRegex = /<Row[^>]*>([\s\S]*?)<\/Row>/g;
  const allRows: string[] = [];
  let match;
  while ((match = rowRegex.exec(xmlContent)) !== null) {
    allRows.push(match[1]);
  }

  // Find the header row index (contains "Recorded Time" or "Name")
  let headerIndex = -1;
  for (let i = 0; i < allRows.length; i++) {
    const cells = extractCellValues(allRows[i]);
    if (cells.some((c) => c === "Recorded Time" || c === "Name")) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex === -1) return [];

  // Data rows start after the header
  for (let i = headerIndex + 1; i < allRows.length; i++) {
    const cells = extractCellValues(allRows[i]);
    // Need at least: No., EmployeeNo, Name, RecordedTime
    if (cells.length < 4) continue;

    const idNo = cells[1]?.trim();
    const name = cells[2]?.trim();
    const dateTime = cells[3]?.trim();

    if (!idNo || !name || !dateTime) continue;

    // Parse date and time from "2026-04-15 11:54:25"
    const dtMatch = dateTime.match(/(\d{4}[-/]\d{2}[-/]\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)/);
    if (!dtMatch) continue;

    const date = dtMatch[1].replace(/\//g, "-");
    const time = dtMatch[2].substring(0, 5); // HH:MM

    // Attendance Status is column index 6 (e.g., "Break Out", "Check-In")
    const status = cells[6]?.trim() || "";

    rows.push({
      employeeNo: idNo,
      employeeName: name,
      date,
      time,
      status: status.toLowerCase(),
      matched: false,
      employeeId: null,
    });
  }

  return rows;
}

function parseDahuaCsv(csvContent: string): DahuaParsedRow[] {
  const lines = csvContent.split("\n");
  if (lines.length < 2) return [];

  // Detect header line - skip it
  const headerLine = lines[0].toLowerCase();
  const startIndex = headerLine.includes("no") || headerLine.includes("id") ? 1 : 0;

  const rows: DahuaParsedRow[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(",").map((p) => p.trim());
    if (parts.length < 4) continue;

    let idNo: string;
    let name: string;
    let dateTime: string;
    let status: string;

    if (parts.length >= 5) {
      idNo = parts[1];
      name = parts[2];
      dateTime = parts[3];
      status = parts[4] || "";
    } else {
      idNo = parts[0];
      name = parts[1];
      dateTime = parts[2];
      status = parts[3] || "";
    }

    const dtMatch = dateTime.match(/(\d{4}[-/]\d{2}[-/]\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)/);
    if (!dtMatch) continue;

    const date = dtMatch[1].replace(/\//g, "-");
    const time = dtMatch[2].substring(0, 5);

    rows.push({
      employeeNo: idNo,
      employeeName: name,
      date,
      time,
      status: status.toLowerCase(),
      matched: false,
      employeeId: null,
    });
  }

  return rows;
}
