/**
 * E2E MCP Workflow Tests
 *
 * Validates MCP tool chains end-to-end against memfs.
 * No mocked implementations except LanceDB (vector DB not available in test env).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("../../src/core/lancedb.js", () => ({
  searchKnowledge: vi.fn().mockResolvedValue([]),
  indexDocument: vi.fn().mockResolvedValue(undefined),
  dropCustomerTable: vi.fn().mockResolvedValue(undefined),
}));

const DATA_DIR = "/mcp";

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
  vol.mkdirSync(DATA_DIR, { recursive: true });
  delete process.env["DXCRM_ACTOR"];
});

// ─── Core Loop: create → log_interaction → get_customer_context ──────────────

describe("E2E MCP: Core Loop — create → log_interaction → get_customer_context", () => {
  it("logged interaction appears in customer context", async () => {
    const { createCustomer } = await import("../../src/commands/create.js");
    await createCustomer({ name: "Acme Corp", domain: "acme.com", dataDir: DATA_DIR });

    const { handleLogInteraction } = await import("../../src/mcp/tools/log-interaction.js");
    const logResult = await handleLogInteraction(
      {
        slug: "acme-corp",
        type: "Call",
        summary: "Discussed enterprise pricing",
        nextSteps: ["Send proposal"],
        date: "2026-05-28",
      },
      DATA_DIR
    );
    expect(logResult.isError).toBeFalsy();

    const { handleGetCustomerContext } = await import("../../src/mcp/tools/get-customer-context.js");
    const ctxResult = await handleGetCustomerContext({ slug: "acme-corp" }, DATA_DIR);
    const text = (ctxResult.content[0] as { type: string; text: string }).text;

    expect(text).toContain("Discussed enterprise pricing");
    expect(text).toContain("Send proposal");
  });

  it("last_touchpoint is updated after logging an interaction", async () => {
    const { createCustomer } = await import("../../src/commands/create.js");
    await createCustomer({ name: "Beta GmbH", domain: "beta.de", dataDir: DATA_DIR });

    const { handleLogInteraction } = await import("../../src/mcp/tools/log-interaction.js");
    await handleLogInteraction(
      { slug: "beta-gmbh", type: "Email", summary: "Sent follow-up", nextSteps: [], date: "2026-05-28" },
      DATA_DIR
    );

    const mainFacts = vol.readFileSync(`${DATA_DIR}/customers/beta-gmbh/main_facts.md`, "utf-8") as string;
    expect(mainFacts).toContain("last_touchpoint");
    expect(mainFacts).toContain("2026-05-28");
  });
});

// ─── Pipeline Workflow: update_deal → export_customer ────────────────────────

describe("E2E MCP: Pipeline Workflow — update_deal → export_customer", () => {
  it("deal created via update_deal appears in export", async () => {
    const { createCustomer } = await import("../../src/commands/create.js");
    await createCustomer({ name: "Gamma Inc", domain: "gamma.io", dataDir: DATA_DIR });

    const { handleUpdateDeal } = await import("../../src/mcp/tools/update-deal.js");
    await handleUpdateDeal(
      {
        slug: "gamma-inc",
        dealName: "Platform License",
        stage: "proposal",
        value: 50000,
        closeDate: "2026-08-31",
      },
      DATA_DIR
    );

    const { handleExportCustomer } = await import("../../src/mcp/tools/export-customer.js");
    const result = await handleExportCustomer({ slug: "gamma-inc" }, DATA_DIR);
    const text = (result.content[0] as { type: string; text: string }).text;
    const exported = JSON.parse(text) as { pipeline: Array<{ name: string; stage: string; value: number }> };

    expect(exported.pipeline).toHaveLength(1);
    expect(exported.pipeline[0]!.name).toBe("Platform License");
    expect(exported.pipeline[0]!.stage).toBe("proposal");
    expect(exported.pipeline[0]!.value).toBe(50000);
  });

  it("get_deal_health returns grade for active deal", async () => {
    const { createCustomer } = await import("../../src/commands/create.js");
    await createCustomer({ name: "Delta Corp", domain: "delta.com", dataDir: DATA_DIR });

    const { handleUpdateDeal } = await import("../../src/mcp/tools/update-deal.js");
    await handleUpdateDeal(
      { slug: "delta-corp", dealName: "Renewal", stage: "negotiation", value: 25000, closeDate: "2026-09-30" },
      DATA_DIR
    );

    const { handleGetDealHealth } = await import("../../src/mcp/tools/get-deal-health.js");
    const result = await handleGetDealHealth({ slug: "delta-corp" }, DATA_DIR);
    const text = (result.content[0] as { type: string; text: string }).text;
    const health = JSON.parse(text) as { deals: Array<{ name: string; grade: string }> };

    expect(health.deals).toHaveLength(1);
    expect(health.deals[0]!.grade).toBeDefined();
  });
});

// ─── list_customers → get_customer_context chain ─────────────────────────────

describe("E2E MCP: list_customers → get_customer_context", () => {
  it("customers created via CLI appear in list_customers output", async () => {
    const { createCustomer } = await import("../../src/commands/create.js");
    await createCustomer({ name: "Acme Corp", domain: "acme.com", dataDir: DATA_DIR });
    await createCustomer({ name: "Beta GmbH", domain: "beta.de", dataDir: DATA_DIR });

    const { handleListCustomers } = await import("../../src/mcp/tools/list-customers.js");
    const result = await handleListCustomers({}, DATA_DIR);
    const list = JSON.parse((result.content[0] as { type: string; text: string }).text) as Array<{ slug: string; name: string }>;

    expect(list).toHaveLength(2);
    const slugs = list.map((c) => c.slug);
    expect(slugs).toContain("acme-corp");
    expect(slugs).toContain("beta-gmbh");
  });

  it("filter on list_customers narrows results", async () => {
    const { createCustomer } = await import("../../src/commands/create.js");
    await createCustomer({ name: "Acme Corp", domain: "acme.com", dataDir: DATA_DIR });
    await createCustomer({ name: "Beta GmbH", domain: "beta.de", dataDir: DATA_DIR });

    const { handleListCustomers } = await import("../../src/mcp/tools/list-customers.js");
    const result = await handleListCustomers({ filter: "acme" }, DATA_DIR);
    const list = JSON.parse((result.content[0] as { type: string; text: string }).text) as Array<{ slug: string }>;

    expect(list).toHaveLength(1);
    expect(list[0]!.slug).toBe("acme-corp");
  });

  it("get_customer_context returns error for nonexistent customer", async () => {
    const { handleGetCustomerContext } = await import("../../src/mcp/tools/get-customer-context.js");
    const result = await handleGetCustomerContext({ slug: "nonexistent" }, DATA_DIR);
    expect(result.isError).toBe(true);
  });
});

// ─── get_pipeline_forecast ────────────────────────────────────────────────────

describe("E2E MCP: get_pipeline_forecast", () => {
  it("forecast aggregates deals from multiple customers", async () => {
    const { createCustomer } = await import("../../src/commands/create.js");
    await createCustomer({ name: "Acme Corp", domain: "acme.com", dataDir: DATA_DIR });
    await createCustomer({ name: "Beta GmbH", domain: "beta.de", dataDir: DATA_DIR });

    const { handleUpdateDeal } = await import("../../src/mcp/tools/update-deal.js");
    await handleUpdateDeal(
      { slug: "acme-corp", dealName: "Deal A", stage: "proposal", value: 20000, closeDate: "2026-08-01" },
      DATA_DIR
    );
    await handleUpdateDeal(
      { slug: "beta-gmbh", dealName: "Deal B", stage: "qualified", value: 15000, closeDate: "2026-08-15" },
      DATA_DIR
    );

    const { handleGetPipelineForecast } = await import("../../src/mcp/tools/get-pipeline-forecast.js");
    const result = await handleGetPipelineForecast({}, DATA_DIR);
    const text = (result.content[0] as { type: string; text: string }).text;
    const forecast = JSON.parse(text) as { totalWeightedValue: number; deals: unknown[] };

    expect(forecast.deals.length).toBeGreaterThanOrEqual(2);
    expect(forecast.totalWeightedValue).toBeGreaterThan(0);
  });
});

// ─── RBAC enforcement through MCP tools ──────────────────────────────────────

describe("E2E MCP: RBAC enforcement", () => {
  it("rep cannot call export_customer when rbac.json exists", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/rbac.json`]: JSON.stringify({ actors: { carol: "rep" } }),
      [`${DATA_DIR}/customers/acme-corp/main_facts.md`]: "---\nname: Acme\n---\n",
    });
    process.env["DXCRM_ACTOR"] = "carol";

    const { handleExportCustomer } = await import("../../src/mcp/tools/export-customer.js");
    await expect(handleExportCustomer({ slug: "acme-corp" }, DATA_DIR)).rejects.toThrow(/access denied/i);
  });

  it("rep can_see only their own customers in list_customers", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/rbac.json`]: JSON.stringify({
        actors: { carol: "rep" },
        owned_customers: { carol: ["acme-corp"] },
      }),
      [`${DATA_DIR}/customers/acme-corp/main_facts.md`]: "---\nname: Acme Corp\nrelationship_stage: active\ncreated: 2026-01-01\n---\n",
      [`${DATA_DIR}/customers/beta-gmbh/main_facts.md`]: "---\nname: Beta GmbH\nrelationship_stage: active\ncreated: 2026-01-01\n---\n",
    });
    process.env["DXCRM_ACTOR"] = "carol";

    const { handleListCustomers } = await import("../../src/mcp/tools/list-customers.js");
    const result = await handleListCustomers({}, DATA_DIR);
    const list = JSON.parse((result.content[0] as { type: string; text: string }).text) as Array<{ slug: string }>;
    expect(list).toHaveLength(1);
    expect(list[0]!.slug).toBe("acme-corp");
  });
});

// ─── update_customer_facts ────────────────────────────────────────────────────

describe("E2E MCP: update_customer_facts", () => {
  it("patches domain and preserves other fields", async () => {
    const { createCustomer } = await import("../../src/commands/create.js");
    await createCustomer({ name: "Omega Ltd", domain: "omega.com", dataDir: DATA_DIR });

    const { handleUpdateCustomerFacts } = await import("../../src/mcp/tools/update-customer-facts.js");
    await handleUpdateCustomerFacts(
      { slug: "omega-ltd", domain: "omega.io", primaryContact: "Jane Doe" },
      DATA_DIR
    );

    const { handleGetCustomerContext } = await import("../../src/mcp/tools/get-customer-context.js");
    const result = await handleGetCustomerContext({ slug: "omega-ltd" }, DATA_DIR);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("omega.io");
    expect(text).toContain("Jane Doe");
  });
});
