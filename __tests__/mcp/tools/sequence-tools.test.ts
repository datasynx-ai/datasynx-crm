import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

const mockListSequences = vi.hoisted(() => vi.fn());
const mockReadEnrollments = vi.hoisted(() => vi.fn());
const mockUpdateEnrollment = vi.hoisted(() => vi.fn());

vi.mock("../../../src/fs/sequence-store.js", () => ({
  listSequences: mockListSequences,
  readEnrollments: mockReadEnrollments,
  updateEnrollment: mockUpdateEnrollment,
}));

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

const DATA_DIR = "/data";

function makeSequence(id: string, stepCount = 3) {
  return {
    id,
    name: `Sequence ${id}`,
    steps: Array.from({ length: stepCount }, (_, i) => ({
      day: i,
      subject: `Step ${i}`,
      body: "",
    })),
  };
}

function makeEnrollment(
  id: string,
  slug: string,
  sequenceId: string,
  status: "active" | "paused" | "completed" = "active"
) {
  return {
    id,
    slug,
    sequenceId,
    status,
    contactEmail: `contact@${slug}.com`,
    startedAt: "2026-05-28T10:00:00Z",
    currentStep: 0,
  };
}

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
});

// ─── list_sequences ────────────────────────────────────────────────────────────

describe("handleListSequences", () => {
  it("returns sequences with step and enrollment counts", async () => {
    mockListSequences.mockReturnValue([makeSequence("onboarding", 5), makeSequence("nurture", 3)]);
    mockReadEnrollments.mockReturnValue([
      makeEnrollment("e1", "acme", "onboarding"),
      makeEnrollment("e2", "beta", "onboarding"),
      makeEnrollment("e3", "acme", "nurture"),
    ]);
    const { handleListSequences } = await import("../../../src/mcp/tools/list-sequences.js");
    const result = await handleListSequences({}, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as {
      sequences: Array<{ id: string; stepCount: number; enrollmentCount: number }>;
    };
    expect(parsed.sequences.length).toBe(2);
    const onboarding = parsed.sequences.find((s) => s.id === "onboarding")!;
    expect(onboarding.stepCount).toBe(5);
    expect(onboarding.enrollmentCount).toBe(2);
  });

  it("returns empty sequences list", async () => {
    mockListSequences.mockReturnValue([]);
    mockReadEnrollments.mockReturnValue([]);
    const { handleListSequences } = await import("../../../src/mcp/tools/list-sequences.js");
    const result = await handleListSequences({}, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { sequences: unknown[] };
    expect(parsed.sequences.length).toBe(0);
  });

  it("surfaces the starter flag, omitting it for non-starter sequences", async () => {
    mockListSequences.mockReturnValue([
      { ...makeSequence("starter-cold-outreach", 3), starter: true },
      makeSequence("custom", 2),
    ]);
    mockReadEnrollments.mockReturnValue([]);
    const { handleListSequences } = await import("../../../src/mcp/tools/list-sequences.js");
    const result = await handleListSequences({}, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as {
      sequences: Array<{ id: string; starter?: boolean }>;
    };
    expect(parsed.sequences.find((s) => s.id === "starter-cold-outreach")!.starter).toBe(true);
    expect(parsed.sequences.find((s) => s.id === "custom")!.starter).toBeUndefined();
  });
});

// ─── list_sequence_enrollments ─────────────────────────────────────────────────

describe("handleListSequenceEnrollments", () => {
  it("returns all enrollments with no filter", async () => {
    mockReadEnrollments.mockReturnValue([
      makeEnrollment("e1", "acme", "onboarding"),
      makeEnrollment("e2", "beta", "nurture"),
    ]);
    const { handleListSequenceEnrollments } =
      await import("../../../src/mcp/tools/list-sequence-enrollments.js");
    const result = await handleListSequenceEnrollments({}, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { enrollments: unknown[] };
    expect(parsed.enrollments.length).toBe(2);
  });

  it("filters by slug", async () => {
    mockReadEnrollments.mockReturnValue([
      makeEnrollment("e1", "acme", "onboarding"),
      makeEnrollment("e2", "beta", "nurture"),
    ]);
    const { handleListSequenceEnrollments } =
      await import("../../../src/mcp/tools/list-sequence-enrollments.js");
    const result = await handleListSequenceEnrollments({ slug: "acme" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { enrollments: Array<{ slug: string }> };
    expect(parsed.enrollments.length).toBe(1);
    expect(parsed.enrollments[0].slug).toBe("acme");
  });

  it("filters by status", async () => {
    mockReadEnrollments.mockReturnValue([
      makeEnrollment("e1", "acme", "onboarding", "active"),
      makeEnrollment("e2", "beta", "nurture", "paused"),
      makeEnrollment("e3", "gamma", "onboarding", "active"),
    ]);
    const { handleListSequenceEnrollments } =
      await import("../../../src/mcp/tools/list-sequence-enrollments.js");
    const result = await handleListSequenceEnrollments({ status: "active" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { enrollments: unknown[] };
    expect(parsed.enrollments.length).toBe(2);
  });
});

// ─── unenroll_from_sequence ────────────────────────────────────────────────────

describe("handleUnenrollFromSequence", () => {
  it("returns success when enrollment updated", async () => {
    mockUpdateEnrollment.mockResolvedValue({ id: "e1", status: "paused" });
    const { handleUnenrollFromSequence } =
      await import("../../../src/mcp/tools/unenroll-from-sequence.js");
    const result = await handleUnenrollFromSequence({ enrollmentId: "e1" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { success: boolean };
    expect(parsed.success).toBe(true);
  });

  it("returns error when enrollment not found", async () => {
    mockUpdateEnrollment.mockResolvedValue(null);
    const { handleUnenrollFromSequence } =
      await import("../../../src/mcp/tools/unenroll-from-sequence.js");
    const result = await handleUnenrollFromSequence({ enrollmentId: "missing" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { success: boolean; error: string };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("missing");
  });

  it("calls updateEnrollment with status paused", async () => {
    mockUpdateEnrollment.mockResolvedValue({ id: "e1", status: "paused" });
    const { handleUnenrollFromSequence } =
      await import("../../../src/mcp/tools/unenroll-from-sequence.js");
    await handleUnenrollFromSequence({ enrollmentId: "e1" }, DATA_DIR);
    expect(mockUpdateEnrollment).toHaveBeenCalledWith(DATA_DIR, "e1", { status: "paused" });
  });
});

describe("registerListSequenceEnrollments — handler invocation", () => {
  it("registered handler passes optional slug and status filters", async () => {
    mockReadEnrollments.mockReturnValue([makeEnrollment("e1", "acme", "onboarding", "active")]);
    const { registerListSequenceEnrollments } =
      await import("../../../src/mcp/tools/list-sequence-enrollments.js");
    type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    let capturedHandler: Handler | undefined;
    const fakeServer = {
      registerTool: (_name: string, _schema: unknown, handler: Handler) => {
        capturedHandler = handler;
      },
    };
    registerListSequenceEnrollments(fakeServer as never, DATA_DIR);
    const result = await capturedHandler!({ slug: "acme", status: "active" });
    const parsed = JSON.parse(result.content[0]!.text) as { enrollments: unknown[] };
    expect(Array.isArray(parsed.enrollments)).toBe(true);
  });
});

describe("registerCloseTicket — handler invocation", () => {
  it("registered handler passes optional resolution to handleCloseTicket", async () => {
    const mockReadTickets = vi.fn().mockResolvedValue([
      {
        id: "T-001",
        title: "Bug",
        status: "open",
        priority: "normal",
        created: "2026-05-01",
      },
    ]);
    const mockUpsertTicket = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../../../src/fs/ticket-writer.js", () => ({
      readTickets: mockReadTickets,
      upsertTicket: mockUpsertTicket,
      listAllTickets: vi.fn(),
    }));
    const mockAppendInteractionLocal = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../../../src/fs/interactions-writer.js", () => ({
      appendInteraction: mockAppendInteractionLocal,
    }));
    const { registerCloseTicket } = await import("../../../src/mcp/tools/close-ticket.js");
    type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    let capturedHandler: Handler | undefined;
    const fakeServer = {
      registerTool: (_name: string, _schema: unknown, handler: Handler) => {
        capturedHandler = handler;
      },
    };
    registerCloseTicket(fakeServer as never, DATA_DIR);
    const result = await capturedHandler!({ slug: "acme", ticketId: "T-001", resolution: "Fixed" });
    const parsed = JSON.parse(result.content[0]!.text) as { ticket: { status: string } };
    expect(parsed.ticket.status).toBe("closed");
  });
});
