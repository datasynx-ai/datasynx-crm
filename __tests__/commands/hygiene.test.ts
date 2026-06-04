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

describe("dxcrm hygiene scan", () => {
  it("reports issues", async () => {
    vol.fromJSON({
      "/crm/customers/lonely/main_facts.md":
        "---\nname: Lonely\nrelationship_stage: active\ncreated: 2026-01-01\nupdated: 2026-01-01\n---\n",
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { hygieneCommand } = await import("../../src/commands/hygiene.js");
    await hygieneCommand.parseAsync(["node", "hygiene", "scan"]);
    expect(logSpy.mock.calls.flat().join("\n")).toContain("missing_contact");
    logSpy.mockRestore();
  });
});
