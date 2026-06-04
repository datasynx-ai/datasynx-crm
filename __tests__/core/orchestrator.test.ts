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
import type { Subagent } from "../../src/core/orchestrator.js";

const SUBAGENTS: Subagent[] = [
  { name: "billing-agent", topics: ["invoice", "refund", "billing"] },
  { name: "tech-agent", topics: ["bug", "error", "integration"] },
  { name: "sales-agent", topics: ["pricing", "demo", "quote"] },
];

describe("routeToSubagent", () => {
  it("routes a task to the subagent whose topics match", async () => {
    const { routeToSubagent } = await import("../../src/core/orchestrator.js");
    expect(routeToSubagent(SUBAGENTS, "Customer wants a refund on their invoice")).toBe(
      "billing-agent"
    );
    expect(routeToSubagent(SUBAGENTS, "There's an integration bug in the API")).toBe("tech-agent");
  });

  it("returns null when no topic matches", async () => {
    const { routeToSubagent } = await import("../../src/core/orchestrator.js");
    expect(routeToSubagent(SUBAGENTS, "general chit chat")).toBeNull();
  });
});

describe("handoff log + subagent store", () => {
  it("saves subagents and records handoffs", async () => {
    const { saveSubagents, loadSubagents, recordHandoff, loadHandoffs } =
      await import("../../src/core/orchestrator.js");
    saveSubagents(DATA_DIR, SUBAGENTS);
    expect(loadSubagents(DATA_DIR)).toHaveLength(3);

    recordHandoff(DATA_DIR, { from: "orchestrator", to: "billing-agent", task: "refund" });
    const log = loadHandoffs(DATA_DIR);
    expect(log).toHaveLength(1);
    expect(log[0]!.to).toBe("billing-agent");
  });
});
