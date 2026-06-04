import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";
import { isSafeSlug, assertSafeSlug } from "../../src/fs/customer-dir.js";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

beforeEach(() => vol.reset());

describe("isSafeSlug", () => {
  it("accepts legitimate slugs", () => {
    for (const s of ["acme-corp", "beta-gmbh", "a", "docs_acme_corp", "acme.com", "Acme", "x9"]) {
      expect(isSafeSlug(s), s).toBe(true);
    }
  });

  it("rejects path-traversal and malformed slugs", () => {
    for (const s of [
      "../etc",
      "..",
      ".",
      "a/../b",
      "a/b",
      "a\\b",
      "..\\..\\x",
      "",
      "foo/..",
      "with\0null",
    ]) {
      expect(isSafeSlug(s), s).toBe(false);
    }
    expect(isSafeSlug(123 as unknown as string)).toBe(false);
  });

  it("assertSafeSlug throws on an unsafe slug", () => {
    expect(() => assertSafeSlug("../../etc")).toThrow(/invalid customer slug/i);
    expect(() => assertSafeSlug("acme-corp")).not.toThrow();
  });
});

describe("fs writers reject traversal slugs", () => {
  it("writeMainFacts refuses a traversal slug", async () => {
    const { writeMainFacts } = await import("../../src/fs/customer-dir.js");
    await expect(
      writeMainFacts("/crm", "../../evil", {
        name: "x",
        relationship_stage: "active",
        currency: "EUR",
        tags: [],
        created: "2026-01-01",
        updated: "2026-01-01",
      })
    ).rejects.toThrow(/invalid customer slug/i);
  });

  it("appendInteraction refuses a traversal slug", async () => {
    const { appendInteraction } = await import("../../src/fs/interactions-writer.js");
    await expect(
      appendInteraction("/crm", "../escape", {
        date: "2026-01-01",
        type: "Note",
        with: "x",
        summary: "y",
        nextSteps: [],
        sourceRef: "s",
        synced: "2026-01-01",
      })
    ).rejects.toThrow(/invalid customer slug/i);
  });
});
