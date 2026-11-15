/**
 * Small, strict CSV reader for the seller import (RFC 4180 style): quoted fields, "" escapes,
 * commas/newlines inside quotes, CRLF or LF, a UTF-8 BOM (Excel adds one). No dependencies.
 */
export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawAny = false;

  const endField = () => { row.push(field); field = ""; };
  const endRow = () => {
    endField();
    // drop rows that are completely empty (blank lines)
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    sawAny = true;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") inQuotes = true;
    else if (ch === ",") endField();
    else if (ch === "\r") { if (text[i + 1] === "\n") i++; endRow(); }
    else if (ch === "\n") endRow();
    else field += ch;
  }
  if (inQuotes) throw new Error("The file has an opening quote that is never closed.");
  if (sawAny && (field !== "" || row.length > 0)) endRow();
  return rows;
}

/** Quote one value for CSV output (template download, error report). */
export function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
