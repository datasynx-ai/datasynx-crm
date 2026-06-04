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

describe("dxcrm usage", () => {
  it("prints aggregated usage", async () => {
    const { recordUsage } = await import("../../src/core/usage.js");
    recordUsage("/crm", {
      slug: "acme",
      model: "claude-haiku-4-5",
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { usageCommand } = await import("../../src/commands/usage.js");
    await usageCommand.parseAsync(["node", "usage"]);
    const out = logSpy.mock.calls.flat().join("\n");
    expect(out).toContain("Calls:          1");
    expect(out).toContain("acme");
    logSpy.mockRestore();
  });
});
