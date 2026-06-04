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

describe("dxcrm nba", () => {
  it("prints recommendations", async () => {
    vol.fromJSON({
      "/crm/customers/acme/pipeline.md":
        "# Pipeline\n\n| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |\n|---|---|---|---|---|---|---|---|\n| Big | negotiation | 50000 | EUR | 80 | | | 2026-06-01 |\n",
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { nbaCommand } = await import("../../src/commands/nba.js");
    await nbaCommand.parseAsync(["node", "nba", "acme"]);
    expect(logSpy.mock.calls.flat().join("\n")).toMatch(/\[high\]/);
    logSpy.mockRestore();
  });
});
