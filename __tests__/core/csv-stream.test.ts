import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => { vol.reset(); vi.resetModules(); });

describe("parseCSVSync", () => {
  it("parses header row and data rows", async () => {
    const { parseCSVSync } = await import("../../src/core/csv-stream.js");
    const result = parseCSVSync("name,email\nAlice,alice@example.com\nBob,bob@example.com");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: "Alice", email: "alice@example.com" });
    expect(result[1]).toEqual({ name: "Bob", email: "bob@example.com" });
  });

  it("returns empty array for header-only CSV", async () => {
    const { parseCSVSync } = await import("../../src/core/csv-stream.js");
    expect(parseCSVSync("name,email")).toEqual([]);
  });

  it("returns empty array for empty string", async () => {
    const { parseCSVSync } = await import("../../src/core/csv-stream.js");
    expect(parseCSVSync("")).toEqual([]);
  });

  it("handles quoted fields containing commas", async () => {
    const { parseCSVSync } = await import("../../src/core/csv-stream.js");
    const result = parseCSVSync(`name,city\n"Smith, John","New York"`);
    expect(result[0]).toEqual({ name: "Smith, John", city: "New York" });
  });

  it("handles semicolon delimiter", async () => {
    const { parseCSVSync } = await import("../../src/core/csv-stream.js");
    const result = parseCSVSync("name;email\nAlice;alice@example.com", ";");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ name: "Alice", email: "alice@example.com" });
  });

  it("trims whitespace from field values", async () => {
    const { parseCSVSync } = await import("../../src/core/csv-stream.js");
    const result = parseCSVSync("name,value\n  Alice  , 42 ");
    expect(result[0]).toEqual({ name: "Alice", value: "42" });
  });
});

describe("streamCSV", () => {
  it("yields rows as objects matching headers", async () => {
    vol.fromJSON({ "/data/test.csv": "name,email\nAlice,alice@example.com\nBob,bob@example.com" });
    const { streamCSV } = await import("../../src/core/csv-stream.js");
    const rows: Array<Record<string, string>> = [];
    for await (const row of streamCSV("/data/test.csv")) rows.push(row);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: "Alice", email: "alice@example.com" });
    expect(rows[1]).toEqual({ name: "Bob", email: "bob@example.com" });
  });

  it("skips blank lines", async () => {
    vol.fromJSON({ "/data/test.csv": "name,email\n\nAlice,alice@example.com\n\n" });
    const { streamCSV } = await import("../../src/core/csv-stream.js");
    const rows: Array<Record<string, string>> = [];
    for await (const row of streamCSV("/data/test.csv")) rows.push(row);
    expect(rows).toHaveLength(1);
  });

  it("yields zero rows for header-only file", async () => {
    vol.fromJSON({ "/data/test.csv": "name,email\n" });
    const { streamCSV } = await import("../../src/core/csv-stream.js");
    const rows: Array<Record<string, string>> = [];
    for await (const row of streamCSV("/data/test.csv")) rows.push(row);
    expect(rows).toHaveLength(0);
  });

  it("handles quoted fields with commas", async () => {
    vol.fromJSON({ "/data/test.csv": `name,city\n"Smith, John","New York"` });
    const { streamCSV } = await import("../../src/core/csv-stream.js");
    const rows: Array<Record<string, string>> = [];
    for await (const row of streamCSV("/data/test.csv")) rows.push(row);
    expect(rows[0]).toEqual({ name: "Smith, John", city: "New York" });
  });
});
