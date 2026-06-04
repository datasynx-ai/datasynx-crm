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

describe("scanHygiene", () => {
  it("flags missing contact info, malformed domain, and duplicates", async () => {
    vol.fromJSON({
      "/crm/customers/acme/main_facts.md": cust("Acme", { domain: "https://www.acme.com" }),
      "/crm/customers/acme-corp/main_facts.md": cust("Acme Corp", { email: "ceo@acme.com" }),
      "/crm/customers/lonely/main_facts.md": cust("Lonely", {}), // no domain/email
    });
    const { scanHygiene } = await import("../../src/core/hygiene.js");
    const issues = await scanHygiene(DATA_DIR);
    const types = issues.map((i) => i.type);

    expect(types).toContain("missing_contact"); // lonely
    expect(types).toContain("format_domain"); // acme has https://www.
    expect(types).toContain("duplicate"); // acme + acme-corp share acme.com

    const fmt = issues.find((i) => i.type === "format_domain");
    expect(fmt!.suggestedFix).toBe("acme.com");
  });

  it("returns no issues for a clean customer", async () => {
    vol.fromJSON({
      "/crm/customers/clean/main_facts.md": cust("Clean", {
        domain: "clean.com",
        email: "hi@clean.com",
      }),
    });
    const { scanHygiene } = await import("../../src/core/hygiene.js");
    expect(await scanHygiene(DATA_DIR)).toHaveLength(0);
  });
});
