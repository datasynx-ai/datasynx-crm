import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vol } from "memfs";

// child_process mock — gdpr command may call rm -rf via fs, not execSync, so not needed here
// but keep consistent pattern

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
  delete process.env["DXCRM_ACTOR"];
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env["DXCRM_ACTOR"];
});

// ─── Helper: seed a customer in the virtual FS ───────────────────────────────

function seedCustomer(slug: string, dataDir = "/crm"): void {
  vol.fromJSON({
    [`${dataDir}/customers/${slug}/main_facts.md`]: `---\nname: Acme Corp\n---\n`,
    [`${dataDir}/customers/${slug}/interactions/2026-01-01.md`]: `# Notes`,
    [`${dataDir}/customers/${slug}/attachments/doc.pdf`]: `binary`,
  });
}

// ─── runGdprErase — dry run ───────────────────────────────────────────────────

describe("runGdprErase — dry run (no --confirm)", () => {
  it("prints what would be deleted without deleting anything", async () => {
    seedCustomer("acme-corp");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runGdprErase } = await import("../../src/commands/gdpr.js");

    await runGdprErase("acme-corp", {}, "/crm");

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/dry.?run|would be deleted|--confirm/i);
    logSpy.mockRestore();
  });

  it("does NOT delete the customer directory in dry-run mode", async () => {
    seedCustomer("acme-corp");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runGdprErase } = await import("../../src/commands/gdpr.js");

    await runGdprErase("acme-corp", {}, "/crm");

    // Directory should still exist
    const { fs } = await import("memfs");
    expect(fs.existsSync("/crm/customers/acme-corp")).toBe(true);
    logSpy.mockRestore();
  });

  it("does NOT write audit.log in dry-run mode", async () => {
    seedCustomer("acme-corp");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runGdprErase } = await import("../../src/commands/gdpr.js");

    await runGdprErase("acme-corp", {}, "/crm");

    const { fs } = await import("memfs");
    expect(fs.existsSync("/crm/.agentic/audit.log")).toBe(false);
    logSpy.mockRestore();
  });

  it("instructs user to add --confirm flag", async () => {
    seedCustomer("acme-corp");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runGdprErase } = await import("../../src/commands/gdpr.js");

    await runGdprErase("acme-corp", {}, "/crm");

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/--confirm/);
    logSpy.mockRestore();
  });
});

// ─── runGdprErase — confirmed deletion ───────────────────────────────────────

