import { describe, it, expect } from "vitest";
import { missingFields, buildElicitation } from "../../src/mcp/elicitation.js";

describe("missingFields", () => {
  it("detects absent, null and empty required fields", () => {
    expect(missingFields({ a: "x" }, ["a", "b"])).toEqual(["b"]);
    expect(missingFields({ a: "", b: null }, ["a", "b"])).toEqual(["a", "b"]);
    expect(missingFields({ a: "x", b: 0 }, ["a", "b"])).toEqual([]);
  });
});

describe("buildElicitation", () => {
  it("produces an MCP elicitation request schema", () => {
    const e = buildElicitation("Which stage?", [
      { name: "stage", type: "string", description: "Pipeline stage" },
    ]);
    expect(e.message).toBe("Which stage?");
    expect(e.requestedSchema.type).toBe("object");
    expect(e.requestedSchema.properties["stage"]).toEqual({
      type: "string",
      description: "Pipeline stage",
    });
    expect(e.requestedSchema.required).toEqual(["stage"]);
  });
});
