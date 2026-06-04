import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

beforeEach(() => {
  vol.reset();
});

const DATA_DIR = "/crm";

function cust(name: string, fields: Record<string, string>): string {
  return [
    "---",
    `name: ${name}`,
    "relationship_stage: active",
    "created: 2026-01-01",
    "updated: 2026-01-01",
    ...Object.entries(fields).map(([k, v]) => `${k}: ${v}`),
    "---",
    "",
  ].join("\n");
}

describe("normalizeDomain", () => {
  it("strips protocol and www and lowercases", async () => {
    const { normalizeDomain } = await import("../../src/core/identity.js");
    expect(normalizeDomain("https://www.Acme.com/")).toBe("acme.com");
    expect(normalizeDomain("acme.com")).toBe("acme.com");
    expect(normalizeDomain("ceo@acme.com")).toBe("acme.com");
  });
});

describe("findDuplicateClusters", () => {
  it("groups customers sharing a canonical domain", async () => {
    vol.fromJSON({
      "/crm/customers/acme/main_facts.md": cust("Acme", { domain: "https://www.acme.com" }),
      "/crm/customers/acme-corp/main_facts.md": cust("Acme Corp", { email: "ceo@acme.com" }),
      "/crm/customers/beta/main_facts.md": cust("Beta", { domain: "beta.de" }),
    });
    const { findDuplicateClusters } = await import("../../src/core/identity.js");
    const clusters = await findDuplicateClusters(DATA_DIR);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.key).toBe("acme.com");
    expect(clusters[0]!.slugs.sort()).toEqual(["acme", "acme-corp"]);
  });

  it("returns no clusters when all customers are distinct", async () => {
    vol.fromJSON({
      "/crm/customers/acme/main_facts.md": cust("Acme", { domain: "acme.com" }),
      "/crm/customers/beta/main_facts.md": cust("Beta", { domain: "beta.de" }),
    });
    const { findDuplicateClusters } = await import("../../src/core/identity.js");
    expect(await findDuplicateClusters(DATA_DIR)).toHaveLength(0);
  });
});
