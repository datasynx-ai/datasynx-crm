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
      deals: Array<{
        deal: string;
        stage: string;
        score: number;
        grade: string;
        warnings: string[];
      }>;
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

  // ─── Issue #54: structural awareness, consistent with open_deal_room ────────
  function negotiationDeal() {
    const today = new Date().toISOString().slice(0, 10);
    return [
      {
        name: "Enterprise",
        stage: "negotiation" as const,
        currency: "EUR",
        updated: today,
        probability: 75,
        value: 75000,
      },
    ];
  }

  it("does NOT score an A for a fresh negotiation deal with no economic buyer (repro)", async () => {
    mockRead.mockResolvedValue(negotiationDeal());
    // Recent touch, but no graph (→ no economic buyer/champion) and a budget objection.
    vol.fromJSON({
      "/data/customers/acme-corp/interactions.md":
        "## 2026-06-09 · Meeting\n**With:** CFO\n**Summary:** CFO äußert Budget-Bedenken\n---\n",
    });

    const result = await handleGetDealHealth({ slug: "acme-corp" }, "/data");
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      deals: Array<{ grade: string; warnings: string[] }>;
    };
    const deal = parsed.deals[0]!;
    expect(deal.grade).not.toBe("A");
    expect(deal.warnings.some((w) => /economic buyer/i.test(w))).toBe(true);
    expect(deal.warnings.some((w) => /champion/i.test(w))).toBe(true);
    expect(deal.warnings.some((w) => /risk signal/i.test(w))).toBe(true);
  });

  it("rewards an identified economic buyer + champion (no structural warnings)", async () => {
    mockRead.mockResolvedValue(negotiationDeal());
    // Graph with an economic buyer and a champion edge.
    vol.fromJSON({
      "/data/customers/acme-corp/graph.json": JSON.stringify({
        schemaVersion: "1",
        slug: "acme-corp",
        nodes: [
          { id: "p1", type: "person", label: "Buyer", properties: {} },
          { id: "p2", type: "person", label: "Champion", properties: {} },
        ],
        edges: [
          {
            id: "e1",
            from: "p1",
            to: "acme-corp",
            type: "IS_ECONOMIC_BUYER",
            weight: 1,
            sentiment: 0,
            lastContact: "",
            contactCount: 1,
            properties: {},
          },
          {
            id: "e2",
            from: "p2",
            to: "acme-corp",
            type: "IS_CHAMPION",
            weight: 1,
            sentiment: 0,
            lastContact: "",
            contactCount: 1,
            properties: {},
          },
        ],
        updatedAt: "2026-06-09T00:00:00Z",
      }),
    });

    const result = await handleGetDealHealth({ slug: "acme-corp" }, "/data");
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      deals: Array<{ grade: string; score: number; warnings: string[] }>;
    };
    const deal = parsed.deals[0]!;
    expect(deal.warnings.some((w) => /economic buyer|champion/i.test(w))).toBe(false);
    expect(deal.grade).toBe("A");
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

    const staleParsed = JSON.parse(
      (staleResult.content[0] as { type: string; text: string }).text
    ) as {
      deals: Array<{ score: number }>;
    };
    const freshParsed = JSON.parse(
      (freshResult.content[0] as { type: string; text: string }).text
    ) as {
      deals: Array<{ score: number }>;
    };

    expect(staleParsed.deals[0]!.score).toBeLessThan(freshParsed.deals[0]!.score);
  });
});
