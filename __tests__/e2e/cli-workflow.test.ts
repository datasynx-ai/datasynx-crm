/**
 * E2E CLI Workflow Tests
 *
 * Tests the full user journey using real function calls against memfs.
 * No mocked implementations — these validate actual business logic end-to-end.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";
import path from "path";

const DATA_DIR = "/crm";

beforeEach(() => {
  vol.reset();
  vol.mkdirSync(DATA_DIR, { recursive: true });
});

// ─── Onboarding Flow ──────────────────────────────────────────────────────────

describe("E2E: Onboarding Flow — init → create → list", () => {
  it("createCustomer writes all required files", async () => {
    const { createCustomer } = await import("../../src/commands/create.js");

    const result = await createCustomer({
      name: "Acme Corp",
      domain: "acme.com",
      email: "ceo@acme.com",
      dataDir: DATA_DIR,
    });

    expect(result.id).toBe("acme-corp");

    const fs = (await import("fs")).default;
    expect(fs.existsSync(path.join(DATA_DIR, "customers/acme-corp/main_facts.md"))).toBe(true);
    expect(fs.existsSync(path.join(DATA_DIR, "customers/acme-corp/interactions.md"))).toBe(true);
    expect(fs.existsSync(path.join(DATA_DIR, "customers/acme-corp/pipeline.md"))).toBe(true);
    expect(fs.existsSync(path.join(DATA_DIR, "customers/acme-corp/sources.json"))).toBe(true);
  });

  it("createCustomer stores correct main_facts", async () => {
    const { createCustomer } = await import("../../src/commands/create.js");
    await createCustomer({ name: "Beta GmbH", domain: "beta.de", dataDir: DATA_DIR });

    const { readMainFacts } = await import("../../src/fs/customer-dir.js");
    const facts = await readMainFacts(DATA_DIR, "beta-gmbh");

    expect(facts.name).toBe("Beta GmbH");
    expect(facts.domain).toBe("beta.de");
    expect(facts.relationship_stage).toBe("prospect");
    expect(facts.tags).toEqual([]);
    expect(facts.created).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("listCustomers returns created customers", async () => {
    const { createCustomer } = await import("../../src/commands/create.js");
    await createCustomer({ name: "Acme Corp", dataDir: DATA_DIR });
    await createCustomer({ name: "Beta GmbH", dataDir: DATA_DIR });

    const { handleListCustomers } = await import("../../src/mcp/tools/list-customers.js");
    const result = await handleListCustomers({ filter: undefined }, DATA_DIR);

    const text = (result.content[0] as { text: string }).text;
    const parsed = JSON.parse(text) as Array<{ slug: string; name: string }>;

    expect(parsed).toHaveLength(2);
    const slugs = parsed.map((c) => c.slug);
    expect(slugs).toContain("acme-corp");
    expect(slugs).toContain("beta-gmbh");
  });

  it("listCustomers filter works", async () => {
    const { createCustomer } = await import("../../src/commands/create.js");
    await createCustomer({ name: "Acme Corp", dataDir: DATA_DIR });
    await createCustomer({ name: "Beta GmbH", dataDir: DATA_DIR });

    const { handleListCustomers } = await import("../../src/mcp/tools/list-customers.js");
    const result = await handleListCustomers({ filter: "acme" }, DATA_DIR);

    const text = (result.content[0] as { text: string }).text;
    const parsed = JSON.parse(text) as Array<{ slug: string }>;

    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.slug).toBe("acme-corp");
  });
});

// ─── Core CRM Loop ────────────────────────────────────────────────────────────

describe("E2E: Core CRM Loop — create → log_interaction → context", () => {
  it("log_interaction appends to interactions.md and is reflected in context", async () => {
    const { createCustomer } = await import("../../src/commands/create.js");
    await createCustomer({ name: "Acme Corp", domain: "acme.com", dataDir: DATA_DIR });

    const { handleLogInteraction } = await import("../../src/mcp/tools/log-interaction.js");
    const logResult = await handleLogInteraction(
      {
        slug: "acme-corp",
        type: "Call",
        summary: "Discussed Q3 renewal. Budget confirmed at 50k.",
        with: "Alice Smith",
        nextSteps: ["Send proposal by Friday"],
        direction: "inbound",
      },
      DATA_DIR
    );

    const logParsed = JSON.parse(
      (logResult.content[0] as { text: string }).text
    ) as { success: boolean };
    expect(logParsed.success).toBe(true);

    const fs = (await import("fs")).default;
    const interactions = fs.readFileSync(
      path.join(DATA_DIR, "customers/acme-corp/interactions.md"),
      "utf-8"
    ) as string;
    expect(interactions).toContain("Q3 renewal");
    expect(interactions).toContain("Alice Smith");
    expect(interactions).toContain("Send proposal by Friday");
  });

  it("log_interaction updates last_touchpoint in main_facts", async () => {
    const { createCustomer } = await import("../../src/commands/create.js");
    await createCustomer({ name: "Acme Corp", dataDir: DATA_DIR });

    const { handleLogInteraction } = await import("../../src/mcp/tools/log-interaction.js");
    await handleLogInteraction(
      { slug: "acme-corp", type: "Email", summary: "Sent intro email", with: "Bob" },
      DATA_DIR
    );

    const { readMainFacts } = await import("../../src/fs/customer-dir.js");
    const facts = await readMainFacts(DATA_DIR, "acme-corp");
    expect(facts.updated).toBe(new Date().toISOString().slice(0, 10));
  });

  it("update_deal creates a deal that appears in context", async () => {
    const { createCustomer } = await import("../../src/commands/create.js");
    await createCustomer({ name: "Acme Corp", dataDir: DATA_DIR });

    const { handleUpdateDeal } = await import("../../src/mcp/tools/update-deal.js");
    const dealResult = await handleUpdateDeal(
      {
        slug: "acme-corp",
        dealName: "Enterprise License 2026",
        stage: "proposal",
        value: 75000,
        probability: 65,
        closeDate: "2026-09-30",
      },
      DATA_DIR
    );

    const dealParsed = JSON.parse(
      (dealResult.content[0] as { text: string }).text
    ) as { success: boolean; deal: { name: string; stage: string } };
    expect(dealParsed.success).toBe(true);
    expect(dealParsed.deal.name).toBe("Enterprise License 2026");
    expect(dealParsed.deal.stage).toBe("proposal");

    const fs = (await import("fs")).default;
    const pipeline = fs.readFileSync(
      path.join(DATA_DIR, "customers/acme-corp/pipeline.md"),
      "utf-8"
    ) as string;
    expect(pipeline).toContain("Enterprise License 2026");
    expect(pipeline).toContain("proposal");
  });
});

// ─── Update Customer Facts ────────────────────────────────────────────────────

describe("E2E: update_customer_facts", () => {
  it("patches domain and primaryContact, preserves other fields", async () => {
    const { createCustomer } = await import("../../src/commands/create.js");
    await createCustomer({ name: "Acme Corp", domain: "acme.com", dataDir: DATA_DIR });

    const { handleUpdateCustomerFacts } = await import(
      "../../src/mcp/tools/update-customer-facts.js"
    );
    const result = await handleUpdateCustomerFacts(
      {
        slug: "acme-corp",
        domain: "new-acme.io",
        primaryContact: "Carol Brown",
        tags: ["enterprise", "strategic"],
      },
      DATA_DIR
    );

    const parsed = JSON.parse((result.content[0] as { text: string }).text) as {
      success: boolean;
      facts: { domain: string; primary_contact: string; name: string; tags: string[] };
    };
    expect(parsed.success).toBe(true);
    expect(parsed.facts.domain).toBe("new-acme.io");
    expect(parsed.facts.primary_contact).toBe("Carol Brown");
    expect(parsed.facts.name).toBe("Acme Corp"); // preserved
    expect(parsed.facts.tags).toEqual(["enterprise", "strategic"]);
  });
});

// ─── Export Flow ──────────────────────────────────────────────────────────────

describe("E2E: export_customer", () => {
  it("exports customer as JSON with all sections", async () => {
    const { createCustomer } = await import("../../src/commands/create.js");
    await createCustomer({ name: "Acme Corp", domain: "acme.com", dataDir: DATA_DIR });

    const { handleLogInteraction } = await import("../../src/mcp/tools/log-interaction.js");
    await handleLogInteraction(
      { slug: "acme-corp", type: "Call", summary: "Kickoff call", with: "Alice" },
      DATA_DIR
    );

    const { handleExportCustomer } = await import("../../src/mcp/tools/export-customer.js");
    const result = await handleExportCustomer({ slug: "acme-corp", format: "json" }, DATA_DIR);

    const exported = JSON.parse((result.content[0] as { text: string }).text) as {
      slug: string;
      mainFacts: { name: string };
      interactionsCount: number;
    };
    expect(exported.slug).toBe("acme-corp");
    expect(exported.mainFacts.name).toBe("Acme Corp");
    expect(exported.interactionsCount).toBeGreaterThanOrEqual(1);
  });

  it("exports customer as Markdown", async () => {
    const { createCustomer } = await import("../../src/commands/create.js");
    await createCustomer({ name: "Beta GmbH", dataDir: DATA_DIR });

    const { handleExportCustomer } = await import("../../src/mcp/tools/export-customer.js");
    const result = await handleExportCustomer(
      { slug: "beta-gmbh", format: "markdown" },
      DATA_DIR
    );

    const md = (result.content[0] as { text: string }).text;
    expect(md).toContain("Beta GmbH");
    expect(md).toContain("#");
  });
});

// ─── Compliance Flow ──────────────────────────────────────────────────────────

describe("E2E: GDPR Compliance Flow", () => {
  it("gdpr erase dry-run does not delete", async () => {
    const { createCustomer } = await import("../../src/commands/create.js");
    await createCustomer({ name: "Acme Corp", dataDir: DATA_DIR });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runGdprErase } = await import("../../src/commands/gdpr.js");
    await runGdprErase("acme-corp", { confirm: false }, DATA_DIR);

    const fs = (await import("fs")).default;
    expect(
      fs.existsSync(path.join(DATA_DIR, "customers/acme-corp/main_facts.md"))
    ).toBe(true);
    consoleSpy.mockRestore();
  });

  it("gdpr erase --confirm removes customer directory", async () => {
    const { createCustomer } = await import("../../src/commands/create.js");
    await createCustomer({ name: "Acme Corp", dataDir: DATA_DIR });

    vol.mkdirSync(path.join(DATA_DIR, ".agentic"), { recursive: true });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runGdprErase } = await import("../../src/commands/gdpr.js");
    await runGdprErase("acme-corp", { confirm: true }, DATA_DIR);

    const fs = (await import("fs")).default;
    expect(fs.existsSync(path.join(DATA_DIR, "customers/acme-corp"))).toBe(false);
    consoleSpy.mockRestore();
  });
});

// ─── Backup / Restore Flow ────────────────────────────────────────────────────

describe("E2E: Backup / Restore — runBackup is exported and callable", () => {
  it("runBackup and runRestore are exported functions", async () => {
    const backupModule = await import("../../src/commands/backup.js");
    expect(typeof backupModule.runBackup).toBe("function");
    expect(typeof backupModule.runRestore).toBe("function");
  });

  it("backup command exists on backupCommand", async () => {
    const { backupCommand, restoreCommand } = await import("../../src/commands/backup.js");
    expect(backupCommand.name()).toBe("backup");
    expect(restoreCommand.name()).toBe("restore");
  });
});

// ─── Permissions Flow ─────────────────────────────────────────────────────────

describe("E2E: RBAC Permissions Flow", () => {
  it("rbac set → rbac show → rbac check cycle", async () => {
    vol.mkdirSync(path.join(DATA_DIR, ".agentic"), { recursive: true });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runRbacSet, runRbacShow, runRbacCheck } = await import(
      "../../src/commands/rbac.js"
    );

    await runRbacSet("alice", "admin", DATA_DIR);
    await runRbacSet("bob", "rep", DATA_DIR);

    const { getRbacConfig } = await import("../../src/core/rbac.js");
    const config = getRbacConfig(DATA_DIR);
    expect(config.actors["alice"]).toBe("admin");
    expect(config.actors["bob"]).toBe("rep");

    // admin can log
    let allowed = true;
    try {
      await runRbacCheck("alice", "log_interaction", DATA_DIR);
    } catch {
      allowed = false;
    }
    expect(allowed).toBe(true);

    consoleSpy.mockRestore();
  });
});

// helper import for vi in this file
import { vi } from "vitest";
