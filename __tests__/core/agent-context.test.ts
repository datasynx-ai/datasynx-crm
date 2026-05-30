import { describe, it, expect } from "vitest";
import { AGENT_CONTEXT, AGENT_CONTEXT_TEXT } from "../../src/core/agent-context.js";

describe("AGENT_CONTEXT", () => {
  it("has the correct product name", () => {
    expect(AGENT_CONTEXT.product).toBe("DatasynxOpenCRM");
  });

  it("has 9 core harness tools", () => {
    // AGENT_CONTEXT is injected into harness files (CLAUDE.md etc.) — core tools only.
    // Full 50-tool reference is in capabilities.ts (get_capabilities MCP tool).
    expect(AGENT_CONTEXT.tools.length).toBe(9);
  });

  it("every tool has required fields", () => {
    for (const tool of AGENT_CONTEXT.tools) {
      expect(tool.name, `${tool.name} missing name`).toBeTruthy();
      expect(tool.description, `${tool.name} missing description`).toBeTruthy();
      expect(tool.when, `${tool.name} missing when`).toBeTruthy();
      expect(Array.isArray(tool.params), `${tool.name} params not array`).toBe(true);
      expect(tool.rbac, `${tool.name} missing rbac`).toMatch(/^(any|rep|manager|admin)$/);
      expect(typeof tool.audited, `${tool.name} audited not boolean`).toBe("boolean");
    }
  });

  it("tool names are unique", () => {
    const names = AGENT_CONTEXT.tools.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("contains critical path tools", () => {
    const names = AGENT_CONTEXT.tools.map((t) => t.name);
    const critical = [
      "get_customer_context",
      "log_interaction",
      "update_deal",
      "search_customer_knowledge",
      "list_customers",
    ];
    for (const name of critical) {
      expect(names, `Missing critical tool: ${name}`).toContain(name);
    }
  });

  it("has a workflow with ordered steps", () => {
    const steps = AGENT_CONTEXT.workflow.map((w) => w.step);
    expect(steps.length).toBeGreaterThan(0);
    for (let i = 0; i < steps.length; i++) {
      expect(steps[i]).toBe(i + 1);
    }
  });

  it("rbacMatrix has rep, manager, admin roles", () => {
    expect(AGENT_CONTEXT.rbacMatrix).toHaveProperty("rep");
    expect(AGENT_CONTEXT.rbacMatrix).toHaveProperty("manager");
    expect(AGENT_CONTEXT.rbacMatrix).toHaveProperty("admin");
  });
});

describe("AGENT_CONTEXT_TEXT", () => {
  it("is a non-empty string", () => {
    expect(typeof AGENT_CONTEXT_TEXT).toBe("string");
    expect(AGENT_CONTEXT_TEXT.length).toBeGreaterThan(100);
  });

  it("contains tool names", () => {
    expect(AGENT_CONTEXT_TEXT).toContain("get_customer_context");
    expect(AGENT_CONTEXT_TEXT).toContain("log_interaction");
  });

  it("contains workflow section", () => {
    expect(AGENT_CONTEXT_TEXT).toContain("workflow");
  });

  it("contains RBAC section", () => {
    expect(AGENT_CONTEXT_TEXT).toContain("RBAC");
  });
});
