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

describe("dxcrm metrics", () => {
  it("prints command-center metrics", async () => {
    vol.fromJSON({
      "/crm/.agentic/audit.log": "2026-06-01T09:00:00Z | system | log_interaction | acme | x\n",
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { metricsCommand } = await import("../../src/commands/metrics.js");
    await metricsCommand.parseAsync(["node", "metrics"]);
    const out = logSpy.mock.calls.flat().join("\n");
    expect(out).toContain("Total operations:   1");
    expect(out).toContain("Automation rate:    100%");
    logSpy.mockRestore();
  });
});
