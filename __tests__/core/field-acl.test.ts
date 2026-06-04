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

describe("field-level ACL", () => {
  it("canSeeField: public fields visible to all; restricted only to listed roles", async () => {
    const { canSeeField } = await import("../../src/core/rbac.js");
    const acl = { deal_value: ["admin", "manager"] as Array<"admin" | "manager" | "rep"> };
    expect(canSeeField("name", "rep", acl)).toBe(true);
    expect(canSeeField("deal_value", "admin", acl)).toBe(true);
    expect(canSeeField("deal_value", "rep", acl)).toBe(false);
  });

  it("redactFields removes fields the role may not see", async () => {
    const { redactFields } = await import("../../src/core/rbac.js");
    const acl = { deal_value: ["admin"] as Array<"admin" | "manager" | "rep"> };
    const redacted = redactFields({ name: "Acme", deal_value: 5000 }, "rep", acl);
    expect(redacted).toEqual({ name: "Acme" });
  });

  it("buildContextBlock redacts metadata for the given role", async () => {
    vol.fromJSON({
      "/crm/.agentic/rbac.json": JSON.stringify({
        actors: { alice: "rep" },
        field_acl: { deal_value: ["admin", "manager"] },
      }),
      "/crm/customers/acme/main_facts.md":
        "---\nname: Acme\nrelationship_stage: active\ndeal_value: 5000\n---\n",
    });
    const { buildContextBlock } = await import("../../src/core/context-builder.js");

    const repView = await buildContextBlock(DATA_DIR, "acme", "rep");
    expect(repView.metadata["deal_value"]).toBeUndefined();
    expect(repView.metadata["name"]).toBe("Acme");

    const adminView = await buildContextBlock(DATA_DIR, "acme", "admin");
    expect(adminView.metadata["deal_value"]).toBe(5000);
  });
});
