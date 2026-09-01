/**
 * Minimal RFC 4180 CSV. Hand-rolled rather than pulled in as a dependency: the surface
 * needed here is small, and a note containing a comma, quote or newline must not corrupt
 * the file — which is exactly what naive `split(",")` does.
 */

function escapeCell(value: string): string {
  const needsQuotes = /[",\r\n]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

export function toCsv(rows: string[][]): string {
  // CRLF and a trailing newline: what Excel and the major password managers expect.
  return rows.map((row) => row.map(escapeCell).join(",")).join("\r\n") + "\r\n";
}

export function parseCsv(input: string): string[][] {
  // Strip a UTF-8 BOM, which Excel writes and which would otherwise corrupt the first header.
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldStart = true;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && fieldStart) {
      inQuotes = true;
      fieldStart = false;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      fieldStart = true;
      continue;
    }

    if (char === "\n" || char === "\r") {
      // Consume CRLF as a single terminator.
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      fieldStart = true;
      continue;
    }

    field += char;
    fieldStart = false;
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop blank lines, including the trailing one every well-formed file ends with.
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

/** Maps a header row to indices, tolerating the different names each exporter uses. */
export function matchColumns(
  header: string[],
  aliases: Record<string, string[]>,
): Record<string, number> {
  const normalized = header.map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  const found: Record<string, number> = {};

  for (const [field, names] of Object.entries(aliases)) {
    const index = normalized.findIndex((h) => names.includes(h));
    if (index !== -1) found[field] = index;
  }

  return found;
}
