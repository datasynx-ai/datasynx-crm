import fs from "fs";
import readline from "readline";

export interface CsvStreamOptions {
  delimiter?: string;
}

function parseCSVLine(line: string, delimiter = ","): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/** Streaming line-by-line CSV parser — O(1) memory for arbitrarily large files. */
export async function* streamCSV(
  filePath: string,
  opts: CsvStreamOptions = {}
): AsyncGenerator<Record<string, string>> {
  const delimiter = opts.delimiter ?? ",";
  const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let headers: string[] | null = null;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const values = parseCSVLine(trimmed, delimiter);
    if (!headers) {
      headers = values.map((h) => h.replace(/^"|"$/g, "").trim());
      continue;
    }
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    yield row;
  }
}

/** Synchronous full-load parser — for small files (<10MB). */
export function parseCSVSync(content: string, delimiter = ","): Array<Record<string, string>> {
  const lines = content.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = (lines[0] ?? "").split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line, delimiter);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}
