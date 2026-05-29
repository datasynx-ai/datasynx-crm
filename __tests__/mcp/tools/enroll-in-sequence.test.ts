import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => { const { fs } = await import("memfs"); return { default: fs, ...fs }; });
vi.mock("@lancedb/lancedb", () => ({ connect: vi.fn().mockResolvedValue({ tableNames: vi.fn().mockResolvedValue([]) }) }));

const DATA_DIR = "/data";

const SEQ_YAML = `id: outreach
name: Cold Outreach
steps:
  - day: 0
    templateId: intro
    skipIfReplied: true
createdAt: '2026-05-29T00:00:00.000Z'
`;

const TEMPLATE = `---
id: intro
subject: Hello {{company}}
category: outreach
variables:
  - company
language: de
createdAt: '2026-05-29'
---

Hi there.`;

describe("handleEnrollInSequence", () => {
  beforeEach(() => { vol.reset(); vi.resetModules(); });

  it("enrolls successfully when sequence and template exist", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/sequences/outreach.yaml`]: SEQ_YAML,
      [`${DATA_DIR}/.agentic/templates/outreach/intro.md`]: TEMPLATE,
    });
    const { handleEnrollInSequence } = await import("../../../src/mcp/tools/enroll-in-sequence.js");
    const res = await handleEnrollInSequence(
      { slug: "acme", contactEmail: "ceo@acme.com", sequenceId: "outreach" },
      DATA_DIR
    );
    const parsed = JSON.parse(res.content[0]!.text) as { enrollmentId: string; totalSteps: number };
    expect(parsed.enrollmentId).toMatch(/^enroll_/);
    expect(parsed.totalSteps).toBe(1);
  });

  it("returns error when sequence not found", async () => {
    vol.fromJSON({});
    const { handleEnrollInSequence } = await import("../../../src/mcp/tools/enroll-in-sequence.js");
    const res = await handleEnrollInSequence(
      { slug: "acme", contactEmail: "ceo@acme.com", sequenceId: "ghost" },
      DATA_DIR
    );
    const parsed = JSON.parse(res.content[0]!.text) as { error: string };
    expect(parsed.error).toContain("ghost");
  });

  it("returns error when first-step template missing", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/sequences/outreach.yaml`]: SEQ_YAML,
      // no template
    });
    const { handleEnrollInSequence } = await import("../../../src/mcp/tools/enroll-in-sequence.js");
    const res = await handleEnrollInSequence(
      { slug: "acme", contactEmail: "ceo@acme.com", sequenceId: "outreach" },
      DATA_DIR
    );
    const parsed = JSON.parse(res.content[0]!.text) as { error: string };
    expect(parsed.error).toContain("intro");
  });

  it("persists enrollment to disk", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/sequences/outreach.yaml`]: SEQ_YAML,
      [`${DATA_DIR}/.agentic/templates/outreach/intro.md`]: TEMPLATE,
    });
    const { handleEnrollInSequence } = await import("../../../src/mcp/tools/enroll-in-sequence.js");
    await handleEnrollInSequence(
      { slug: "acme", contactEmail: "ceo@acme.com", sequenceId: "outreach" },
      DATA_DIR
    );
    const { readEnrollments } = await import("../../../src/fs/sequence-store.js");
    const enrollments = readEnrollments(DATA_DIR);
    expect(enrollments).toHaveLength(1);
    expect(enrollments[0]!.slug).toBe("acme");
  });
});
