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

function facts(extra: string): string {
  return `---\nname: Acme\nrelationship_stage: active\n${extra}created: 2026-01-01\nupdated: 2026-01-01\n---\n`;
}

describe("enrichment", () => {
  it("derives a domain from an email (offline built-in provider)", async () => {
    const { domainFromEmailProvider } = await import("../../src/core/enrichment.js");
    const out = await domainFromEmailProvider.enrich(
      { name: "Acme", email: "jane@acme.com" },
      { getSecret: () => undefined }
    );
    expect(out.domain).toBe("acme.com");
  });

  it("mergeEnrichment fills only missing fields (never overwrites)", async () => {
    const { mergeEnrichment } = await import("../../src/core/enrichment.js");
    const merged = mergeEnrichment(
      { domain: "existing.com" },
      { domain: "other.com", industry: "SaaS" }
    );
    expect(merged.domain).toBe("existing.com");
    expect(merged.industry).toBe("SaaS");
  });

  it("enrichCustomer writes derived fields into main_facts when missing", async () => {
    vol.fromJSON({ "/crm/customers/acme/main_facts.md": facts("email: jane@acme.com\n") });
    const { enrichCustomer } = await import("../../src/core/enrichment.js");
    const result = await enrichCustomer(DATA_DIR, "acme", { write: true });
    expect(result.applied.domain).toBe("acme.com");

    const { readMainFacts } = await import("../../src/fs/customer-dir.js");
    const facts2 = await readMainFacts(DATA_DIR, "acme");
    expect(facts2.domain).toBe("acme.com");
  });

  it("runs custom providers and exposes vault secrets via context", async () => {
    const { runEnrichment } = await import("../../src/core/enrichment.js");
    const provider = {
      name: "test",
      enrich: (input: { name: string }, ctx: { getSecret: (n: string) => string | undefined }) => ({
        industry: ctx.getSecret("industry_key") === "ok" ? "FinTech" : undefined,
        name: input.name,
      }),
    };
    const out = await runEnrichment({ name: "Acme" }, [provider], {
      getSecret: (n) => (n === "industry_key" ? "ok" : undefined),
    });
    expect(out.industry).toBe("FinTech");
  });
});
