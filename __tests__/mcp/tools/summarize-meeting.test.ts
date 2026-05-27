import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

vi.mock("../../../src/fs/interactions-writer.js", () => ({
  appendInteraction: vi.fn().mockResolvedValue(undefined),
  formatInteractionEntry: vi.fn().mockReturnValue("## test entry"),
  readInteractions: vi.fn().mockResolvedValue(""),
}));

vi.mock("../../../src/fs/audit-log.js", () => ({
  writeAuditEntry: vi.fn(),
  getActor: vi.fn().mockReturnValue("system"),
}));

import { handleSummarizeMeeting } from "../../../src/mcp/tools/summarize-meeting.js";
import { appendInteraction } from "../../../src/fs/interactions-writer.js";
import { writeAuditEntry } from "../../../src/fs/audit-log.js";

const mockAppend = vi.mocked(appendInteraction);

describe("summarize_meeting tool", () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    mockAppend.mockResolvedValue(undefined);
  });

  it("returns success:true and appends an interaction", async () => {
    const result = await handleSummarizeMeeting(
      {
        slug: "acme-corp",
        transcript: "Alice: Hello everyone. Bob: Let's discuss the Q3 roadmap.",
        with: "Alice, Bob",
        date: "2026-05-10",
      },
      "/data"
    );

    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      success: boolean;
      summary: string;
      nextSteps: string[];
      sourceRef: string;
    };
    expect(parsed.success).toBe(true);
    expect(typeof parsed.summary).toBe("string");
    expect(Array.isArray(parsed.nextSteps)).toBe(true);
    expect(parsed.sourceRef).toMatch(/^agent:\/\/meeting\//);
    expect(mockAppend).toHaveBeenCalledOnce();
  });

  it("uses provided date when given", async () => {
    await handleSummarizeMeeting(
      {
        slug: "acme-corp",
        transcript: "Some transcript content",
        date: "2026-03-15",
      },
      "/data"
    );

    const [, , entry] = mockAppend.mock.calls[0] as [string, string, { date: string }];
    expect(entry.date).toBe("2026-03-15");
  });

  it("uses today when no date provided", async () => {
    await handleSummarizeMeeting(
      {
        slug: "acme-corp",
        transcript: "Some transcript content",
      },
      "/data"
    );

    const [, , entry] = mockAppend.mock.calls[0] as [string, string, { date: string }];
    const today = new Date().toISOString().slice(0, 10);
    expect(entry.date).toBe(today);
  });

  it("uses provided with participant", async () => {
    await handleSummarizeMeeting(
      {
        slug: "acme-corp",
        transcript: "Alice: Hi. Bob: Hello.",
        with: "Alice Smith",
      },
      "/data"
    );

    const [, , entry] = mockAppend.mock.calls[0] as [string, string, { with: string }];
    expect(entry.with).toBe("Alice Smith");
  });

  it("defaults to 'Meeting Participant' when with not provided", async () => {
    await handleSummarizeMeeting(
      { slug: "acme-corp", transcript: "Hi there" },
      "/data"
    );

    const [, , entry] = mockAppend.mock.calls[0] as [string, string, { with: string }];
    expect(entry.with).toBe("Meeting Participant");
  });

  it("uses Meeting type for interaction", async () => {
    await handleSummarizeMeeting(
      { slug: "acme-corp", transcript: "Content" },
      "/data"
    );

    const [, , entry] = mockAppend.mock.calls[0] as [string, string, { type: string }];
    expect(entry.type).toBe("Meeting");
  });

  it("writes audit entry after success", async () => {
    await handleSummarizeMeeting(
      { slug: "acme-corp", transcript: "Meeting content" },
      "/data"
    );

    expect(vi.mocked(writeAuditEntry)).toHaveBeenCalledOnce();
    const [, entry] = vi.mocked(writeAuditEntry).mock.calls[0] as [
      string,
      { tool: string; slug: string }
    ];
    expect(entry.tool).toBe("summarize_meeting");
    expect(entry.slug).toBe("acme-corp");
  });

  it("returns success:false when appendInteraction throws", async () => {
    mockAppend.mockRejectedValue(new Error("Write failed"));

    const result = await handleSummarizeMeeting(
      { slug: "acme-corp", transcript: "Meeting content" },
      "/data"
    );

    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      success: boolean;
      error: string;
    };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/Write failed/);
  });

  it("falls back to raw transcript when LLM fails (no API key)", async () => {
    const longTranscript = "Alice: " + "word ".repeat(200);
    const result = await handleSummarizeMeeting(
      { slug: "acme-corp", transcript: longTranscript },
      "/data"
    );

    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      success: boolean;
      summary: string;
    };
    expect(parsed.success).toBe(true);
    // Summary should be the first 400 chars of transcript (fallback)
    expect(parsed.summary.length).toBeLessThanOrEqual(400);
  });
});
