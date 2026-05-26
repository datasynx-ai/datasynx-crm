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

    const content = JSON.parse(vol.readFileSync("/crm/.agentic/rbac.json", "utf-8") as string) as Record<string, unknown>;
    expect((content["actors"] as Record<string, string>)["alice"]).toBe("admin");
    consoleSpy.mockRestore();
  });

  it("exits on invalid role", async () => {
    vol.fromJSON({});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => { throw new Error("exit"); }) as never);
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
});
