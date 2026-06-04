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
const TODAY = "2026-06-04";

function facts(name: string): string {
  return `---\nname: ${name}\nrelationship_stage: active\ncreated: 2026-01-01\nupdated: 2026-01-01\n---\n`;
}

describe("assessChurn", () => {
  it("flags high churn risk when a customer has gone silent for a long time", async () => {
    vol.fromJSON({
      "/crm/customers/acme/main_facts.md": facts("Acme"),
      // last contact in January → far past the 30-day window relative to TODAY
      "/crm/customers/acme/interactions.md":
        "# Interactions\n\n## 2026-01-05 · Call\n**With:** Jane Doe <jane@acme.com>\n**Summary:** kickoff\n---\n",
    });
    const { assessChurn } = await import("../../src/core/churn.js");
    const res = assessChurn(DATA_DIR, "acme", TODAY);
    expect(res.level).toBe("high");
    expect(res.riskScore).toBeGreaterThanOrEqual(60);
    expect(res.signals.length).toBeGreaterThan(0);
  });

  it("reports low risk for a freshly engaged customer", async () => {
    vol.fromJSON({
      "/crm/customers/fresh/main_facts.md": facts("Fresh"),
      "/crm/customers/fresh/interactions.md":
        "# Interactions\n\n## 2026-06-03 · Call\n**With:** Sam <sam@fresh.com>\n**Summary:** great chat\n---\n" +
        "## 2026-05-28 · Email\n**With:** Sam <sam@fresh.com>\n**Summary:** follow up\n---\n",
    });
    const { assessChurn } = await import("../../src/core/churn.js");
    const res = assessChurn(DATA_DIR, "fresh", TODAY);
    expect(res.level).toBe("low");
    expect(res.riskScore).toBeLessThan(40);
  });

  it("scans all customers and ranks the riskiest first", async () => {
    vol.fromJSON({
      "/crm/customers/acme/main_facts.md": facts("Acme"),
      "/crm/customers/acme/interactions.md":
        "# Interactions\n\n## 2026-01-05 · Call\n**With:** Jane <jane@acme.com>\n**Summary:** x\n---\n",
      "/crm/customers/fresh/main_facts.md": facts("Fresh"),
      "/crm/customers/fresh/interactions.md":
        "# Interactions\n\n## 2026-06-03 · Call\n**With:** Sam <sam@fresh.com>\n**Summary:** y\n---\n",
    });
    const { scanChurn } = await import("../../src/core/churn.js");
    const ranked = scanChurn(DATA_DIR, TODAY);
    expect(ranked).toHaveLength(2);
    expect(ranked[0]!.slug).toBe("acme");
    expect(ranked[0]!.riskScore).toBeGreaterThan(ranked[1]!.riskScore);
  });
});
