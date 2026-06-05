import { describe, it, expect } from "vitest";
import { textConverter, csvToMarkdown, parseCsvLine } from "../../../src/sync/converters/text.js";

describe("parseCsvLine", () => {
  it("splits simple fields", () => {
    expect(parseCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("handles quoted fields with commas", () => {
    expect(parseCsvLine('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
  });

  it("handles escaped double quotes inside quotes", () => {
    expect(parseCsvLine('"he said ""hi""",x')).toEqual(['he said "hi"', "x"]);
  });
});

describe("csvToMarkdown", () => {
  it("renders a GFM pipe table with header separator", () => {
    const md = csvToMarkdown("name,age\nAda,36\nGrace,41");
    expect(md).toBe(
      ["| name | age |", "| --- | --- |", "| Ada | 36 |", "| Grace | 41 |"].join("\n")
    );
  });

  it("escapes pipe characters in cells", () => {
    const md = csvToMarkdown("a|b\nc");
    expect(md).toContain("a\\|b");
  });

  it("pads ragged rows to the widest row", () => {
    const md = csvToMarkdown("a,b,c\n1");
    expect(md).toContain("| 1 |  |  |");
  });

  it("returns empty string for empty input", () => {
    expect(csvToMarkdown("")).toBe("");
  });
});

describe("textConverter", () => {
  it("declares csv/json/txt extensions", () => {
    expect(textConverter.extensions).toContain("csv");
    expect(textConverter.extensions).toContain("json");
    expect(textConverter.extensions).toContain("txt");
  });

  it("converts CSV attachments to a Markdown table", async () => {
    const res = await textConverter.convert(Buffer.from("a,b\n1,2"), "data.csv");
    expect(res.markdown).toContain("| a | b |");
    expect(res.meta?.["format"]).toBe("csv");
  });

  it("wraps JSON in a fenced code block", async () => {
    const res = await textConverter.convert(Buffer.from('{"k":1}'), "config.json");
    expect(res.markdown).toBe('```json\n{"k":1}\n```');
  });

  it("converts TSV by treating tabs as separators", async () => {
    const res = await textConverter.convert(Buffer.from("a\tb\n1\t2"), "data.tsv");
    expect(res.markdown).toContain("| a | b |");
  });

  it("passes Markdown/plain text through verbatim", async () => {
    const res = await textConverter.convert(Buffer.from("# Title\n\nbody"), "note.md");
    expect(res.markdown).toBe("# Title\n\nbody");
  });
});
