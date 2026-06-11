import { describe, it, expect } from "vitest";
import writeXlsxFile from "write-excel-file/node";
import { xlsxConverter } from "../../../src/sync/converters/xlsx.js";

/** Build an .xlsx workbook in memory from one or more named sheets. */
async function makeXlsx(
  sheets: Array<{ name: string; rows: Array<Array<Record<string, unknown>>> }>
): Promise<Buffer> {
  return writeXlsxFile(sheets.map((s) => ({ data: s.rows, sheet: s.name }))).toBuffer();
}

describe("xlsxConverter", () => {
  it("renders each sheet as a section with a Markdown table", async () => {
    const buf = await makeXlsx([
      {
        name: "People",
        rows: [
          [{ value: "name" }, { value: "age" }],
          [{ value: "Ada" }, { value: 36, type: Number }],
          [{ value: "Grace" }, { value: 41, type: Number }],
        ],
      },
    ]);
    const res = await xlsxConverter.convert(buf, "people.xlsx");
    expect(res.markdown).toContain("## People");
    expect(res.markdown).toContain("| name | age |");
    expect(res.markdown).toContain("| Ada | 36 |");
    expect(res.meta?.["sheets"]).toEqual(["People"]);
  });

  it("enumerates every sheet in a multi-sheet workbook", async () => {
    const buf = await makeXlsx([
      { name: "First", rows: [[{ value: "a" }], [{ value: "1" }]] },
      { name: "Second", rows: [[{ value: "b" }], [{ value: "2" }]] },
    ]);
    const res = await xlsxConverter.convert(buf, "multi.xlsx");
    expect(res.markdown).toContain("## First");
    expect(res.markdown).toContain("## Second");
    expect(res.meta?.["sheets"]).toEqual(["First", "Second"]);
  });

  it("renders Date, number and empty cell value shapes", async () => {
    const buf = await makeXlsx([
      {
        name: "Mixed",
        rows: [
          [{ value: "kind" }, { value: "value" }],
          [
            { value: "date" },
            { value: new Date("2026-01-15T12:00:00Z"), type: Date, format: "yyyy-mm-dd" },
          ],
          [{ value: "number" }, { value: 2, type: Number }],
          [{ value: "empty" }, { value: null }],
        ],
      },
    ]);
    const res = await xlsxConverter.convert(buf, "mixed.xlsx");
    expect(res.markdown).toContain("2026-01-15");
    expect(res.markdown).toContain("| number | 2 |");
    expect(res.markdown).toContain("| empty |  |");
  });

  it("returns empty markdown for a workbook with no rows", async () => {
    const buf = await makeXlsx([{ name: "Empty", rows: [[{ value: null }]] }]);
    const res = await xlsxConverter.convert(buf, "empty.xlsx");
    expect(res.markdown).toBe("");
    expect(res.meta?.["sheets"]).toEqual(["Empty"]);
  });
});
