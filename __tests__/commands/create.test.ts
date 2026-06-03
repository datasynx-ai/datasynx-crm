import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { vol } from "memfs";
import { createCustomer } from "../../src/commands/create.js";

beforeEach(() => {
  vol.reset();
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createCustomer", () => {
  it("creates customer directory with correct slug", async () => {
    vol.fromJSON({ "/crm/customers/.keep": "" });
    const r = await createCustomer({ name: "Acme Corp", dataDir: "/crm" });
    expect(r.id).toBe("acme-corp");
  });

  it("creates main_facts.md", async () => {
    vol.fromJSON({ "/crm/customers/.keep": "" });
    await createCustomer({ name: "Acme Corp", dataDir: "/crm" });
    const { fs: memFs } = await import("memfs");
    expect(memFs.existsSync("/crm/customers/acme-corp/main_facts.md")).toBe(true);
  });

  it("creates interactions.md and pipeline.md", async () => {
    vol.fromJSON({ "/crm/customers/.keep": "" });
    await createCustomer({ name: "Test Co", dataDir: "/crm" });
    const { fs: memFs } = await import("memfs");
    expect(memFs.existsSync("/crm/customers/test-co/interactions.md")).toBe(true);
    expect(memFs.existsSync("/crm/customers/test-co/pipeline.md")).toBe(true);
  });

  it("is idempotent", async () => {
    vol.fromJSON({ "/crm/customers/.keep": "" });
    const r1 = await createCustomer({ name: "Acme Corp", dataDir: "/crm" });
    const r2 = await createCustomer({ name: "Acme Corp", dataDir: "/crm" });
    expect(r1.id).toBe(r2.id);
  });

  it("sets gmail query from domain", async () => {
    vol.fromJSON({ "/crm/customers/.keep": "" });
    await createCustomer({ name: "Test Co", domain: "test.com", dataDir: "/crm" });
    const { fs: memFs } = await import("memfs");
    const sources = JSON.parse(
      memFs.readFileSync("/crm/customers/test-co/sources.json", "utf-8") as string
    );
    expect(sources.gmail.query).toContain("test.com");
  });

  it("sets gmail query from email when no domain", async () => {
    vol.fromJSON({ "/crm/customers/.keep": "" });
    await createCustomer({ name: "Test Co", email: "contact@example.com", dataDir: "/crm" });
    const { fs: memFs } = await import("memfs");
    const sources = JSON.parse(
      memFs.readFileSync("/crm/customers/test-co/sources.json", "utf-8") as string
    );
    expect(sources.gmail.query).toContain("contact@example.com");
  });

  it("creates sources.json", async () => {
    vol.fromJSON({ "/crm/customers/.keep": "" });
    await createCustomer({ name: "Acme Corp", dataDir: "/crm" });
    const { fs: memFs } = await import("memfs");
    expect(memFs.existsSync("/crm/customers/acme-corp/sources.json")).toBe(true);
  });

  it("returns dir path", async () => {
    vol.fromJSON({ "/crm/customers/.keep": "" });
    const r = await createCustomer({ name: "Acme Corp", dataDir: "/crm" });
    expect(r.dir).toContain("acme-corp");
  });

  it("main_facts.md has relationship_stage prospect", async () => {
    vol.fromJSON({ "/crm/customers/.keep": "" });
    await createCustomer({ name: "Acme Corp", dataDir: "/crm" });
    const { fs: memFs } = await import("memfs");
    const content = memFs.readFileSync("/crm/customers/acme-corp/main_facts.md", "utf-8") as string;
    expect(content).toContain("prospect");
  });
});

describe("createCommand", () => {
  it("logs success after creating a customer", async () => {
    vol.fromJSON({});
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { createCommand } = await import("../../src/commands/create.js");
    await createCommand.parseAsync(["node", "create", "Stripe"]);
    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("stripe");
    consoleSpy.mockRestore();
  });

  it("logs error and exits when createCustomer throws", async () => {
    vol.fromJSON({});
    vi.doMock("../../src/commands/create.js", async (importOriginal) => {
      const mod = await importOriginal<typeof import("../../src/commands/create.js")>();
      return {
        ...mod,
        createCustomer: vi.fn().mockRejectedValue(new Error("disk full")),
      };
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as () => never);
    const { createCommand } = await import("../../src/commands/create.js");
    await createCommand.parseAsync(["node", "create", "Fail Corp"]);
    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
