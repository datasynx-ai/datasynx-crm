import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";
import {
  readJsonFile,
  writeJsonFile,
  readJsonArray,
  writeJsonArray,
} from "../../src/fs/json-store.js";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

beforeEach(() => {
  vol.reset();
});

describe("json-store", () => {
  describe("readJsonFile", () => {
    it("returns the fallback when the file does not exist", () => {
      expect(readJsonFile("/x/missing.json", { a: 1 })).toEqual({ a: 1 });
    });

    it("returns the fallback when the file is not valid JSON", () => {
      vol.fromJSON({ "/x/bad.json": "{not json" });
      expect(readJsonFile("/x/bad.json", [])).toEqual([]);
    });

    it("parses and returns valid JSON", () => {
      vol.fromJSON({ "/x/good.json": JSON.stringify({ hello: "world" }) });
      expect(readJsonFile<{ hello: string }>("/x/good.json", { hello: "" })).toEqual({
        hello: "world",
      });
    });
  });

  describe("writeJsonFile", () => {
    it("writes pretty-printed JSON and creates parent directories", () => {
      writeJsonFile("/deep/nested/dir/out.json", { a: 1 });
      const raw = vol.readFileSync("/deep/nested/dir/out.json", "utf-8") as string;
      expect(JSON.parse(raw)).toEqual({ a: 1 });
      expect(raw).toContain("\n"); // pretty-printed
    });

    it("round-trips with readJsonFile", () => {
      writeJsonFile("/x/rt.json", { n: 42, items: [1, 2, 3] });
      expect(readJsonFile("/x/rt.json", null)).toEqual({ n: 42, items: [1, 2, 3] });
    });

    it("leaves no temp files behind after a successful write (atomic rename)", () => {
      writeJsonFile("/x/atomic.json", { ok: true });
      const entries = vol.readdirSync("/x") as string[];
      expect(entries).toEqual(["atomic.json"]);
      expect(entries.some((e) => e.includes(".tmp"))).toBe(false);
    });

    it("overwrites an existing file atomically (no torn content)", () => {
      writeJsonFile("/x/v.json", { v: 1 });
      writeJsonFile("/x/v.json", { v: 2 });
      expect(readJsonFile("/x/v.json", null)).toEqual({ v: 2 });
      expect((vol.readdirSync("/x") as string[]).length).toBe(1);
    });
  });

  describe("readJsonArray / writeJsonArray", () => {
    it("writes and reads a keyed array store", () => {
      writeJsonArray("/x/store.json", "items", [{ id: "a" }, { id: "b" }]);
      expect(readJsonArray<{ id: string }>("/x/store.json", "items")).toEqual([
        { id: "a" },
        { id: "b" },
      ]);
    });

    it("returns [] when the key is missing or not an array", () => {
      vol.fromJSON({ "/x/wrong.json": JSON.stringify({ items: "not-an-array" }) });
      expect(readJsonArray("/x/wrong.json", "items")).toEqual([]);
      expect(readJsonArray("/x/missing.json", "items")).toEqual([]);
    });
  });
});
