import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("getRbacConfig", () => {
  it("returns empty actors and no default when config file does not exist", async () => {
    vol.fromJSON({});

    const { getRbacConfig } = await import("../../src/core/rbac.js");
    const config = getRbacConfig("/crm");
    expect(config.actors).toEqual({});
    expect(config.default).toBeUndefined();
  });

  it("reads existing config from .agentic/rbac.json", async () => {
    vol.fromJSON({
      "/crm/.agentic/rbac.json": JSON.stringify({
        actors: { alice: "admin", bob: "rep" },
        default: "rep",
      }),
    });

    const { getRbacConfig } = await import("../../src/core/rbac.js");
    const config = getRbacConfig("/crm");
    expect(config.actors["alice"]).toBe("admin");
    expect(config.actors["bob"]).toBe("rep");
    expect(config.default).toBe("rep");
  });
});

describe("setActorRole", () => {
  it("creates .agentic/rbac.json when it does not exist", async () => {
    vol.fromJSON({});

    const { setActorRole } = await import("../../src/core/rbac.js");
    setActorRole("/crm", "alice", "admin");

    const content = JSON.parse(
      vol.readFileSync("/crm/.agentic/rbac.json", "utf-8") as string
    ) as Record<string, unknown>;
    expect((content["actors"] as Record<string, string>)["alice"]).toBe("admin");
  });

  it("adds new actor to existing config", async () => {
    vol.fromJSON({
      "/crm/.agentic/rbac.json": JSON.stringify({ actors: { alice: "admin" } }),
    });

    const { setActorRole } = await import("../../src/core/rbac.js");
    setActorRole("/crm", "bob", "rep");

    const content = JSON.parse(
      vol.readFileSync("/crm/.agentic/rbac.json", "utf-8") as string
    ) as Record<string, unknown>;
    expect((content["actors"] as Record<string, string>)["alice"]).toBe("admin");
    expect((content["actors"] as Record<string, string>)["bob"]).toBe("rep");
  });

  it("overwrites existing actor role", async () => {
    vol.fromJSON({
      "/crm/.agentic/rbac.json": JSON.stringify({ actors: { alice: "rep" } }),
    });

    const { setActorRole } = await import("../../src/core/rbac.js");
    setActorRole("/crm", "alice", "admin");

    const content = JSON.parse(
      vol.readFileSync("/crm/.agentic/rbac.json", "utf-8") as string
    ) as Record<string, unknown>;
    expect((content["actors"] as Record<string, string>)["alice"]).toBe("admin");
  });
});

describe("getRole", () => {
  it("returns actor's role when defined", async () => {
    vol.fromJSON({
      "/crm/.agentic/rbac.json": JSON.stringify({ actors: { alice: "admin" } }),
    });

    const { getRole } = await import("../../src/core/rbac.js");
    expect(getRole("/crm", "alice")).toBe("admin");
  });

  it("returns default role when actor is not listed and default is set", async () => {
    vol.fromJSON({
      "/crm/.agentic/rbac.json": JSON.stringify({ actors: {}, default: "manager" }),
    });

    const { getRole } = await import("../../src/core/rbac.js");
    expect(getRole("/crm", "unknown")).toBe("manager");
  });

  it("returns 'rep' when actor is not listed and no default is set", async () => {
    vol.fromJSON({
      "/crm/.agentic/rbac.json": JSON.stringify({ actors: {} }),
    });

    const { getRole } = await import("../../src/core/rbac.js");
    expect(getRole("/crm", "unknown")).toBe("rep");
  });

  it("returns 'rep' when config file does not exist", async () => {
    vol.fromJSON({});

    const { getRole } = await import("../../src/core/rbac.js");
    expect(getRole("/crm", "anyone")).toBe("rep");
  });
});

