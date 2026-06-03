import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});
vi.mock("@lancedb/lancedb", () => ({
  connect: vi.fn().mockResolvedValue({ tableNames: vi.fn().mockResolvedValue([]) }),
}));

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

describe("listSequences", () => {
  beforeEach(() => {
    vol.reset();
    vi.resetModules();
  });

  it("returns empty array when directory absent", async () => {
    vol.fromJSON({});
    const { listSequences } = await import("../../src/fs/sequence-store.js");
    expect(listSequences(DATA_DIR)).toEqual([]);
  });

  it("returns parsed sequences", async () => {
    vol.fromJSON({ [`${DATA_DIR}/.agentic/sequences/outreach.yaml`]: SEQ_YAML });
    const { listSequences } = await import("../../src/fs/sequence-store.js");
    const seqs = listSequences(DATA_DIR);
    expect(seqs).toHaveLength(1);
    expect(seqs[0]!.id).toBe("outreach");
    expect(seqs[0]!.steps).toHaveLength(2);
  });

  it("skips invalid YAML files gracefully", async () => {
    // "key: [unclosed" triggers a YAMLException in js-yaml (unclosed flow sequence)
    vol.fromJSON({ [`${DATA_DIR}/.agentic/sequences/broken.yaml`]: "key: [unclosed" });
    const { listSequences } = await import("../../src/fs/sequence-store.js");
    expect(listSequences(DATA_DIR)).toEqual([]);
  });
});

describe("getSequence", () => {
  beforeEach(() => {
    vol.reset();
    vi.resetModules();
  });

  it("returns null for missing id", async () => {
    vol.fromJSON({});
    const { getSequence } = await import("../../src/fs/sequence-store.js");
    expect(getSequence(DATA_DIR, "ghost")).toBeNull();
  });

  it("finds a sequence by id", async () => {
    vol.fromJSON({ [`${DATA_DIR}/.agentic/sequences/outreach.yaml`]: SEQ_YAML });
    const { getSequence } = await import("../../src/fs/sequence-store.js");
    const seq = getSequence(DATA_DIR, "outreach");
    expect(seq?.name).toBe("Cold Outreach");
  });
});

describe("writeSequence / readEnrollments / writeEnrollment / updateEnrollment", () => {
  beforeEach(() => {
    vol.reset();
    vi.resetModules();
  });

  it("writes and reads back a sequence", async () => {
    vol.fromJSON({});
    const { writeSequence, getSequence } = await import("../../src/fs/sequence-store.js");
    writeSequence(DATA_DIR, {
      id: "test",
      name: "Test Seq",
      steps: [{ day: 0, templateId: "t1", skipIfReplied: true }],
      createdAt: "2026-05-29T00:00:00.000Z",
    });
    const seq = getSequence(DATA_DIR, "test");
    expect(seq?.name).toBe("Test Seq");
  });

  it("writeEnrollment appends to file", async () => {
    vol.fromJSON({});
    const { writeEnrollment, readEnrollments } = await import("../../src/fs/sequence-store.js");
    const e = {
      id: "e1",
      sequenceId: "outreach",
      slug: "acme",
      contactEmail: "x@acme.com",
      enrolledAt: "2026-05-29T00:00:00.000Z",
      status: "active" as const,
      currentStep: 0,
      stepsCompleted: [],
    };
    await writeEnrollment(DATA_DIR, e);
    expect(readEnrollments(DATA_DIR)).toHaveLength(1);
  });

  it("updateEnrollment modifies existing enrollment", async () => {
    vol.fromJSON({});
    const { writeEnrollment, updateEnrollment, readEnrollments } =
      await import("../../src/fs/sequence-store.js");
    const e = {
      id: "e1",
      sequenceId: "outreach",
      slug: "acme",
      contactEmail: "x@acme.com",
      enrolledAt: "2026-05-29T00:00:00.000Z",
      status: "active" as const,
      currentStep: 0,
      stepsCompleted: [],
    };
    await writeEnrollment(DATA_DIR, e);
    await updateEnrollment(DATA_DIR, "e1", { status: "paused" });
    const updated = readEnrollments(DATA_DIR)[0];
    expect(updated?.status).toBe("paused");
  });

  it("updateEnrollment returns null for missing id", async () => {
    vol.fromJSON({});
    const { updateEnrollment } = await import("../../src/fs/sequence-store.js");
    const result = await updateEnrollment(DATA_DIR, "ghost", { status: "paused" });
    expect(result).toBeNull();
  });

  it("readEnrollments returns [] when file has invalid JSON", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/sequence-enrollments.json`]: "NOT VALID JSON{{",
    });
    const { readEnrollments } = await import("../../src/fs/sequence-store.js");
    expect(readEnrollments(DATA_DIR)).toEqual([]);
  });
});
