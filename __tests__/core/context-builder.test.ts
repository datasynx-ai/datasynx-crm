import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

// Mock the LanceDB-backed search so retrieval-augmented context is deterministic.
const { searchKnowledgeMock } = vi.hoisted(() => ({ searchKnowledgeMock: vi.fn() }));
vi.mock("../../src/core/lancedb.js", () => ({ searchKnowledge: searchKnowledgeMock }));

beforeEach(() => {
  vol.reset();
  searchKnowledgeMock.mockReset();
  searchKnowledgeMock.mockResolvedValue([]);
});

describe("buildContext", () => {
  it("throws when customer does not exist", async () => {
    const { buildContext } = await import("../../src/core/context-builder.js");
    await expect(buildContext("/data", "nonexistent")).rejects.toThrow("not found");
  });

  it("builds context with main_facts metadata", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md":
        "---\nname: Acme Corp\nrelationship_stage: active\ncreated: '2026-01-01'\nupdated: '2026-05-26'\n---\n",
      "/data/customers/acme-corp/interactions.md": "# Interactions\n",
      "/data/customers/acme-corp/pipeline.md": "# Pipeline\n",
    });

    const { buildContext } = await import("../../src/core/context-builder.js");
    const ctx = await buildContext("/data", "acme-corp");

    expect(ctx).toContain("acme-corp");
    expect(ctx).toContain("Acme Corp");
    expect(ctx).toContain("active");
  });

  it("includes recent interactions", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md":
        "---\nname: Acme Corp\nrelationship_stage: active\ncreated: '2026-01-01'\nupdated: '2026-05-26'\n---\n",
      "/data/customers/acme-corp/interactions.md":
        "# Interactions\n\n## 2026-05-25\n**Call** with John\nDiscussed pricing.\n\n## 2026-05-20\n**Email** from Jane\nFollowup on contract.\n",
      "/data/customers/acme-corp/pipeline.md": "# Pipeline\n",
    });

    const { buildContext } = await import("../../src/core/context-builder.js");
    const ctx = await buildContext("/data", "acme-corp");

    expect(ctx).toContain("2026-05-25");
    expect(ctx).toContain("2026-05-20");
  });

  it("includes pipeline content", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md":
        "---\nname: Acme Corp\nrelationship_stage: active\ncreated: '2026-01-01'\nupdated: '2026-05-26'\n---\n",
      "/data/customers/acme-corp/interactions.md": "# Interactions\n",
      "/data/customers/acme-corp/pipeline.md":
        "# Pipeline\n\n| Deal | Stage | Value | Currency | Probability | Close Date | Updated | Notes |\n|---|---|---|---|---|---|---|---|\n| Enterprise | proposal | 50000 | EUR | 0.7 | 2026-06-30 | 2026-05-26 | Negotiating |\n",
    });

    const { buildContext } = await import("../../src/core/context-builder.js");
    const ctx = await buildContext("/data", "acme-corp");

    expect(ctx).toContain("Enterprise");
    expect(ctx).toContain("proposal");
  });

  it("handles missing files gracefully", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md":
        "---\nname: Acme Corp\nrelationship_stage: active\ncreated: '2026-01-01'\nupdated: '2026-05-26'\n---\n",
    });

    const { buildContext } = await import("../../src/core/context-builder.js");
    const ctx = await buildContext("/data", "acme-corp");

    expect(ctx).toContain("no interactions yet");
    expect(ctx).toContain("no deals");
  });

  it("returns a string under ~12000 chars for typical customer", async () => {
    const manyInteractions = Array.from(
      { length: 20 },
      (_, i) =>
        `## 2026-05-${String(i + 1).padStart(2, "0")}\n**Call** with Person\n${"Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(5)}\n`
    ).join("\n");

    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md":
        "---\nname: Acme Corp\nrelationship_stage: active\ncreated: '2026-01-01'\nupdated: '2026-05-26'\n---\n",
      "/data/customers/acme-corp/interactions.md": `# Interactions\n\n${manyInteractions}`,
      "/data/customers/acme-corp/pipeline.md": "# Pipeline\n",
    });

    const { buildContext } = await import("../../src/core/context-builder.js");
    const ctx = await buildContext("/data", "acme-corp");

    // Should be trimmed — not include all 20 entries
    expect(ctx.length).toBeLessThan(12000);
  });

  it("appends retrieved relevant history when a focus query is given", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md":
        "---\nname: Acme Corp\nrelationship_stage: active\ncreated: '2026-01-01'\nupdated: '2026-05-26'\n---\n",
      // Recent interactions do NOT mention the focus term; only the indexed hit does.
      "/data/customers/acme-corp/interactions.md":
        "# Interactions\n\n## 2026-05-25\n**Call** with John\nWeekly sync.\n",
      "/data/customers/acme-corp/pipeline.md": "# Pipeline\n",
    });
    searchKnowledgeMock.mockResolvedValueOnce([
      {
        content: "Agreed GDPR data residency must stay in the EU",
        source: "gmail://thread/9",
        score: 0.9,
      },
    ]);

    const { buildContext } = await import("../../src/core/context-builder.js");
    const ctx = await buildContext("/data", "acme-corp", "data residency");

    expect(searchKnowledgeMock).toHaveBeenCalledWith(
      "/data",
      "acme-corp",
      "data residency",
      expect.any(Number)
    );
    expect(ctx).toContain("Relevant History");
    expect(ctx).toContain("GDPR data residency must stay in the EU");
  });

  it("omits the relevant-history section when no focus is given", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md":
        "---\nname: Acme Corp\nrelationship_stage: active\ncreated: '2026-01-01'\nupdated: '2026-05-26'\n---\n",
      "/data/customers/acme-corp/interactions.md": "# Interactions\n",
      "/data/customers/acme-corp/pipeline.md": "# Pipeline\n",
    });

    const { buildContext } = await import("../../src/core/context-builder.js");
    const ctx = await buildContext("/data", "acme-corp");

    expect(ctx).not.toContain("Relevant History");
    expect(searchKnowledgeMock).not.toHaveBeenCalled();
  });

  it("trims to last 5 interactions when context exceeds 3000 tokens (12000 chars)", async () => {
    // Each entry is 2000+ chars so 10 entries = ~20000 chars interactions, well over 12000 total
    const longEntry = "word ".repeat(400); // ~2000 chars per entry
    const manyInteractions = Array.from(
      { length: 15 },
      (_, i) =>
        `## 2026-05-${String((i % 28) + 1).padStart(2, "0")}\n**Call** with Person ${i}\n${longEntry}\n`
    ).join("\n");

    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md":
        "---\nname: Acme Corp\nrelationship_stage: active\ncreated: '2026-01-01'\nupdated: '2026-05-26'\n---\n",
      "/data/customers/acme-corp/interactions.md": `# Interactions\n\n${manyInteractions}`,
      "/data/customers/acme-corp/pipeline.md": "# Pipeline\n",
    });

    const { buildContext } = await import("../../src/core/context-builder.js");
    const ctx = await buildContext("/data", "acme-corp");

    // Trim path is used: message mentions "trimmed for token budget"
    expect(ctx).toContain("trimmed for token budget");
  });
});