describe("canWrite", () => {
  it("admin can use all write tools", async () => {
    const { canWrite } = await import("../../src/core/rbac.js");
    expect(canWrite("admin", "log_interaction")).toBe(true);
    expect(canWrite("admin", "update_deal")).toBe(true);
    expect(canWrite("admin", "update_customer_facts")).toBe(true);
    expect(canWrite("admin", "export_customer")).toBe(true);
  });

  it("manager can use log_interaction and update_deal", async () => {
    const { canWrite } = await import("../../src/core/rbac.js");
    expect(canWrite("manager", "log_interaction")).toBe(true);
    expect(canWrite("manager", "update_deal")).toBe(true);
  });

  it("manager cannot use update_customer_facts or export_customer", async () => {
    const { canWrite } = await import("../../src/core/rbac.js");
    expect(canWrite("manager", "update_customer_facts")).toBe(false);
    expect(canWrite("manager", "export_customer")).toBe(false);
  });

  it("rep can use log_interaction and update_deal", async () => {
    const { canWrite } = await import("../../src/core/rbac.js");
    expect(canWrite("rep", "log_interaction")).toBe(true);
    expect(canWrite("rep", "update_deal")).toBe(true);
    expect(canWrite("rep", "update_customer_facts")).toBe(false);
    expect(canWrite("rep", "export_customer")).toBe(false);
  });

  it("returns false for unknown tool", async () => {
    const { canWrite } = await import("../../src/core/rbac.js");
    expect(canWrite("admin", "delete_everything")).toBe(false);
  });
});

describe("enforceRbac", () => {
  it("passes silently when no rbac.json exists (open access)", async () => {
    vol.fromJSON({});
    delete process.env["DXCRM_ACTOR"];
    const { enforceRbac } = await import("../../src/core/rbac.js");
    expect(() => enforceRbac("/crm", "log_interaction")).not.toThrow();
    expect(() => enforceRbac("/crm", "update_customer_facts")).not.toThrow();
  });

  it("passes when actor has permission (admin can update_customer_facts)", async () => {
    vol.fromJSON({
      "/crm/.agentic/rbac.json": JSON.stringify({ actors: { alice: "admin" } }),
    });
    process.env["DXCRM_ACTOR"] = "alice";
    const { enforceRbac } = await import("../../src/core/rbac.js");
    expect(() => enforceRbac("/crm", "update_customer_facts")).not.toThrow();
    delete process.env["DXCRM_ACTOR"];
  });

  it("throws 'Access denied' when actor lacks permission", async () => {
    vol.fromJSON({
      "/crm/.agentic/rbac.json": JSON.stringify({ actors: { alice: "rep" } }),
    });
    process.env["DXCRM_ACTOR"] = "alice";
    const { enforceRbac } = await import("../../src/core/rbac.js");
    expect(() => enforceRbac("/crm", "update_customer_facts")).toThrow(/access denied/i);
    delete process.env["DXCRM_ACTOR"];
  });

  it("uses DXCRM_ACTOR env var as actor identity", async () => {
    vol.fromJSON({
      "/crm/.agentic/rbac.json": JSON.stringify({ actors: { charlie: "manager" } }),
    });
    process.env["DXCRM_ACTOR"] = "charlie";
    const { enforceRbac } = await import("../../src/core/rbac.js");
    expect(() => enforceRbac("/crm", "update_deal")).not.toThrow();
    expect(() => enforceRbac("/crm", "export_customer")).toThrow(/access denied/i);
    delete process.env["DXCRM_ACTOR"];
  });

  it("falls back to 'system' actor (gets 'rep' role) when DXCRM_ACTOR is unset and rbac.json exists", async () => {
    vol.fromJSON({
      "/crm/.agentic/rbac.json": JSON.stringify({ actors: { alice: "admin" } }),
    });
    delete process.env["DXCRM_ACTOR"];
    const { enforceRbac } = await import("../../src/core/rbac.js");
    // system → rep → can log_interaction and update_deal, but not update_customer_facts
    expect(() => enforceRbac("/crm", "log_interaction")).not.toThrow();
    expect(() => enforceRbac("/crm", "update_customer_facts")).toThrow(/access denied/i);
  });
});

