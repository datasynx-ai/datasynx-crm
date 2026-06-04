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

const ACME = [
  "---",
  "name: Acme",
  "relationship_stage: active",
  "deal_value: 5000",
  "created: 2026-01-01",
  "updated: 2026-06-01",
  "---",
  "",
].join("\n");

describe("dxcrm segment", () => {
  it("defines a segment and lists its members", async () => {
    vol.fromJSON({ "/crm/customers/acme/main_facts.md": ACME });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { segmentCommand } = await import("../../src/commands/segment.js");

    await segmentCommand.parseAsync([
      "node",
      "segment",
      "define",
      "hot",
      "--stage",
      "active",
      "--min-deal-value",
      "1000",
    ]);
    await segmentCommand.parseAsync(["node", "segment", "members", "hot"]);

    expect(logSpy.mock.calls.flat().join("\n")).toContain("acme");
    logSpy.mockRestore();
  });
});
