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

describe("custom field registry", () => {
  it("starts empty and persists added definitions", async () => {
    const { loadFieldDefinitions, defineCustomField } =
      await import("../../src/core/custom-fields.js");
    expect(loadFieldDefinitions(DATA_DIR)).toEqual([]);

    defineCustomField(DATA_DIR, {
      name: "renewal_quarter",
      type: "text",
      label: "Renewal Quarter",
    });
    defineCustomField(DATA_DIR, { name: "arr", type: "number" });

    const defs = loadFieldDefinitions(DATA_DIR);
    expect(defs.map((d) => d.name)).toEqual(["renewal_quarter", "arr"]);
    // stored on disk under .agentic/schema
    expect(vol.existsSync("/crm/.agentic/schema/custom-fields.json")).toBe(true);
  });

  it("upserts a field definition by name (no duplicates)", async () => {
    const { defineCustomField, loadFieldDefinitions } =
      await import("../../src/core/custom-fields.js");
    defineCustomField(DATA_DIR, { name: "tier", type: "text" });
    defineCustomField(DATA_DIR, { name: "tier", type: "select", options: ["gold", "silver"] });
    const defs = loadFieldDefinitions(DATA_DIR);
    expect(defs).toHaveLength(1);
    expect(defs[0]!.type).toBe("select");
  });
});

describe("validateCustomFields", () => {
  it("coerces and validates values against definitions", async () => {
    const { validateCustomFields } = await import("../../src/core/custom-fields.js");
    const defs = [
      { name: "arr", type: "number" as const },
      { name: "active", type: "boolean" as const },
      { name: "tier", type: "select" as const, options: ["gold", "silver"] },
    ];
    const ok = validateCustomFields({ arr: "50000", active: "true", tier: "gold" }, defs);
    expect(ok.valid).toBe(true);
    expect(ok.values).toEqual({ arr: 50000, active: true, tier: "gold" });
  });

  it("rejects unknown fields and bad select values", async () => {
    const { validateCustomFields } = await import("../../src/core/custom-fields.js");
    const defs = [{ name: "tier", type: "select" as const, options: ["gold", "silver"] }];
    const r1 = validateCustomFields({ unknown_field: "x" }, defs);
    expect(r1.valid).toBe(false);
    const r2 = validateCustomFields({ tier: "bronze" }, defs);
    expect(r2.valid).toBe(false);
  });

  it("rejects non-numeric values for number fields", async () => {
    const { validateCustomFields } = await import("../../src/core/custom-fields.js");
    const defs = [{ name: "arr", type: "number" as const }];
    expect(validateCustomFields({ arr: "not-a-number" }, defs).valid).toBe(false);
  });
});
