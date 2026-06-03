import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("runRbacSet", () => {
  it("creates rbac.json with actor role", async () => {
    vol.fromJSON({});
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runRbacSet } = await import("../../src/commands/rbac.js");

    await runRbacSet("alice", "admin", "/crm");

    const content = JSON.parse(
      vol.readFileSync("/crm/.agentic/rbac.json", "utf-8") as string
    ) as Record<string, unknown>;
    expect((content["actors"] as Record<string, string>)["alice"]).toBe("admin");
    consoleSpy.mockRestore();
  });

  it("exits on invalid role", async () => {
    vol.fromJSON({});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);
    const { runRbacSet } = await import("../../src/commands/rbac.js");

    await expect(runRbacSet("alice", "superuser", "/crm")).rejects.toThrow("exit");
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

describe("runRbacShow", () => {
  it("shows message when no roles configured", async () => {
    vol.fromJSON({});
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runRbacShow } = await import("../../src/commands/rbac.js");

    await runRbacShow("/crm");

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join(" ");
    expect(output).toMatch(/no rbac|default/i);
    consoleSpy.mockRestore();
  });

  it("lists configured roles", async () => {
    vol.fromJSON({
      "/crm/.agentic/rbac.json": JSON.stringify({ actors: { alice: "admin", bob: "rep" } }),
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runRbacShow } = await import("../../src/commands/rbac.js");

    await runRbacShow("/crm");

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join(" ");
    expect(output).toContain("alice");
    expect(output).toContain("bob");
    consoleSpy.mockRestore();
  });
});

describe("runRbacShow — with default role", () => {
  it("shows default role when config has default set", async () => {
    vol.fromJSON({
      "/crm/.agentic/rbac.json": JSON.stringify({ actors: { alice: "admin" }, default: "rep" }),
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runRbacShow } = await import("../../src/commands/rbac.js");

    await runRbacShow("/crm");

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join(" ");
    expect(output).toContain("Default");
    expect(output).toContain("rep");
    consoleSpy.mockRestore();
  });
});

describe("runRbacCheck", () => {
  it("shows CAN message when actor is allowed", async () => {
    vol.fromJSON({
      "/crm/.agentic/rbac.json": JSON.stringify({ actors: { alice: "admin" } }),
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runRbacCheck } = await import("../../src/commands/rbac.js");

    await runRbacCheck("alice", "export_customer", "/crm");

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join(" ");
    expect(output).toContain("CAN");
    consoleSpy.mockRestore();
  });

  it("shows CANNOT message when actor lacks permission", async () => {
    vol.fromJSON({
      "/crm/.agentic/rbac.json": JSON.stringify({ actors: { bob: "rep" } }),
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runRbacCheck } = await import("../../src/commands/rbac.js");

    await runRbacCheck("bob", "export_customer", "/crm");

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join(" ");
    expect(output).toContain("CANNOT");
    consoleSpy.mockRestore();
  });
});

describe("rbacCommand — process.cwd() fallbacks via parseAsync", () => {
  it("runRbacSet falls back to process.cwd() when env not set", async () => {
    vol.fromJSON({});
    delete process.env["DXCRM_DATA_DIR"];
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { rbacCommand } = await import("../../src/commands/rbac.js");
    await rbacCommand.parseAsync(["node", "rbac", "set", "alice", "admin"]);
    consoleSpy.mockRestore();
    process.env["DXCRM_DATA_DIR"] = "/crm";
  });

  it("runRbacShow falls back to process.cwd() when env not set", async () => {
    vol.fromJSON({});
    delete process.env["DXCRM_DATA_DIR"];
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { rbacCommand } = await import("../../src/commands/rbac.js");
    await rbacCommand.parseAsync(["node", "rbac", "show"]);
    consoleSpy.mockRestore();
    process.env["DXCRM_DATA_DIR"] = "/crm";
  });

  it("runRbacCheck falls back to process.cwd() when env not set", async () => {
    vol.fromJSON({});
    delete process.env["DXCRM_DATA_DIR"];
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { rbacCommand } = await import("../../src/commands/rbac.js");
    await rbacCommand.parseAsync(["node", "rbac", "check", "alice", "export_customer"]);
    consoleSpy.mockRestore();
    process.env["DXCRM_DATA_DIR"] = "/crm";
  });
});

describe("rbacCommand", () => {
  it("exports rbacCommand with name 'rbac'", async () => {
    const { rbacCommand } = await import("../../src/commands/rbac.js");
    expect(rbacCommand.name()).toBe("rbac");
  });

  it("has set, show, check subcommands", async () => {
    const { rbacCommand } = await import("../../src/commands/rbac.js");
    const names = rbacCommand.commands.map((c) => c.name());
    expect(names).toContain("set");
    expect(names).toContain("show");
    expect(names).toContain("check");
  });

  it("check subcommand invokes runRbacCheck via parseAsync", async () => {
    vol.fromJSON({
      "/crm/.agentic/rbac.json": JSON.stringify({ actors: { alice: "admin" } }),
    });
    process.env["DXCRM_DATA_DIR"] = "/crm";
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { rbacCommand } = await import("../../src/commands/rbac.js");

    await rbacCommand.parseAsync(["node", "rbac", "check", "alice", "export_customer"]);

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join(" ");
    expect(output).toContain("alice");
    consoleSpy.mockRestore();
  });
});
