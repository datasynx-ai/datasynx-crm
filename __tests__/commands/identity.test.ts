import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  process.env["DXCRM_DATA_DIR"] = "/crm";
});
afterEach(() => {
  delete process.env["DXCRM_DATA_DIR"];
});

function cust(name: string, domain: string): string {
  return [
    "---",
    `name: ${name}`,
    "relationship_stage: active",
    "created: 2026-01-01",
    "updated: 2026-01-01",
    `domain: ${domain}`,
    "---",
    "",
  ].join("\n");
}

describe("dxcrm identity duplicates", () => {
  it("reports duplicate clusters", async () => {
    vol.fromJSON({
      "/crm/customers/acme/main_facts.md": cust("Acme", "https://www.acme.com"),
      "/crm/customers/acme-corp/main_facts.md": cust("Acme Corp", "acme.com"),
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { identityCommand } = await import("../../src/commands/identity.js");
    await identityCommand.parseAsync(["node", "identity", "duplicates"]);
    const out = logSpy.mock.calls.flat().join("\n");
    expect(out).toContain("acme.com");
    expect(out).toContain("acme-corp");
    logSpy.mockRestore();
  });
});
