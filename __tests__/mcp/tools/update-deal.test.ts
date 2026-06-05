import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

vi.mock("../../../src/fs/pipeline-writer.js", () => ({
  upsertDeal: vi.fn().mockResolvedValue(undefined),
  readPipeline: vi.fn().mockResolvedValue([]),
}));

import { handleUpdateDeal } from "../../../src/mcp/tools/update-deal.js";
import { upsertDeal, readPipeline } from "../../../src/fs/pipeline-writer.js";

const mockUpsert = vi.mocked(upsertDeal);
const mockReadPipeline = vi.mocked(readPipeline);

describe("update_deal tool", () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue(undefined);
    mockReadPipeline.mockResolvedValue([]);
  });

  it("merges a partial update over the existing deal (does not wipe other fields)", async () => {
    // Existing deal carries value/probability/closeDate/notes.
    mockReadPipeline.mockResolvedValue([
      {
        name: "Enterprise License",
        stage: "negotiation",
        currency: "EUR",
        value: 75000,
        probability: 60,
        close_date: "2026-07-15",
        notes: "CFO pushback",
        updated: "2026-06-03",
      },
    ]);

    // Update only the stage.
    await handleUpdateDeal(
      { slug: "acme-corp", dealName: "Enterprise License", stage: "won" },
      "/data"
    );

    const [, , calledDeal] = mockUpsert.mock.calls[0] as [
      string,
      string,
      {
        stage: string;
        value?: number;
        probability?: number;
        close_date?: string;
        notes?: string;
      },
    ];
    expect(calledDeal.stage).toBe("won");
    expect(calledDeal.value).toBe(75000);
    expect(calledDeal.probability).toBe(60);
    expect(calledDeal.close_date).toBe("2026-07-15");
    expect(calledDeal.notes).toBe("CFO pushback");
  });

  it("returns success with deal object for a valid update", async () => {
    const result = await handleUpdateDeal(
      {
        slug: "acme-corp",
        dealName: "Enterprise License",
        stage: "proposal",
        value: 50000,
        probability: 60,
      },
      "/data"
    );

    expect(result.content).toBeDefined();
    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as { success: boolean; deal: { name: string; stage: string } };

    expect(parsed.success).toBe(true);
    expect(parsed.deal).toBeDefined();
    expect(parsed.deal.name).toBe("Enterprise License");
    expect(parsed.deal.stage).toBe("proposal");
  });

  it("calls upsertDeal with correct arguments", async () => {
    await handleUpdateDeal(
      {
        slug: "beta-gmbh",
        dealName: "Pilot Project",
        stage: "qualified",
        value: 10000,
        closeDate: "2026-08-31",
      },
      "/data"
    );

    expect(mockUpsert).toHaveBeenCalledOnce();
    const [calledDataDir, calledSlug, calledDeal] = mockUpsert.mock.calls[0] as [
      string,
      string,
      { name: string; stage: string; value: number },
    ];
    expect(calledDataDir).toBe("/data");
    expect(calledSlug).toBe("beta-gmbh");
    expect(calledDeal.name).toBe("Pilot Project");
    expect(calledDeal.stage).toBe("qualified");
    expect(calledDeal.value).toBe(10000);
  });

  it("works with only dealName (minimal input)", async () => {
    const result = await handleUpdateDeal(
      {
        slug: "acme-corp",
        dealName: "Minimal Deal",
      },
      "/data"
    );

    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as { success: boolean };
    expect(parsed.success).toBe(true);
  });

  it("returns success: false when upsertDeal throws", async () => {
    mockUpsert.mockRejectedValue(new Error("Write failed"));

    const result = await handleUpdateDeal(
      {
        slug: "acme-corp",
        dealName: "Failing Deal",
        stage: "lead",
      },
      "/data"
    );

    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as { success: boolean; error?: string };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBeDefined();
  });

  it("sets updated date to today (YYYY-MM-DD)", async () => {
    await handleUpdateDeal(
      {
        slug: "acme-corp",
        dealName: "Test Deal",
        stage: "lead",
      },
      "/data"
    );

    const [, , calledDeal] = mockUpsert.mock.calls[0] as [string, string, { updated: string }];
    expect(calledDeal.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("registered handler invokes handleUpdateDeal with optional fields", async () => {
    const { registerUpdateDeal } = await import("../../../src/mcp/tools/update-deal.js");
    type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    let capturedHandler: Handler | undefined;
    const fakeServer = {
      registerTool: (_name: string, _schema: unknown, handler: Handler) => {
        capturedHandler = handler;
      },
    };
    registerUpdateDeal(fakeServer as never);
    const result = await capturedHandler!({
      slug: "acme-corp",
      dealName: "Test Deal",
      stage: "negotiation",
      value: 50000,
      probability: 80,
      closeDate: "2026-09-30",
      notes: "Budget confirmed",
    });
    const parsed = JSON.parse(result.content[0]!.text) as { success: boolean };
    expect(parsed.success).toBe(true);
  });
});