describe("runGdprErase — with --confirm", () => {
  it("deletes the customer directory", async () => {
    seedCustomer("acme-corp");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runGdprErase } = await import("../../src/commands/gdpr.js");

    await runGdprErase("acme-corp", { confirm: true }, "/crm");

    const { fs } = await import("memfs");
    expect(fs.existsSync("/crm/customers/acme-corp")).toBe(false);
    logSpy.mockRestore();
  });

  it("prints success message after erasure", async () => {
    seedCustomer("acme-corp");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runGdprErase } = await import("../../src/commands/gdpr.js");

    await runGdprErase("acme-corp", { confirm: true }, "/crm");

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/erased|deleted|acme-corp/i);
    logSpy.mockRestore();
  });

  it("appends to audit.log after erasure", async () => {
    seedCustomer("acme-corp");
    process.env["DXCRM_ACTOR"] = "alice";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runGdprErase } = await import("../../src/commands/gdpr.js");

    await runGdprErase("acme-corp", { confirm: true }, "/crm");

    const { fs } = await import("memfs");
    const auditContent = fs.readFileSync("/crm/.agentic/audit.log", "utf-8") as string;
    expect(auditContent).toContain("gdpr_erase");
    expect(auditContent).toContain("acme-corp");
    logSpy.mockRestore();
  });

  it("audit.log entry contains actor", async () => {
    seedCustomer("acme-corp");
    process.env["DXCRM_ACTOR"] = "bob";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runGdprErase } = await import("../../src/commands/gdpr.js");

    await runGdprErase("acme-corp", { confirm: true }, "/crm");

    const { fs } = await import("memfs");
    const auditContent = fs.readFileSync("/crm/.agentic/audit.log", "utf-8") as string;
    expect(auditContent).toContain("bob");
    logSpy.mockRestore();
  });

  it("audit.log entry falls back to 'system' when DXCRM_ACTOR is unset", async () => {
    seedCustomer("acme-corp");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runGdprErase } = await import("../../src/commands/gdpr.js");

    await runGdprErase("acme-corp", { confirm: true }, "/crm");

    const { fs } = await import("memfs");
    const auditContent = fs.readFileSync("/crm/.agentic/audit.log", "utf-8") as string;
    expect(auditContent).toContain("system");
    logSpy.mockRestore();
  });

  it("creates .agentic/gdpr-erasures.json with erasure record", async () => {
    seedCustomer("acme-corp");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runGdprErase } = await import("../../src/commands/gdpr.js");

    await runGdprErase("acme-corp", { confirm: true }, "/crm");

    const { fs } = await import("memfs");
    expect(fs.existsSync("/crm/.agentic/gdpr-erasures.json")).toBe(true);
    const raw = fs.readFileSync("/crm/.agentic/gdpr-erasures.json", "utf-8") as string;
    const records = JSON.parse(raw) as Array<{
      slug: string;
      erasedAt: string;
      erasedBy: string;
      reason: string;
    }>;
    expect(records).toHaveLength(1);
    expect(records[0]!.slug).toBe("acme-corp");
    expect(records[0]!.reason).toMatch(/GDPR|Art\.?\s*17/i);
    logSpy.mockRestore();
  });

  it("appends to existing gdpr-erasures.json on second erasure", async () => {
    seedCustomer("acme-corp");
    seedCustomer("beta-inc");

    // Pre-seed an existing erasures file
    vol.fromJSON({
      "/crm/.agentic/gdpr-erasures.json": JSON.stringify([
        {
          slug: "old-corp",
          erasedAt: "2026-01-01T00:00:00.000Z",
          erasedBy: "system",
          reason: "GDPR Art. 17 request",
        },
      ]),
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runGdprErase } = await import("../../src/commands/gdpr.js");

    await runGdprErase("acme-corp", { confirm: true }, "/crm");

    const { fs } = await import("memfs");
    const raw = fs.readFileSync("/crm/.agentic/gdpr-erasures.json", "utf-8") as string;
    const records = JSON.parse(raw) as Array<{ slug: string }>;
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.slug)).toContain("old-corp");
    expect(records.map((r) => r.slug)).toContain("acme-corp");
    logSpy.mockRestore();
  });

  it("prints message referencing audit.log", async () => {
    seedCustomer("acme-corp");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runGdprErase } = await import("../../src/commands/gdpr.js");

    await runGdprErase("acme-corp", { confirm: true }, "/crm");

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/audit\.log/i);
    logSpy.mockRestore();
  });

  it("handles missing customer directory gracefully (warns instead of throwing)", async () => {
    vol.fromJSON({ "/crm/.agentic/config.json": "{}" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { runGdprErase } = await import("../../src/commands/gdpr.js");

    // Should not throw
    await expect(runGdprErase("nonexistent", { confirm: true }, "/crm")).resolves.toBeUndefined();
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

// ─── runGdprListErasures ─────────────────────────────────────────────────────

describe("runGdprListErasures", () => {
  it("prints 'no erasures' when gdpr-erasures.json does not exist", async () => {
    vol.fromJSON({});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runGdprListErasures } = await import("../../src/commands/gdpr.js");

    await runGdprListErasures("/crm");

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/no erasures|empty/i);
    logSpy.mockRestore();
  });

  it("lists erasures from gdpr-erasures.json", async () => {
    vol.fromJSON({
      "/crm/.agentic/gdpr-erasures.json": JSON.stringify([
        {
          slug: "acme-corp",
          erasedAt: "2026-05-01T10:00:00.000Z",
          erasedBy: "alice",
          reason: "GDPR Art. 17 request",
        },
        {
          slug: "beta-inc",
          erasedAt: "2026-05-15T12:00:00.000Z",
          erasedBy: "bob",
          reason: "GDPR Art. 17 request",
        },
      ]),
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runGdprListErasures } = await import("../../src/commands/gdpr.js");

    await runGdprListErasures("/crm");

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("acme-corp");
    expect(output).toContain("beta-inc");
    expect(output).toContain("alice");
    logSpy.mockRestore();
  });

  it("shows count of erasures", async () => {
    vol.fromJSON({
      "/crm/.agentic/gdpr-erasures.json": JSON.stringify([
        {
          slug: "acme-corp",
          erasedAt: "2026-05-01T10:00:00.000Z",
          erasedBy: "alice",
          reason: "GDPR Art. 17 request",
        },
      ]),
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runGdprListErasures } = await import("../../src/commands/gdpr.js");

    await runGdprListErasures("/crm");

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toMatch(/1/);
    logSpy.mockRestore();
  });
});

// ─── gdprCommand — Commander integration ─────────────────────────────────────

describe("gdprCommand — Commander integration", () => {
  it("exports gdprCommand as Commander Command with name 'gdpr'", async () => {
    const { gdprCommand } = await import("../../src/commands/gdpr.js");
    expect(gdprCommand).toBeDefined();
    expect(gdprCommand.name()).toBe("gdpr");
  });

  it("has an 'erase' subcommand", async () => {
    const { gdprCommand } = await import("../../src/commands/gdpr.js");
    const subNames = gdprCommand.commands.map((c) => c.name());
    expect(subNames).toContain("erase");
  });

  it("has a 'list-erasures' subcommand", async () => {
    const { gdprCommand } = await import("../../src/commands/gdpr.js");
    const subNames = gdprCommand.commands.map((c) => c.name());
    expect(subNames).toContain("list-erasures");
  });

  it("erase subcommand has --confirm option", async () => {
    const { gdprCommand } = await import("../../src/commands/gdpr.js");
    const eraseCmd = gdprCommand.commands.find((c) => c.name() === "erase");
    expect(eraseCmd).toBeDefined();
    const optNames = eraseCmd!.options.map((o) => o.long);
    expect(optNames).toContain("--confirm");
  });
});

// ─── LanceDB cleanup on erasure ───────────────────────────────────────────────

describe("runGdprErase — LanceDB cleanup", () => {
  it("calls dropCustomerTable with correct dataDir and slug", async () => {
    const dropMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../../src/core/lancedb.js", () => ({ dropCustomerTable: dropMock }));

    seedCustomer("acme-corp");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runGdprErase } = await import("../../src/commands/gdpr.js");

    await runGdprErase("acme-corp", { confirm: true }, "/crm");

    expect(dropMock).toHaveBeenCalledWith("/crm", "acme-corp");
    logSpy.mockRestore();
  });
});

// ─── runGdprErase — .agentic/ cleanup (G5) ───────────────────────────────────

describe("runGdprErase — .agentic/ cleanup", () => {
  it("removes tasks for erased slug from global agent queue", async () => {
    const DATA_DIR = "/crm";
    seedCustomer("acme", DATA_DIR);
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/agent-queue.json`]: JSON.stringify([
        { id: "t1", slug: "acme", type: "relationship_decay_alert", status: "pending" },
        { id: "t2", slug: "other-corp", type: "daily_briefing", status: "pending" },
      ]),
      [`${DATA_DIR}/.agentic/audit.log`]: "",
      [`${DATA_DIR}/.agentic/gdpr-erasures.json`]: "[]",
      ...vol.toJSON(),
    });

    const { runGdprErase } = await import("../../src/commands/gdpr.js");
    await runGdprErase("acme", { confirm: true }, DATA_DIR);

    const fs = (await import("fs")).default;
    const queue = JSON.parse(
      fs.readFileSync(`${DATA_DIR}/.agentic/agent-queue.json`, "utf-8") as string
    ) as Array<{ slug: string }>;
    expect(queue.every((t) => t.slug !== "acme")).toBe(true);
    expect(queue.some((t) => t.slug === "other-corp")).toBe(true);
  });

  it("keeps tasks for other slugs after erasure", async () => {
    const DATA_DIR = "/crm";
    seedCustomer("acme", DATA_DIR);
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/agent-queue.json`]: JSON.stringify([
        { id: "t1", slug: "acme", type: "deal_risk_alert", status: "pending" },
        { id: "t2", slug: "beta", type: "daily_briefing", status: "done" },
        { id: "t3", type: "daily_briefing", status: "pending" }, // no slug
      ]),
      [`${DATA_DIR}/.agentic/audit.log`]: "",
      [`${DATA_DIR}/.agentic/gdpr-erasures.json`]: "[]",
      ...vol.toJSON(),
    });

    const { runGdprErase } = await import("../../src/commands/gdpr.js");
    await runGdprErase("acme", { confirm: true }, DATA_DIR);

    const fs = (await import("fs")).default;
    const queue = JSON.parse(
      fs.readFileSync(`${DATA_DIR}/.agentic/agent-queue.json`, "utf-8") as string
    ) as unknown[];
    expect(queue).toHaveLength(2); // beta + no-slug task remain
  });

  it("removes push subscriptions for erased slug", async () => {
    const DATA_DIR = "/crm";
    seedCustomer("acme", DATA_DIR);
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/push-subscriptions.json`]: JSON.stringify({
        subscriptions: [
          {
            id: "sub1",
            slug: "acme",
            provider: "gmail",
            status: "active",
            topic: "t",
            expiration: "2027-01-01",
            createdAt: "2026-01-01",
          },
          {
            id: "sub2",
            slug: "beta",
            provider: "gmail",
            status: "active",
            topic: "t",
            expiration: "2027-01-01",
            createdAt: "2026-01-01",
          },
        ],
        updatedAt: "2026-01-01",
      }),
      [`${DATA_DIR}/.agentic/audit.log`]: "",
      [`${DATA_DIR}/.agentic/gdpr-erasures.json`]: "[]",
      ...vol.toJSON(),
    });

    const { runGdprErase } = await import("../../src/commands/gdpr.js");
    await runGdprErase("acme", { confirm: true }, DATA_DIR);

    const fs = (await import("fs")).default;
    const file = JSON.parse(
      fs.readFileSync(`${DATA_DIR}/.agentic/push-subscriptions.json`, "utf-8") as string
    ) as { subscriptions: Array<{ slug: string }> };
    const subs = file.subscriptions;
    expect(subs.every((s) => s.slug !== "acme")).toBe(true);
    expect(subs).toHaveLength(1);
  });

  it("removes sub-goals referencing erased slug from goals.json", async () => {
    const DATA_DIR = "/crm";
    seedCustomer("acme", DATA_DIR);
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/goals.json`]: JSON.stringify([
        {
          id: "g1",
          description: "Close €500k",
          type: "revenue",
          metric: "revenue",
          target: 500000,
          progress: 20,
          status: "active",
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
          decomposition: {
            subGoals: [
              {
                slug: "acme",
                description: "Close Acme deal",
                weight: 0.6,
                targetContribution: 300000,
              },
              {
                slug: "beta",
                description: "Close Beta deal",
                weight: 0.4,
                targetContribution: 200000,
              },
            ],
            priorityOrder: [],
            reasoning: "",
          },
        },
      ]),
      [`${DATA_DIR}/.agentic/audit.log`]: "",
      [`${DATA_DIR}/.agentic/gdpr-erasures.json`]: "[]",
      ...vol.toJSON(),
    });

    const { runGdprErase } = await import("../../src/commands/gdpr.js");
    await runGdprErase("acme", { confirm: true }, DATA_DIR);

    const fs = (await import("fs")).default;
    const file = JSON.parse(
      fs.readFileSync(`${DATA_DIR}/.agentic/goals.json`, "utf-8") as string
    ) as { goals: Array<{ decomposition: { subGoals: Array<{ slug: string }> } }> };
    const goals = file.goals;
    expect(goals[0]!.decomposition.subGoals.every((sg) => sg.slug !== "acme")).toBe(true);
    expect(goals[0]!.decomposition.subGoals).toHaveLength(1);
  });

  it("does not throw when agent-queue.json does not exist", async () => {
    const DATA_DIR = "/crm";
    seedCustomer("acme", DATA_DIR);
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/audit.log`]: "",
      [`${DATA_DIR}/.agentic/gdpr-erasures.json`]: "[]",
      ...vol.toJSON(),
    });

    const { runGdprErase } = await import("../../src/commands/gdpr.js");
    await expect(runGdprErase("acme", { confirm: true }, DATA_DIR)).resolves.toBeUndefined();
  });
});
