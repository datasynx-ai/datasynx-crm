import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";
import {
  readPipeline,
  upsertDeal,
} from "../../src/fs/pipeline-writer.js";
import type { PipelineDeal } from "../../src/schemas/pipeline.js";

const DATA_DIR = "/data";
const SLUG = "acme-corp";
const CUSTOMER_DIR = `${DATA_DIR}/customers/${SLUG}`;

beforeEach(() => {
  vol.reset();
  vol.fromJSON({
    [`${CUSTOMER_DIR}/pipeline.md`]:
      "# Pipeline — Acme Corp\n\n<!-- Deals listed here -->\n",
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
    const updated = { ...deal1, stage: "negotiation" as const, probability: 80, updated: "2024-06-10" };
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
});
