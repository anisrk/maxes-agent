type LoanRow = Record<string, string | number | boolean>;

function parseRow(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      cells.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function coerce(val: string): string | number | boolean {
  const t = val.trim();
  if (t.toLowerCase() === "true")  return true;
  if (t.toLowerCase() === "false") return false;
  const n = Number(t);
  if (t !== "" && !isNaN(n)) return n;
  return t;
}

export function parseCsv(text: string): LoanRow[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseRow(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = parseRow(line);
    const obj: LoanRow = {};
    headers.forEach((h, i) => { obj[h] = coerce(values[i] ?? ""); });
    return obj;
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type UploadFormat = "csv" | "json" | "xml" | "yaml";

export function fileFormat(name: string): UploadFormat | null {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "csv")  return "csv";
  if (ext === "json") return "json";
  if (ext === "xml")  return "xml";
  if (ext === "yaml" || ext === "yml") return "yaml";
  return null;
}
