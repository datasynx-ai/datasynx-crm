import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Sequence, SequenceEnrollment } from "../../src/schemas/sequence.js";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockListSequences = vi.hoisted(() => vi.fn());
const mockGetSequence = vi.hoisted(() => vi.fn());
const mockWriteSequence = vi.hoisted(() => vi.fn());
const mockReadEnrollments = vi.hoisted(() => vi.fn());
const mockWriteEnrollment = vi.hoisted(() => vi.fn());
const mockRunSequenceCycle = vi.hoisted(() => vi.fn());
const mockGetTemplate = vi.hoisted(() => vi.fn());
const mockWriteTemplate = vi.hoisted(() => vi.fn());

vi.mock("../../src/fs/sequence-store.js", () => ({
  listSequences: mockListSequences,
  getSequence: mockGetSequence,
  writeSequence: mockWriteSequence,
  readEnrollments: mockReadEnrollments,
  writeEnrollment: mockWriteEnrollment,
}));

vi.mock("../../src/core/sequence-engine.js", () => ({
  runSequenceCycle: mockRunSequenceCycle,
}));

vi.mock("../../src/fs/template-store.js", () => ({
  getTemplate: mockGetTemplate,
  writeTemplate: mockWriteTemplate,
}));

function makeSeq(overrides: Partial<Sequence> = {}): Sequence {
  return {
    id: "onboarding",
    name: "Onboarding Flow",
    steps: [
      { day: 0, templateId: "intro", skipIfReplied: true },
      { day: 3, templateId: "followup-1", skipIfReplied: true },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeEnrollment(overrides: Partial<SequenceEnrollment> = {}): SequenceEnrollment {
  return {
    id: "enroll_1",
    sequenceId: "onboarding",
    slug: "acme",
    contactEmail: "alice@acme.com",
    enrolledAt: "2026-05-01T00:00:00Z",
    status: "active",
    currentStep: 0,
    stepsCompleted: [],
    ...overrides,
  };
}

const DATA_DIR = "/data";

describe("sequenceCommand list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("shows sequences", async () => {
    mockListSequences.mockReturnValue([makeSeq()]);
    mockReadEnrollments.mockReturnValue([makeEnrollment()]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { sequenceCommand } = await import("../../src/commands/sequence.js");
    await sequenceCommand.parseAsync(["node", "sequence", "list"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("onboarding"));
    consoleSpy.mockRestore();
  });

  it("shows 'No sequences found' when list is empty", async () => {
    mockListSequences.mockReturnValue([]);
    mockReadEnrollments.mockReturnValue([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { sequenceCommand } = await import("../../src/commands/sequence.js");
    await sequenceCommand.parseAsync(["node", "sequence", "list"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No sequences"));
    consoleSpy.mockRestore();
  });
});

describe("sequenceCommand create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
    mockWriteSequence.mockImplementation(() => undefined);
  });

  it("creates a sequence skeleton", async () => {
    mockGetSequence.mockReturnValue(null);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { sequenceCommand } = await import("../../src/commands/sequence.js");
    await sequenceCommand.parseAsync([
      "node",
      "sequence",
      "create",
      "renewal",
      "--name",
      "Renewal Flow",
    ]);

    expect(mockWriteSequence).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("created"));
    consoleSpy.mockRestore();
  });

  it("scaffolds missing step templates so a fresh sequence is enroll-able out of the box", async () => {
    mockGetSequence.mockReturnValue(null);
    mockGetTemplate.mockReturnValue(null); // no templates exist yet
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { sequenceCommand } = await import("../../src/commands/sequence.js");
    await sequenceCommand.parseAsync(["node", "sequence", "create", "onboarding"]);

    // Every template referenced by the skeleton's steps must be created.
    const written = mockWriteTemplate.mock.calls.map((c) => (c[1] as { id: string }).id);
    expect(written).toEqual(expect.arrayContaining(["intro", "followup-1", "followup-2"]));
    consoleSpy.mockRestore();
  });

  it("does not overwrite step templates that already exist", async () => {
    mockGetSequence.mockReturnValue(null);
    // "intro" already exists; the two follow-ups do not.
    mockGetTemplate.mockImplementation((_dir: string, id: string) =>
      id === "intro"
        ? {
            id: "intro",
            subject: "Existing intro",
            category: "sequence",
            variables: [],
            language: "de",
            createdAt: "2026-01-01T00:00:00Z",
            body: "Existing body",
          }
        : null
    );
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { sequenceCommand } = await import("../../src/commands/sequence.js");
    await sequenceCommand.parseAsync(["node", "sequence", "create", "onboarding"]);

    const written = mockWriteTemplate.mock.calls.map((c) => (c[1] as { id: string }).id);
    expect(written).not.toContain("intro");
    expect(written).toEqual(expect.arrayContaining(["followup-1", "followup-2"]));
    consoleSpy.mockRestore();
  });

  it("exits when sequence already exists", async () => {
    mockGetSequence.mockReturnValue(makeSeq({ id: "renewal" }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as () => never);

    const { sequenceCommand } = await import("../../src/commands/sequence.js");
    await expect(
      sequenceCommand.parseAsync(["node", "sequence", "create", "renewal"])
    ).rejects.toThrow("process.exit");

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("already exists"));
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe("sequenceCommand enroll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
    mockWriteEnrollment.mockResolvedValue(undefined);
  });

  it("enrolls contact in existing sequence", async () => {
    mockGetSequence.mockReturnValue(makeSeq());
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { sequenceCommand } = await import("../../src/commands/sequence.js");
    await sequenceCommand.parseAsync([
      "node",
      "sequence",
      "enroll",
      "acme",
      "--email",
      "alice@acme.com",
      "--sequence",
      "onboarding",
    ]);

    expect(mockWriteEnrollment).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Enrolled"));
    consoleSpy.mockRestore();
  });

  it("exits when sequence not found", async () => {
    mockGetSequence.mockReturnValue(null);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as () => never);

    const { sequenceCommand } = await import("../../src/commands/sequence.js");
    await expect(
      sequenceCommand.parseAsync([
        "node",
        "sequence",
        "enroll",
        "acme",
        "--email",
        "alice@acme.com",
        "--sequence",
        "nonexistent",
      ])
    ).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe("sequenceCommand status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("shows enrollment status", async () => {
    mockReadEnrollments.mockReturnValue([makeEnrollment()]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { sequenceCommand } = await import("../../src/commands/sequence.js");
    await sequenceCommand.parseAsync(["node", "sequence", "status"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("alice@acme.com"));
    consoleSpy.mockRestore();
  });

  it("shows no enrollments message", async () => {
    mockReadEnrollments.mockReturnValue([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { sequenceCommand } = await import("../../src/commands/sequence.js");
    await sequenceCommand.parseAsync(["node", "sequence", "status"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No enrollments"));
    consoleSpy.mockRestore();
  });
});

describe("sequenceCommand run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("runs cycle and reports results", async () => {
    mockRunSequenceCycle.mockResolvedValue({ sent: 2, completed: 1, errors: [] });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { sequenceCommand } = await import("../../src/commands/sequence.js");
    await sequenceCommand.parseAsync(["node", "sequence", "run"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("sent"));
    consoleSpy.mockRestore();
  });

  it("dry-run shows active enrollments without sending", async () => {
    mockReadEnrollments.mockReturnValue([makeEnrollment(), makeEnrollment({ id: "e2" })]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { sequenceCommand } = await import("../../src/commands/sequence.js");
    await sequenceCommand.parseAsync(["node", "sequence", "run", "--dry-run"]);

    expect(mockRunSequenceCycle).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Dry run"));
    consoleSpy.mockRestore();
  });

  it("logs errors when runSequenceCycle returns errors", async () => {
    mockRunSequenceCycle.mockResolvedValue({
      sent: 0,
      completed: 0,
      errors: ["Failed to send step 1 to alice@acme.com"],
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { sequenceCommand } = await import("../../src/commands/sequence.js");
    await sequenceCommand.parseAsync(["node", "sequence", "run"]);

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Error"));
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe("sequenceCommand status — filtered by slug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("filters enrollments by slug when --slug is provided", async () => {
    mockReadEnrollments.mockReturnValue([
      makeEnrollment({ slug: "acme" }),
      makeEnrollment({ id: "e2", slug: "beta" }),
    ]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { sequenceCommand } = await import("../../src/commands/sequence.js");
    await sequenceCommand.parseAsync(["node", "sequence", "status", "--slug", "acme"]);

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("acme");
    consoleSpy.mockRestore();
  });

  it("shows no enrollments when slug filter matches nothing", async () => {
    mockReadEnrollments.mockReturnValue([makeEnrollment({ slug: "acme" })]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { sequenceCommand } = await import("../../src/commands/sequence.js");
    await sequenceCommand.parseAsync(["node", "sequence", "status", "--slug", "beta"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No enrollments"));
    consoleSpy.mockRestore();
  });
});

describe("sequenceCommand status — with lastSentAt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("includes lastSentAt in status output when present", async () => {
    mockReadEnrollments.mockReturnValue([makeEnrollment({ lastSentAt: "2026-05-10T08:00:00Z" })]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { sequenceCommand } = await import("../../src/commands/sequence.js");
    await sequenceCommand.parseAsync(["node", "sequence", "status"]);

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("last sent");
    consoleSpy.mockRestore();
  });
});

describe("sequenceCommand — branch coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
    mockGetSequence.mockReturnValue(null);
    mockListSequences.mockReturnValue([]);
    mockReadEnrollments.mockReturnValue([]);
    mockWriteSequence.mockImplementation(() => undefined);
    mockWriteEnrollment.mockResolvedValue(undefined);
    mockRunSequenceCycle.mockResolvedValue({ sent: 0, completed: 0, errors: [] });
  });

  afterEach(() => {
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("create uses id as name fallback when --name is not provided", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { sequenceCommand } = await import("../../src/commands/sequence.js");
    await sequenceCommand.parseAsync(["node", "sequence", "create", "my-seq-no-name"]);

    const call = mockWriteSequence.mock.calls[0]?.[1] as { name: string };
    expect(call?.name).toBe("my-seq-no-name");
    consoleSpy.mockRestore();
  });

  it("all commands fall back to process.cwd() when env not set", async () => {
    delete process.env["DXCRM_DATA_DIR"];
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { sequenceCommand } = await import("../../src/commands/sequence.js");

    // list
    await sequenceCommand.parseAsync(["node", "sequence", "list"]);
    // status
    await sequenceCommand.parseAsync(["node", "sequence", "status"]);
    // run
    await sequenceCommand.parseAsync(["node", "sequence", "run"]);

    consoleSpy.mockRestore();
  });

  it("create falls back to process.cwd() when env not set", async () => {
    delete process.env["DXCRM_DATA_DIR"];
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { sequenceCommand } = await import("../../src/commands/sequence.js");
    await sequenceCommand.parseAsync(["node", "sequence", "create", "my-cwd-seq"]);
    consoleSpy.mockRestore();
  });

  it("enroll falls back to process.cwd() when env not set", async () => {
    delete process.env["DXCRM_DATA_DIR"];
    mockGetSequence.mockReturnValue(makeSeq());
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { sequenceCommand } = await import("../../src/commands/sequence.js");
    await sequenceCommand.parseAsync([
      "node",
      "sequence",
      "enroll",
      "acme",
      "--email",
      "test@acme.com",
      "--sequence",
      "onboarding",
    ]);
    consoleSpy.mockRestore();
  });
});
