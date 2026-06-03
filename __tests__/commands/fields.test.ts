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

describe("dxcrm fields", () => {
  it("adds a select custom field and lists it", async () => {
    vol.fromJSON({ "/crm/.keep": "" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { fieldsCommand } = await import("../../src/commands/fields.js");

    await fieldsCommand.parseAsync([
      "node",
      "fields",
      "add",
      "tier",
      "select",
      "--options",
      "gold,silver",
    ]);

    const stored = JSON.parse(
      vol.readFileSync("/crm/.agentic/schema/custom-fields.json", "utf-8") as string
    ) as { fields: Array<{ name: string; type: string; options?: string[] }> };
    expect(stored.fields[0]!.name).toBe("tier");
    expect(stored.fields[0]!.options).toEqual(["gold", "silver"]);

    await fieldsCommand.parseAsync(["node", "fields", "list"]);
    expect(logSpy.mock.calls.flat().join("\n")).toContain("tier");
    logSpy.mockRestore();
  });

  it("rejects an invalid type", async () => {
    vol.fromJSON({ "/crm/.keep": "" });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { fieldsCommand } = await import("../../src/commands/fields.js");
    await fieldsCommand.parseAsync(["node", "fields", "add", "weird", "blob"]);
    expect(errSpy.mock.calls.flat().join("\n")).toContain("Invalid type");
    errSpy.mockRestore();
  });
});
