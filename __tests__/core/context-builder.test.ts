import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";

beforeEach(() => vol.reset());

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
});
