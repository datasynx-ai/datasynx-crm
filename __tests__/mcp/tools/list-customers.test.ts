import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vol } from "memfs";
import matter from "gray-matter";
import { handleListCustomers } from "../../../src/mcp/tools/list-customers.js";

function makeMainFacts(name: string, stage: string, dealValue?: number): string {
  const data: Record<string, unknown> = {
    name,
    relationship_stage: stage,
    created: "2026-01-01",
    updated: "2026-05-01",
    tags: [],
    currency: "EUR",
  };
  if (dealValue !== undefined) data["deal_value"] = dealValue;
  return matter.stringify("", data);
}

function makeInteractions(lastDate: string): string {
  return `# Interactions\n\n## ${lastDate} · Call\n**With:** John\n**Summary:** Test call\n**Next Steps:**\n- [ ] —\n**Source:** agent://log/1\n**Synced:** 2026-05-01\n---\n`;
}

describe("list_customers tool", () => {
  beforeEach(() => {
    vol.reset();
  });

  it("returns list of customers from filesystem", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md": makeMainFacts("Acme Corp", "active", 15000),
      "/data/customers/beta-gmbh/main_facts.md": makeMainFacts("Beta GmbH", "prospect"),
    });

    const result = await handleListCustomers({}, "/data");
    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as Array<{ slug: string; name: string; stage: string }>;

    expect(parsed).toHaveLength(2);
    const slugs = parsed.map((c) => c.slug);
    expect(slugs).toContain("acme-corp");
    expect(slugs).toContain("beta-gmbh");
  });

  it("returns empty array when no customers directory exists", async () => {
    vol.fromJSON({});

    const result = await handleListCustomers({}, "/data");
    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as unknown[];
    expect(parsed).toHaveLength(0);
  });

  it("filters by name substring when filter provided", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md": makeMainFacts("Acme Corp", "active"),
      "/data/customers/beta-gmbh/main_facts.md": makeMainFacts("Beta GmbH", "prospect"),
    });

    const result = await handleListCustomers({ filter: "acme" }, "/data");
    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as Array<{ slug: string }>;

    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.slug).toBe("acme-corp");
  });

  it("includes dealValue when present in main_facts", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md": makeMainFacts("Acme Corp", "active", 25000),
    });

    const result = await handleListCustomers({}, "/data");
    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as Array<{ dealValue?: number }>;

    expect(parsed[0]?.dealValue).toBe(25000);
  });

  it("includes lastInteraction when interactions.md exists", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md": makeMainFacts("Acme Corp", "active"),
      "/data/customers/acme-corp/interactions.md": makeInteractions("2026-05-20"),
    });

    const result = await handleListCustomers({}, "/data");
    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as Array<{ lastInteraction?: string }>;

    expect(parsed[0]?.lastInteraction).toBe("2026-05-20");
  });

  it("skips directories without main_facts.md gracefully", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md": makeMainFacts("Acme Corp", "active"),
      "/data/customers/empty-dir/.gitkeep": "",
    });

    const result = await handleListCustomers({}, "/data");
    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as Array<{ slug: string }>;

    // Only acme-corp should be included (empty-dir has no main_facts.md)
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.slug).toBe("acme-corp");
  });
});

describe("list_customers — RBAC can_see", () => {
  beforeEach(() => {
    vol.reset();
    delete process.env["DXCRM_ACTOR"];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env["DXCRM_ACTOR"];
  });

  it("rep with owned_customers only sees assigned customers", async () => {
    vol.fromJSON({
      "/data/.agentic/rbac.json": JSON.stringify({
        actors: { carol: "rep" },
        owned_customers: { carol: ["acme-corp"] },
      }),
      "/data/customers/acme-corp/main_facts.md": makeMainFacts("Acme Corp", "active"),
      "/data/customers/beta-gmbh/main_facts.md": makeMainFacts("Beta GmbH", "active"),
    });
    process.env["DXCRM_ACTOR"] = "carol";

    const result = await handleListCustomers({}, "/data");
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as Array<{ slug: string }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.slug).toBe("acme-corp");
  });

  it("admin sees all customers regardless of owned_customers", async () => {
    vol.fromJSON({
      "/data/.agentic/rbac.json": JSON.stringify({ actors: { alice: "admin" } }),
      "/data/customers/acme-corp/main_facts.md": makeMainFacts("Acme Corp", "active"),
      "/data/customers/beta-gmbh/main_facts.md": makeMainFacts("Beta GmbH", "active"),
    });
    process.env["DXCRM_ACTOR"] = "alice";

    const result = await handleListCustomers({}, "/data");
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as Array<{ slug: string }>;
    expect(parsed).toHaveLength(2);
  });

  it("open access (no rbac.json) shows all customers", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/main_facts.md": makeMainFacts("Acme Corp", "active"),
      "/data/customers/beta-gmbh/main_facts.md": makeMainFacts("Beta GmbH", "active"),
    });

    const result = await handleListCustomers({}, "/data");
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as Array<{ slug: string }>;
    expect(parsed).toHaveLength(2);
  });
});
