import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";
import fs from "fs";
import { readPipeline, upsertDeal } from "../../src/fs/pipeline-writer.js";
import type { PipelineDeal } from "../../src/schemas/pipeline.js";

const DATA_DIR = "/data";
const SLUG = "acme-corp";
const CUSTOMER_DIR = `${DATA_DIR}/customers/${SLUG}`;

beforeEach(() => {
  vol.reset();
  vol.fromJSON({
    [`${CUSTOMER_DIR}/pipeline.md`]: "# Pipeline — Acme Corp\n\n<!-- Deals listed here -->\n",
  });
});

const deal1: PipelineDeal = {
  name: "Enterprise License",
  stage: "proposal",
  value: 50000,
  currency: "EUR",
  probability: 60,
  close_date: "2024-12-31",
  notes: "Decision maker: Max",
  updated: "2024-06-01",
};

const deal2: PipelineDeal = {
  name: "Support Contract",
  stage: "qualified",
  currency: "EUR",
  updated: "2024-06-05",
};

describe("readPipeline", () => {
  it("returns empty array when pipeline.md has no deals", async () => {
    const deals = await readPipeline(DATA_DIR, SLUG);
    expect(deals).toEqual([]);
  });

  it("reads deals written in the `dxcrm create` scaffold format (| Deal | … | Updated | Notes |)", async () => {
    // This is exactly what `dxcrm create` scaffolds and docs/schemas.md documents.
    vol.fromJSON({
      [`${CUSTOMER_DIR}/pipeline.md`]:
        "# Pipeline — Acme Corp\n\n" +
        "| Deal | Stage | Value | Currency | Probability | Close Date | Updated | Notes |\n" +
        "|---|---|---|---|---|---|---|---|\n" +
        "| Enterprise License | negotiation | 75000 | EUR | 60 | 2026-07-15 | 2026-06-03 | CFO pushback |\n",
    });
    const deals = await readPipeline(DATA_DIR, SLUG);
    expect(deals).toHaveLength(1);
    expect(deals[0]?.name).toBe("Enterprise License");
    expect(deals[0]?.stage).toBe("negotiation");
    expect(deals[0]?.value).toBe(75000);
    expect(deals[0]?.notes).toBe("CFO pushback");
    expect(deals[0]?.updated).toBe("2026-06-03");
  });

  it("reads deals written in the legacy writer format (| Name | … | Notes | Updated |)", async () => {
    vol.fromJSON({
      [`${CUSTOMER_DIR}/pipeline.md`]:
        "# Pipeline\n\n" +
        "| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |\n" +
        "|------|-------|-------|----------|-------------|------------|-------|---------|\n" +
        "| Old Deal | proposal | 1000 | EUR | 50 |  | legacy | 2026-01-01 |\n",
    });
    const deals = await readPipeline(DATA_DIR, SLUG);
    expect(deals).toHaveLength(1);
    expect(deals[0]?.name).toBe("Old Deal");
    expect(deals[0]?.notes).toBe("legacy");
    expect(deals[0]?.updated).toBe("2026-01-01");
  });

  it("returns empty array when pipeline.md does not exist", async () => {
    vol.reset();
    vol.mkdirSync(CUSTOMER_DIR, { recursive: true });
    const deals = await readPipeline(DATA_DIR, SLUG);
    expect(deals).toEqual([]);
  });
});

