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
  - day: 3
    templateId: followup-1
    skipIfReplied: true
createdAt: '2026-05-29T00:00:00.000Z'
`;

const TEMPLATE_INTRO = `---
id: intro
subject: Hello {{company}}
category: outreach
variables:
  - company
language: de
createdAt: '2026-05-29'
---

Hi there, welcome to {{company}}.`;

const TEMPLATE_FOLLOWUP = `---
id: followup-1
subject: Following up
category: outreach
variables: []
language: de
createdAt: '2026-05-29'
---

Just checking in.`;

const MAIN_FACTS = [
  "---",
  "name: Acme Corp",
  "domain: acme.com",
  "email: ceo@acme.com",
  "relationship_stage: prospect",
  "tags: []",
  "currency: EUR",
  "created: '2026-05-29'",
  "updated: '2026-05-29'",
  "last_touchpoint: 2026-05-29",
  "---",
  "",
].join("\n");

function baseEnrollment() {
  return {
    id: "e1",
    sequenceId: "outreach",
    slug: "acme",
    contactEmail: "ceo@acme.com",
    enrolledAt: "2026-05-29T00:00:00.000Z",
    status: "active" as const,
    currentStep: 0,
    stepsCompleted: [] as number[],
  };
}

describe("addDays", () => {
  it("adds days correctly across month boundaries", async () => {
    const { addDays } = await import("../../src/core/sequence-engine.js");
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("processSequenceStep", () => {
  beforeEach(() => { vol.reset(); vi.resetModules(); });

  it("returns no_step_due when step not yet due", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/sequences/outreach.yaml`]: SEQ_YAML,
      [`${DATA_DIR}/.agentic/templates/outreach/intro.md`]: TEMPLATE_INTRO,
      [`${DATA_DIR}/customers/acme/main_facts.md`]: MAIN_FACTS,
    });
    const { processSequenceStep } = await import("../../src/core/sequence-engine.js");
    const enrollment = { ...baseEnrollment(), enrolledAt: "2026-05-29T00:00:00.000Z" };
    // step 0 is due on day 0 → today = enrolledAt → should send or at least not return no_step_due for day 0
    // Use day > 0 step: advance to step 1 (day 3), check before day 3
    const enrollment2 = { ...baseEnrollment(), currentStep: 1, stepsCompleted: [0] };
    const result = await processSequenceStep(DATA_DIR, enrollment2, "2026-05-29");
    expect(result).toBe("no_step_due"); // day 3, but today is day 0
  });

  it("returns no_step_due when sequence not found", async () => {
    vol.fromJSON({});
    const { processSequenceStep } = await import("../../src/core/sequence-engine.js");
    const result = await processSequenceStep(DATA_DIR, { ...baseEnrollment(), sequenceId: "ghost" }, "2026-05-29");
    expect(result).toBe("no_step_due");
  });

  it("returns completed when all steps done", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/sequences/outreach.yaml`]: SEQ_YAML,
    });
    const { processSequenceStep } = await import("../../src/core/sequence-engine.js");
    const enrollment = { ...baseEnrollment(), currentStep: 99 };
    const result = await processSequenceStep(DATA_DIR, enrollment, "2026-05-29");
    expect(result).toBe("completed");
  });

  it("skips step when already replied and skipIfReplied=true", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/sequences/outreach.yaml`]: SEQ_YAML,
      [`${DATA_DIR}/.agentic/templates/outreach/intro.md`]: TEMPLATE_INTRO,
      [`${DATA_DIR}/customers/acme/main_facts.md`]: MAIN_FACTS,
    });
    const { processSequenceStep } = await import("../../src/core/sequence-engine.js");
    const enrollment = { ...baseEnrollment(), lastRepliedAt: "2026-05-28T12:00:00.000Z" };
    const result = await processSequenceStep(DATA_DIR, enrollment, "2026-05-29");
    expect(result).toBe("skipped_replied");
  });
});

describe("runSequenceCycle", () => {
  beforeEach(() => { vol.reset(); vi.resetModules(); });

  it("processes 0 enrollments successfully", async () => {
    vol.fromJSON({});
    const { runSequenceCycle } = await import("../../src/core/sequence-engine.js");
    const result = await runSequenceCycle(DATA_DIR, "2026-05-29");
    expect(result.processed).toBe(0);
    expect(result.sent).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it("skips paused enrollments", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/sequence-enrollments.json`]: JSON.stringify([
        { ...baseEnrollment(), status: "paused" },
      ]),
    });
    const { runSequenceCycle } = await import("../../src/core/sequence-engine.js");
    const result = await runSequenceCycle(DATA_DIR, "2026-05-29");
    expect(result.processed).toBe(0);
  });

  it("counts completed enrollments from cycle", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/sequences/outreach.yaml`]: SEQ_YAML,
      [`${DATA_DIR}/.agentic/sequence-enrollments.json`]: JSON.stringify([
        { ...baseEnrollment(), currentStep: 99 }, // will complete immediately
      ]),
    });
    const { runSequenceCycle } = await import("../../src/core/sequence-engine.js");
    const result = await runSequenceCycle(DATA_DIR, "2026-05-29");
    expect(result.completed).toBe(1);
  });
});
