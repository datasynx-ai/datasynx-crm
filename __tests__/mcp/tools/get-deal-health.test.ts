import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

vi.mock("../../../src/fs/pipeline-writer.js", () => ({
  readPipeline: vi.fn().mockResolvedValue([]),
  upsertDeal: vi.fn().mockResolvedValue(undefined),
}));

import { handleGetDealHealth } from "../../../src/mcp/tools/get-deal-health.js";
import { readPipeline } from "../../../src/fs/pipeline-writer.js";

const mockRead = vi.mocked(readPipeline);

describe("get_deal_health tool", () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    mockRead.mockResolvedValue([]);
  });

  it("returns empty deals array when no pipeline", async () => {
    const result = await handleGetDealHealth({ slug: "acme-corp" }, "/data");
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      slug: string;
      deals: unknown[];
    };
    expect(parsed.slug).toBe("acme-corp");
    expect(parsed.deals).toHaveLength(0);
  });

  it("returns health scores for deals", async () => {
    const today = new Date().toISOString().slice(0, 10);
    mockRead.mockResolvedValue([
      {
        name: "Enterprise License",
        stage: "proposal",
        currency: "EUR",
        updated: today,
        probability: 60,
        value: 50000,
      },
    ]);

    const result = await handleGetDealHealth({ slug: "acme-corp" }, "/data");
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      slug: string;
      deals: Array<{ deal: string; stage: string; score: number; grade: string; warnings: string[] }>;
    };

    expect(parsed.deals).toHaveLength(1);
    expect(parsed.deals[0]!.deal).toBe("Enterprise License");
    expect(parsed.deals[0]!.stage).toBe("proposal");
    expect(typeof parsed.deals[0]!.score).toBe("number");
    expect(["A", "B", "C", "D", "F"]).toContain(parsed.deals[0]!.grade);
    expect(Array.isArray(parsed.deals[0]!.warnings)).toBe(true);
  });

  it("returns success:false on error", async () => {
    mockRead.mockRejectedValue(new Error("Pipeline read failed"));
    const result = await handleGetDealHealth({ slug: "acme-corp" }, "/data");
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      success: boolean;
      error: string;
    };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/Pipeline read failed/);
  });

  it("scores old deals lower (stale deal has lower score)", async () => {
    // Deal updated 90 days ago
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const todayStr = new Date().toISOString().slice(0, 10);

    mockRead
      .mockResolvedValueOnce([
        {
          name: "Stale Deal",
          stage: "proposal",
          currency: "EUR",
          updated: ninetyDaysAgo,
          probability: 60,
          value: 50000,
        },
      ])
      .mockResolvedValueOnce([
        {
          name: "Fresh Deal",
          stage: "proposal",
          currency: "EUR",
          updated: todayStr,
          probability: 60,
          value: 50000,
        },
      ]);

    const staleResult = await handleGetDealHealth({ slug: "acme-corp" }, "/data");
    const freshResult = await handleGetDealHealth({ slug: "acme-corp" }, "/data");

    const staleParsed = JSON.parse((staleResult.content[0] as { type: string; text: string }).text) as {
      deals: Array<{ score: number }>;
    };
    const freshParsed = JSON.parse((freshResult.content[0] as { type: string; text: string }).text) as {
      deals: Array<{ score: number }>;
    };

    expect(staleParsed.deals[0]!.score).toBeLessThan(freshParsed.deals[0]!.score);
  });
});