describe("upsertDeal", () => {
  it("inserts a new deal", async () => {
    await upsertDeal(DATA_DIR, SLUG, deal1);
    const deals = await readPipeline(DATA_DIR, SLUG);
    expect(deals).toHaveLength(1);
    expect(deals[0]?.name).toBe("Enterprise License");
  });

  it("inserts multiple different deals", async () => {
    await upsertDeal(DATA_DIR, SLUG, deal1);
    await upsertDeal(DATA_DIR, SLUG, deal2);
    const deals = await readPipeline(DATA_DIR, SLUG);
    expect(deals).toHaveLength(2);
  });

  it("updates existing deal by name (upsert)", async () => {
    await upsertDeal(DATA_DIR, SLUG, deal1);
    const updated = {
      ...deal1,
      stage: "negotiation" as const,
      probability: 80,
      updated: "2024-06-10",
    };
    await upsertDeal(DATA_DIR, SLUG, updated);
    const deals = await readPipeline(DATA_DIR, SLUG);
    // Should still be just 1 deal (updated, not duplicated)
    expect(deals).toHaveLength(1);
    expect(deals[0]?.stage).toBe("negotiation");
    expect(deals[0]?.probability).toBe(80);
  });

  it("preserves other deals when updating one", async () => {
    await upsertDeal(DATA_DIR, SLUG, deal1);
    await upsertDeal(DATA_DIR, SLUG, deal2);
    const updated = { ...deal1, stage: "won" as const, updated: "2024-06-10" };
    await upsertDeal(DATA_DIR, SLUG, updated);
    const deals = await readPipeline(DATA_DIR, SLUG);
    expect(deals).toHaveLength(2);
    const enterprise = deals.find((d) => d.name === "Enterprise License");
    const support = deals.find((d) => d.name === "Support Contract");
    expect(enterprise?.stage).toBe("won");
    expect(support?.stage).toBe("qualified");
  });

  it("creates pipeline.md if it does not exist", async () => {
    vol.reset();
    vol.mkdirSync(CUSTOMER_DIR, { recursive: true });
    await upsertDeal(DATA_DIR, SLUG, deal1);
    const deals = await readPipeline(DATA_DIR, SLUG);
    expect(deals).toHaveLength(1);
  });

  it("persists deal fields correctly", async () => {
    await upsertDeal(DATA_DIR, SLUG, deal1);
    const deals = await readPipeline(DATA_DIR, SLUG);
    const d = deals[0]!;
    expect(d.name).toBe("Enterprise License");
    expect(d.stage).toBe("proposal");
    expect(d.value).toBe(50000);
    expect(d.currency).toBe("EUR");
    expect(d.probability).toBe(60);
    expect(d.close_date).toBe("2024-12-31");
    expect(d.updated).toBe("2024-06-01");
  });

  it("handles deals without optional fields", async () => {
    await upsertDeal(DATA_DIR, SLUG, deal2);
    const deals = await readPipeline(DATA_DIR, SLUG);
    expect(deals).toHaveLength(1);
    expect(deals[0]?.name).toBe("Support Contract");
    expect(deals[0]?.value).toBeUndefined();
    expect(deals[0]?.probability).toBeUndefined();
    expect(deals[0]?.close_date).toBeUndefined();
  });

  it("preserves the '# Pipeline — <Name>' heading on rewrite", async () => {
    await upsertDeal(DATA_DIR, SLUG, deal1);
    const raw = fs.readFileSync(`${CUSTOMER_DIR}/pipeline.md`, "utf-8");
    expect(raw).toContain("# Pipeline — Acme Corp");
    expect(raw).not.toMatch(/^# Pipeline\s*$/m);
  });

  it("writes the canonical documented header (| Deal | … | Notes | Owner |)", async () => {
    await upsertDeal(DATA_DIR, SLUG, deal1);
    const raw = fs.readFileSync(`${CUSTOMER_DIR}/pipeline.md`, "utf-8");
    expect(raw).toContain(
      "| Deal | Stage | Value | Currency | Probability | Close Date | Updated | Notes | Owner |"
    );
  });

  it("round-trips the optional owner field (#51)", async () => {
    await upsertDeal(DATA_DIR, SLUG, { ...deal1, owner: "alice" });
    const deals = await readPipeline(DATA_DIR, SLUG);
    expect(deals.find((d) => d.name === deal1.name)?.owner).toBe("alice");
  });

  it("parses an Owner column regardless of position (column-tolerant)", async () => {
    vol.fromJSON({
      [`${CUSTOMER_DIR}/pipeline.md`]:
        "# Pipeline — Acme Corp\n\n" +
        "| Owner | Deal | Stage | Value | Updated |\n" +
        "|---|---|---|---|---|\n" +
        "| bob | Big Deal | negotiation | 9000 | 2026-06-01 |\n",
    });
    const deals = await readPipeline(DATA_DIR, SLUG);
    expect(deals[0]?.owner).toBe("bob");
    expect(deals[0]?.name).toBe("Big Deal");
  });

  it("round-trips a deal scaffolded by `dxcrm create` after an update_deal rewrite", async () => {
    // Start from the create scaffold, then upsert a deal authored in that format.
    vol.fromJSON({
      [`${CUSTOMER_DIR}/pipeline.md`]:
        "# Pipeline — Acme Corp\n\n" +
        "| Deal | Stage | Value | Currency | Probability | Close Date | Updated | Notes |\n" +
        "|---|---|---|---|---|---|---|---|\n" +
        "| Existing | proposal | 2000 | EUR | 30 |  | 2026-02-02 | keep me |\n",
    });
    await upsertDeal(DATA_DIR, SLUG, deal1);
    const deals = await readPipeline(DATA_DIR, SLUG);
    expect(deals.map((d) => d.name).sort()).toEqual(["Enterprise License", "Existing"]);
  });
});
