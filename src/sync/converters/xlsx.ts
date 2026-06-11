// src/sync/converters/xlsx.ts
import type { Converter, ConversionResult } from "./types.js";
import { rowsToMarkdown } from "./text.js";

/** Render a single spreadsheet cell value (as parsed by read-excel-file) as plain text. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

/**
 * Spreadsheet (XLSX) → Markdown via read-excel-file. Each worksheet becomes a
 * `## <sheet name>` section followed by a GitHub-flavored Markdown table. The
 * parser is loaded lazily and reads every sheet in a single pass.
 */
export const xlsxConverter: Converter = {
  name: "xlsx",
  extensions: ["xlsx", "xlsm"],
  mimeTypes: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ],
  async convert(buffer: Buffer): Promise<ConversionResult> {
    const readXlsxFile = (await import("read-excel-file/node")).default;
    // `getSheets: true` returns every sheet as `{ sheet, data }`. The option is
    // absent from the published `Options` type, so widen the argument.
    const sheets = await readXlsxFile(buffer, { getSheets: true } as unknown as Parameters<
      typeof readXlsxFile
    >[1]);

    const sections: string[] = [];
    const sheetNames: string[] = [];
    for (const { sheet, data } of sheets) {
      sheetNames.push(sheet);
      const rows = data.map((row) => row.map(cellText));
      const table = rowsToMarkdown(rows);
      if (table) sections.push(`## ${sheet}\n\n${table}`);
    }

    return { markdown: sections.join("\n\n"), meta: { format: "xlsx", sheets: sheetNames } };
  },
};
