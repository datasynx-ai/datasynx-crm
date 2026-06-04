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

describe("dxcrm object", () => {
  it("defines an object, adds a record, and lists it", async () => {
    vol.fromJSON({ "/crm/.keep": "" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { objectCommand } = await import("../../src/commands/fields.js");

    await objectCommand.parseAsync([
      "node",
      "object",
      "define",
      "contract",
      "--field",
      "value:number",
      "--field",
      "stage:select:draft|signed",
    ]);
    await objectCommand.parseAsync([
      "node",
      "object",
      "add",
      "contract",
      "--set",
      "value=5000",
      "--set",
      "stage=signed",
    ]);

    const stored = JSON.parse(
      vol.readFileSync("/crm/.agentic/objects/contract.json", "utf-8") as string
    ) as { records: Array<{ values: Record<string, unknown> }> };
    expect(stored.records[0]!.values).toEqual({ value: 5000, stage: "signed" });

    await objectCommand.parseAsync(["node", "object", "list", "contract"]);
    expect(logSpy.mock.calls.flat().join("\n")).toContain("signed");
    logSpy.mockRestore();
  });

  it("rejects a record with an invalid select value", async () => {
    vol.fromJSON({ "/crm/.keep": "" });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { objectCommand } = await import("../../src/commands/fields.js");
    await objectCommand.parseAsync([
      "node",
      "object",
      "define",
      "contract",
      "--field",
      "stage:select:draft|signed",
    ]);
    await objectCommand.parseAsync(["node", "object", "add", "contract", "--set", "stage=bronze"]);
    expect(errSpy.mock.calls.flat().join("\n")).toContain("Could not create record");
    errSpy.mockRestore();
  });
});
