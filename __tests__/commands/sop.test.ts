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

describe("dxcrm sop", () => {
  it("adds and finds an SOP", async () => {
    vol.fromJSON({ "/crm/.keep": "" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { sopCommand } = await import("../../src/commands/sop.js");
    await sopCommand.parseAsync([
      "node",
      "sop",
      "add",
      "Create a quote",
      "--triggers",
      "quote,pricing",
      "--body",
      "steps",
    ]);
    await sopCommand.parseAsync(["node", "sop", "find", "create quote"]);
    expect(logSpy.mock.calls.flat().join("\n")).toContain("Create a quote");
    logSpy.mockRestore();
  });
});
