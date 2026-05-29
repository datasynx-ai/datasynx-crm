import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => { const { fs } = await import("memfs"); return { default: fs, ...fs }; });
vi.mock("@lancedb/lancedb", () => ({ connect: vi.fn().mockResolvedValue({ tableNames: vi.fn().mockResolvedValue([]) }) }));

const DATA_DIR = "/data";

describe("interpolate", () => {
  it("replaces single variable", async () => {
    const { interpolate } = await import("../../src/core/template-engine.js");
    expect(interpolate("Hello {{company}}", { company: "Acme" })).toBe("Hello Acme");
  });

  it("replaces multiple variables", async () => {
    const { interpolate } = await import("../../src/core/template-engine.js");
    expect(interpolate("{{greeting}} {{name}}", { greeting: "Hi", name: "Alice" })).toBe("Hi Alice");
  });

  it("keeps unresolved variables as-is", async () => {
    const { interpolate } = await import("../../src/core/template-engine.js");
    expect(interpolate("Hello {{missing}}", {})).toBe("Hello {{missing}}");
  });

  it("handles numeric values", async () => {
    const { interpolate } = await import("../../src/core/template-engine.js");
    expect(interpolate("Year: {{year}}", { year: 2026 })).toBe("Year: 2026");
  });

  it("handles undefined value in map same as missing", async () => {
    const { interpolate } = await import("../../src/core/template-engine.js");
    expect(interpolate("{{x}}", { x: undefined })).toBe("{{x}}");
  });

  it("replaces all occurrences of same variable", async () => {
    const { interpolate } = await import("../../src/core/template-engine.js");
    expect(interpolate("{{a}} and {{a}}", { a: "X" })).toBe("X and X");
  });
});

describe("extractVariables", () => {
  it("returns unique variable names", async () => {
    const { extractVariables } = await import("../../src/core/template-engine.js");
    expect(extractVariables("{{a}} {{b}} {{a}}")).toEqual(["a", "b", "a"]);
  });

  it("returns empty array for no variables", async () => {
    const { extractVariables } = await import("../../src/core/template-engine.js");
    expect(extractVariables("no vars here")).toEqual([]);
  });
});

describe("buildVariablesFromCustomer", () => {
  beforeEach(() => {
    vol.reset();
    vi.resetModules();
  });

  it("reads company from main_facts.md", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/main_facts.md`]: [
        "---",
        "name: Acme Corp",
        "domain: acme.com",
        "email: ceo@acme.com",
        "relationship_stage: prospect",
        "tags: []",
        "currency: EUR",
        "created: '2026-05-29'",
        "updated: '2026-05-29'",
        "last_touchpoint: 2026-05-29",
        "---",
        "",
      ].join("\n"),
    });
    const { buildVariablesFromCustomer } = await import("../../src/core/template-engine.js");
    const vars = await buildVariablesFromCustomer(DATA_DIR, "acme");
    expect(vars["company"]).toBe("Acme Corp");
    expect(vars["domain"]).toBe("acme.com");
    expect(vars["slug"]).toBe("acme");
  });

  it("falls back to slug when main_facts missing", async () => {
    vol.fromJSON({});
    const { buildVariablesFromCustomer } = await import("../../src/core/template-engine.js");
    const vars = await buildVariablesFromCustomer(DATA_DIR, "unknown-co");
    expect(vars["company"]).toBe("unknown-co");
  });

  it("includes date, year, month", async () => {
    vol.fromJSON({});
    const { buildVariablesFromCustomer } = await import("../../src/core/template-engine.js");
    const vars = await buildVariablesFromCustomer(DATA_DIR, "x");
    expect(typeof vars["year"]).toBe("number");
    expect(typeof vars["date"]).toBe("string");
    expect(typeof vars["month"]).toBe("string");
  });
});
