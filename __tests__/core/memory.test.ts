import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

beforeEach(() => {
  vol.reset();
});

const DATA_DIR = "/crm";
async function mod() {
  return import("../../src/core/memory.js");
}

describe("memory store", () => {
  it("adds and loads global + customer memories", async () => {
    const { addMemory, loadMemories } = await mod();
    addMemory(DATA_DIR, {
      scope: "global",
      type: "instruction",
      text: "Always CC legal on contracts",
    });
    addMemory(DATA_DIR, {
      scope: "customer",
      slug: "acme",
      type: "fact",
      text: "Acme pays by invoice",
    });

    // customer view includes global + that customer's memories
    const acme = loadMemories(DATA_DIR, "acme");
    expect(acme.map((m) => m.text)).toContain("Always CC legal on contracts");
    expect(acme.map((m) => m.text)).toContain("Acme pays by invoice");

    // global-only view excludes customer memories
    const global = loadMemories(DATA_DIR);
    expect(global.map((m) => m.text)).toContain("Always CC legal on contracts");
    expect(global.map((m) => m.text)).not.toContain("Acme pays by invoice");
  });

  it("searches memories by relevance (hybrid keyword)", async () => {
    const { addMemory, searchMemory } = await mod();
    addMemory(DATA_DIR, {
      scope: "customer",
      slug: "acme",
      type: "fact",
      text: "Acme pays by invoice net 30",
    });
    addMemory(DATA_DIR, {
      scope: "customer",
      slug: "acme",
      type: "preference",
      text: "Prefers morning calls",
    });

    const hits = await searchMemory(DATA_DIR, "invoice payment terms", "acme");
    expect(hits[0]!.text).toContain("invoice");
  });
});
