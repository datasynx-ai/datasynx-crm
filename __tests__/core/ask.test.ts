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

describe("askCrm (retrieval)", () => {
  it("retrieves relevant sources for a question across memories/pipeline/interactions", async () => {
    vol.fromJSON({
      "/crm/customers/acme/main_facts.md":
        "---\nname: Acme\nrelationship_stage: active\ncreated: 2026-01-01\nupdated: 2026-01-01\n---\n",
      "/crm/customers/acme/interactions.md":
        "# Interactions\n\n## 2026-06-01 · Call\n**Summary:** discussed onboarding timeline\n---\n",
      "/crm/customers/acme/pipeline.md":
        "# Pipeline\n\n| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |\n|---|---|---|---|---|---|---|---|\n| Enterprise License | negotiation | 50000 | EUR | 70 | | | 2026-06-01 |\n",
    });
    const { addMemory } = await import("../../src/core/memory.js");
    addMemory(DATA_DIR, {
      scope: "customer",
      slug: "acme",
      type: "fact",
      text: "Acme pays by invoice net 30",
    });

    const { askCrm } = await import("../../src/core/ask.js");
    const res = await askCrm(DATA_DIR, "how does acme pay invoices?", "acme");
    const text = res.sources.map((s) => s.text).join(" ");
    expect(text).toMatch(/invoice/i);
    expect(res.sources.length).toBeGreaterThan(0);
    // No ANTHROPIC_API_KEY in tests → no synthesized answer, just sources.
    expect(res.answer).toBeUndefined();
  });

  it("returns empty sources when nothing matches", async () => {
    vol.fromJSON({
      "/crm/customers/acme/main_facts.md":
        "---\nname: Acme\nrelationship_stage: active\ncreated: 2026-01-01\nupdated: 2026-01-01\n---\n",
    });
    const { askCrm } = await import("../../src/core/ask.js");
    const res = await askCrm(DATA_DIR, "zzz unrelated quantum topic", "acme");
    expect(res.sources).toHaveLength(0);
  });
});
