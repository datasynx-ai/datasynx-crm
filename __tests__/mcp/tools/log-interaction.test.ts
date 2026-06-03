import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

vi.mock("../../../src/fs/interactions-writer.js", () => ({
  appendInteraction: vi.fn().mockResolvedValue(undefined),
  formatInteractionEntry: vi.fn().mockReturnValue("## 2026-05-25 · Call\n..."),
}));

import { handleLogInteraction } from "../../../src/mcp/tools/log-interaction.js";
import { appendInteraction } from "../../../src/fs/interactions-writer.js";

const mockAppend = vi.mocked(appendInteraction);

describe("log_interaction tool", () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    mockAppend.mockResolvedValue(undefined);
  });

  it("returns success with path and entry for a valid call log", async () => {
    const result = await handleLogInteraction(
      {
        slug: "acme-corp",
        type: "Call",
        summary: "Discussed Q3 roadmap and pricing",
        with: "John Smith",
        nextSteps: ["Send proposal by Friday"],
      },
      "/data"
    );

    expect(result.content).toBeDefined();
    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as { success: boolean; path: string; entry: string };

    expect(parsed.success).toBe(true);
    expect(parsed.path).toContain("acme-corp");
    expect(parsed.path).toContain("interactions.md");
    expect(typeof parsed.entry).toBe("string");
  });

  it("calls appendInteraction with correct arguments", async () => {
    await handleLogInteraction(
      {
        slug: "acme-corp",
        type: "Meeting",
        summary: "Kickoff meeting with the team",
        with: "Team Lead",
      },
      "/data"
    );

    expect(mockAppend).toHaveBeenCalledOnce();
    const [calledDataDir, calledSlug, calledEntry] = mockAppend.mock.calls[0] as [
      string,
      string,
      { type: string; summary: string },
    ];
    expect(calledDataDir).toBe("/data");
    expect(calledSlug).toBe("acme-corp");
    expect(calledEntry.type).toBe("Meeting");
    expect(calledEntry.summary).toBe("Kickoff meeting with the team");
  });

  it("uses today's date (YYYY-MM-DD format) when not specified", async () => {
    await handleLogInteraction(
      {
        slug: "acme-corp",
        type: "Note",
        summary: "Added a note about the account",
        with: "self",
      },
      "/data"
    );

    const [, , calledEntry] = mockAppend.mock.calls[0] as [string, string, { date: string }];
    expect(calledEntry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("accepts all valid interaction types", async () => {
    const types = [
      "Email",
      "Call",
      "Meeting",
      "Note",
      "Demo",
      "Proposal",
      "Contract",
      "Other",
    ] as const;

    for (const type of types) {
      vi.clearAllMocks();
      mockAppend.mockResolvedValue(undefined);

      const result = await handleLogInteraction(
        {
          slug: "acme-corp",
          type,
          summary: "Test summary for this interaction type",
          with: "someone",
        },
        "/data"
      );

      const text = (result.content[0] as { type: string; text: string }).text;
      const parsed = JSON.parse(text) as { success: boolean };
      expect(parsed.success).toBe(true);
    }
  });

  it("returns success: false when appendInteraction throws", async () => {
    mockAppend.mockRejectedValue(new Error("Write failed"));

    const result = await handleLogInteraction(
      {
        slug: "acme-corp",
        type: "Call",
        summary: "A call summary here",
        with: "Jane",
      },
      "/data"
    );

    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as { success: boolean; error?: string };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBeDefined();
  });
});

describe("registerLogInteraction — handler invocation", () => {
  it("registered handler passes optional params to handleLogInteraction", async () => {
    vi.mocked(appendInteraction).mockResolvedValue(undefined);
    const { registerLogInteraction } = await import("../../../src/mcp/tools/log-interaction.js");
    type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    let capturedHandler: Handler | undefined;
    const fakeServer = {
      registerTool: (_name: string, _schema: unknown, handler: Handler) => {
        capturedHandler = handler;
      },
    };
    registerLogInteraction(fakeServer as never);
    const result = await capturedHandler!({
      slug: "acme-corp",
      type: "Call",
      summary: "Discussed renewal",
      with: "Alice",
      nextSteps: ["Follow up"],
      direction: "outbound",
      source: "phone",
      date: "2026-06-01",
    });
    const parsed = JSON.parse(result.content[0]!.text) as { success: boolean };
    expect(parsed.success).toBe(true);
  });
});
