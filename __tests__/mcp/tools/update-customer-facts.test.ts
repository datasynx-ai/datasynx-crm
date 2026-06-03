import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

vi.mock("../../../src/fs/customer-dir.js", () => ({
  readMainFacts: vi.fn().mockResolvedValue({
    name: "Acme Corp",
    domain: "acme.com",
    relationship_stage: "active",
    tags: [],
    created: "2026-01-01",
    updated: "2026-01-01",
    currency: "EUR",
  }),
  writeMainFacts: vi.fn().mockResolvedValue(undefined),
  customerExists: vi.fn().mockReturnValue(true),
  getCustomerDir: vi.fn().mockReturnValue("/data/customers/acme-corp"),
  ensureCustomerDir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/fs/audit-log.js", () => ({
  writeAuditEntry: vi.fn(),
  getActor: vi.fn().mockReturnValue("alice"),
}));

import { handleUpdateCustomerFacts } from "../../../src/mcp/tools/update-customer-facts.js";
import {
  readMainFacts,
  writeMainFacts,
  customerExists,
  ensureCustomerDir,
} from "../../../src/fs/customer-dir.js";
import { writeAuditEntry } from "../../../src/fs/audit-log.js";

const mockRead = vi.mocked(readMainFacts);
const mockWrite = vi.mocked(writeMainFacts);
const mockExists = vi.mocked(customerExists);
const mockEnsureDir = vi.mocked(ensureCustomerDir);

describe("update_customer_facts tool", () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    mockRead.mockResolvedValue({
      name: "Acme Corp",
      domain: "acme.com",
      relationship_stage: "active",
      tags: [],
      created: "2026-01-01",
      updated: "2026-01-01",
      currency: "EUR",
    });
    mockWrite.mockResolvedValue(undefined);
  });

  it("returns success when updating a single field", async () => {
    const result = await handleUpdateCustomerFacts(
      { slug: "acme-corp", domain: "new-acme.com" },
      "/data"
    );

    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      success: boolean;
    };
    expect(parsed.success).toBe(true);
  });

  it("merges patch into existing facts", async () => {
    await handleUpdateCustomerFacts(
      { slug: "acme-corp", primaryContact: "Bob Jones", phone: "+1 555 0100" },
      "/data"
    );

    expect(mockWrite).toHaveBeenCalledOnce();
    const [, , written] = vi.mocked(mockWrite).mock.calls[0] as [
      string,
      string,
      { primary_contact: string; phone: string; name: string },
    ];
    expect(written.primary_contact).toBe("Bob Jones");
    expect(written.phone).toBe("+1 555 0100");
    expect(written.name).toBe("Acme Corp"); // preserved from existing
  });

  it("updates 'updated' field to today", async () => {
    await handleUpdateCustomerFacts({ slug: "acme-corp", industry: "SaaS" }, "/data");

    const [, , written] = vi.mocked(mockWrite).mock.calls[0] as [
      string,
      string,
      { updated: string },
    ];
    expect(written.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(written.updated).toBe(new Date().toISOString().slice(0, 10));
  });

  it("can update relationship_stage", async () => {
    await handleUpdateCustomerFacts({ slug: "acme-corp", relationshipStage: "churned" }, "/data");

    const [, , written] = vi.mocked(mockWrite).mock.calls[0] as [
      string,
      string,
      { relationship_stage: string },
    ];
    expect(written.relationship_stage).toBe("churned");
  });

  it("can update tags", async () => {
    await handleUpdateCustomerFacts({ slug: "acme-corp", tags: ["enterprise", "pilot"] }, "/data");

    const [, , written] = vi.mocked(mockWrite).mock.calls[0] as [
      string,
      string,
      { tags: string[] },
    ];
    expect(written.tags).toEqual(["enterprise", "pilot"]);
  });

  it("writes audit entry after successful update", async () => {
    await handleUpdateCustomerFacts({ slug: "acme-corp", domain: "updated.com" }, "/data");

    expect(vi.mocked(writeAuditEntry)).toHaveBeenCalledOnce();
    const [, entry] = vi.mocked(writeAuditEntry).mock.calls[0] as [
      string,
      { tool: string; slug: string },
    ];
    expect(entry.tool).toBe("update_customer_facts");
    expect(entry.slug).toBe("acme-corp");
  });

  it("returns success: false when writeMainFacts throws", async () => {
    mockWrite.mockRejectedValue(new Error("Disk full"));

    const result = await handleUpdateCustomerFacts(
      { slug: "acme-corp", domain: "fail.com" },
      "/data"
    );

    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      success: boolean;
      error: string;
    };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/Disk full/);
  });

  it("returns error when slug does not exist", async () => {
    mockRead.mockRejectedValue(new Error("main_facts.md not found"));

    const result = await handleUpdateCustomerFacts(
      { slug: "unknown-corp", domain: "x.com" },
      "/data"
    );

    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      success: boolean;
      error: string;
    };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/not found/);
  });

  it("returns updated facts in response", async () => {
    const result = await handleUpdateCustomerFacts(
      { slug: "acme-corp", domain: "acme-new.com" },
      "/data"
    );

    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      success: boolean;
      facts: { name: string };
    };
    expect(parsed.facts).toBeDefined();
    expect(parsed.facts.name).toBe("Acme Corp");
  });

  it("returns created: false when updating existing customer", async () => {
    const result = await handleUpdateCustomerFacts({ slug: "acme-corp", domain: "x.com" }, "/data");

    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      created: boolean;
    };
    expect(parsed.created).toBe(false);
  });
});

describe("update_customer_facts tool — create path", () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    mockExists.mockReturnValue(false);
    mockWrite.mockResolvedValue(undefined);
    mockEnsureDir.mockResolvedValue(undefined);
  });

  it("creates customer and returns created: true when slug does not exist", async () => {
    const result = await handleUpdateCustomerFacts({ slug: "new-co", name: "New Co Ltd" }, "/data");

    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      success: boolean;
      created: boolean;
      facts: { name: string };
    };
    expect(parsed.success).toBe(true);
    expect(parsed.created).toBe(true);
    expect(parsed.facts.name).toBe("New Co Ltd");
  });

  it("uses slug as name when no name given for new customer", async () => {
    const result = await handleUpdateCustomerFacts({ slug: "beta-corp" }, "/data");

    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      success: boolean;
      facts: { name: string };
    };
    expect(parsed.facts.name).toBe("beta-corp");
  });

  it("calls ensureCustomerDir for new customers", async () => {
    await handleUpdateCustomerFacts({ slug: "gamma-inc" }, "/data");
    expect(mockEnsureDir).toHaveBeenCalledWith("/data", "gamma-inc");
  });

  it("sets default relationship_stage to prospect for new customers", async () => {
    const result = await handleUpdateCustomerFacts({ slug: "delta-llc" }, "/data");

    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      facts: { relationship_stage: string };
    };
    expect(parsed.facts.relationship_stage).toBe("prospect");
  });
});
