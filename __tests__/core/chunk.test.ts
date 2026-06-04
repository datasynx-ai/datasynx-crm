import { describe, it, expect } from "vitest";
import { chunkText } from "../../src/core/chunk.js";

describe("chunkText", () => {
  it("returns a single chunk for short text", () => {
    expect(chunkText("hello world")).toEqual(["hello world"]);
  });

  it("returns no chunks for empty or whitespace text", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n  ")).toEqual([]);
  });

  it("splits long text into multiple chunks under the limit", () => {
    const text = "a".repeat(100) + " " + "b".repeat(100) + " " + "c".repeat(100);
    const chunks = chunkText(text, { maxChars: 120, overlap: 10 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(120);
  });

  it("covers the whole input across chunks", () => {
    const words = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
    const chunks = chunkText(words, { maxChars: 200, overlap: 20 });
    expect(chunks[0]).toContain("word0");
    expect(chunks[chunks.length - 1]).toContain("word199");
  });

  it("overlaps consecutive chunks", () => {
    const text = Array.from({ length: 50 }, (_, i) => `t${i}`).join(" ");
    const chunks = chunkText(text, { maxChars: 40, overlap: 15 });
    // The tail of chunk 0 should reappear at the head of chunk 1.
    const tail = chunks[0]!.slice(-10);
    expect(chunks[1]).toContain(tail.trim().split(" ")[0]!);
  });

  it("breaks on whitespace rather than mid-word", () => {
    const text = "alpha beta gamma delta epsilon zeta eta theta";
    const chunks = chunkText(text, { maxChars: 20, overlap: 0 });
    for (const c of chunks) expect(c).not.toMatch(/^\S*$/); // not a single broken token only
  });
});
