export type ParsedCsv = {
  headers: string[];
  rows: string[][];
  totalRows: number;
  truncated: boolean;
};

/** RFC-4180 CSV parser supporting BOM, quoted commas/newlines, and row cap for smooth mobile previews. */
export function parseCsv(input: string, maxRows = 500): ParsedCsv {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  if (text.trim() === '') return { headers: [], rows: [], totalRows: 0, truncated: false };

  const allRows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      if (row.length > 1 || row[0] !== '') allRows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.length > 1 || row[0] !== '') allRows.push(row);
  }

  if (allRows.length === 0) return { headers: [], rows: [], totalRows: 0, truncated: false };
  const headers = allRows[0];
  const data = allRows.slice(1);
  const sliced = data.slice(0, maxRows).map((r) => {
    if (r.length >= headers.length) return r;
    return [...r, ...Array<string>(headers.length - r.length).fill('')];
  });

  return {
    headers,
    rows: sliced,
    totalRows: data.length,
    truncated: data.length > maxRows,
  };
}