describe("assertCanWrite", () => {
  it("does not throw when role has permission", async () => {
    const { assertCanWrite } = await import("../../src/core/rbac.js");
    expect(() => assertCanWrite("admin", "update_deal", "alice")).not.toThrow();
    expect(() => assertCanWrite("rep", "log_interaction", "bob")).not.toThrow();
  });

  it("throws when role does not have permission", async () => {
    const { assertCanWrite } = await import("../../src/core/rbac.js");
    expect(() => assertCanWrite("rep", "update_customer_facts", "bob")).toThrow();
    expect(() => assertCanWrite("manager", "export_customer", "carol")).toThrow();
  });

  it("error message includes actor and tool name", async () => {
    const { assertCanWrite } = await import("../../src/core/rbac.js");
    expect(() => assertCanWrite("rep", "update_customer_facts", "bob")).toThrow(/bob/);
    expect(() => assertCanWrite("rep", "update_customer_facts", "bob")).toThrow(/update_customer_facts/);
  });
});

describe("canSeeCustomer", () => {
  it("returns true when no rbac.json exists (open access)", async () => {
    vol.fromJSON({});
    const { canSeeCustomer } = await import("../../src/core/rbac.js");
    expect(canSeeCustomer("/crm", "alice", "acme-corp")).toBe(true);
  });

  it("admin can see any customer", async () => {
    vol.fromJSON({
      "/crm/.agentic/rbac.json": JSON.stringify({ actors: { alice: "admin" } }),
    });
    const { canSeeCustomer } = await import("../../src/core/rbac.js");
    expect(canSeeCustomer("/crm", "alice", "acme-corp")).toBe(true);
    expect(canSeeCustomer("/crm", "alice", "beta-gmbh")).toBe(true);
  });

  it("manager can see any customer", async () => {
    vol.fromJSON({
      "/crm/.agentic/rbac.json": JSON.stringify({ actors: { bob: "manager" } }),
    });
    const { canSeeCustomer } = await import("../../src/core/rbac.js");
    expect(canSeeCustomer("/crm", "bob", "acme-corp")).toBe(true);
  });

  it("rep can see owned customers", async () => {
    vol.fromJSON({
      "/crm/.agentic/rbac.json": JSON.stringify({
        actors: { carol: "rep" },
        owned_customers: { carol: ["acme-corp", "beta-gmbh"] },
      }),
    });
    const { canSeeCustomer } = await import("../../src/core/rbac.js");
    expect(canSeeCustomer("/crm", "carol", "acme-corp")).toBe(true);
    expect(canSeeCustomer("/crm", "carol", "beta-gmbh")).toBe(true);
  });

  it("rep cannot see unowned customers", async () => {
    vol.fromJSON({
      "/crm/.agentic/rbac.json": JSON.stringify({
        actors: { carol: "rep" },
        owned_customers: { carol: ["acme-corp"] },
      }),
    });
    const { canSeeCustomer } = await import("../../src/core/rbac.js");
    expect(canSeeCustomer("/crm", "carol", "beta-gmbh")).toBe(false);
  });

  it("rep with no owned_customers entry sees nothing", async () => {
    vol.fromJSON({
      "/crm/.agentic/rbac.json": JSON.stringify({ actors: { carol: "rep" } }),
    });
    const { canSeeCustomer } = await import("../../src/core/rbac.js");
    expect(canSeeCustomer("/crm", "carol", "acme-corp")).toBe(false);
  });

  it("rep with empty owned_customers map sees nothing", async () => {
    vol.fromJSON({
      "/crm/.agentic/rbac.json": JSON.stringify({ actors: { carol: "rep" }, owned_customers: {} }),
    });
    const { canSeeCustomer } = await import("../../src/core/rbac.js");
    expect(canSeeCustomer("/crm", "carol", "acme-corp")).toBe(false);
  });
});
