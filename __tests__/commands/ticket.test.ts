import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Ticket } from "../../src/schemas/ticket.js";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockListAllTickets = vi.hoisted(() => vi.fn());
const mockReadTickets = vi.hoisted(() => vi.fn());
const mockNextTicketId = vi.hoisted(() => vi.fn());
const mockUpsertTicket = vi.hoisted(() => vi.fn());
const mockCalcSlaDue = vi.hoisted(() => vi.fn());
const mockLoadSlaRules = vi.hoisted(() => vi.fn());

vi.mock("../../src/fs/ticket-writer.js", () => ({
  listAllTickets: mockListAllTickets,
  readTickets: mockReadTickets,
  nextTicketId: mockNextTicketId,
  upsertTicket: mockUpsertTicket,
}));

vi.mock("../../src/core/sla-engine.js", () => ({
  calcSlaDue: mockCalcSlaDue,
  loadSlaRules: mockLoadSlaRules,
}));

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: "T-1",
    title: "Login broken",
    status: "open",
    priority: "normal",
    created: "2026-05-01",
    slaDue: "2026-05-05",
    ...overrides,
  };
}

const DATA_DIR = "/data";

describe("ticketCommand list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
    mockLoadSlaRules.mockReturnValue([]);
    mockCalcSlaDue.mockReturnValue("2026-06-10");
    mockUpsertTicket.mockResolvedValue(undefined);
  });

  it("prints all tickets", async () => {
    mockListAllTickets.mockResolvedValue([{ slug: "acme", ticket: makeTicket() }]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { ticketCommand } = await import("../../src/commands/ticket.js");
    await ticketCommand.copyInheritedSettings(ticketCommand).parseAsync(["node", "ticket", "list"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("T-1"));
    consoleSpy.mockRestore();
  });

  it("shows 'No tickets found' when list is empty", async () => {
    mockListAllTickets.mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { ticketCommand } = await import("../../src/commands/ticket.js");
    await ticketCommand.parseAsync(["node", "ticket", "list"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No tickets"));
    consoleSpy.mockRestore();
  });
});

describe("ticketCommand create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
    mockLoadSlaRules.mockReturnValue([]);
    mockCalcSlaDue.mockReturnValue("2026-06-10");
    mockReadTickets.mockResolvedValue([]);
    mockNextTicketId.mockReturnValue("T-1");
    mockUpsertTicket.mockResolvedValue(undefined);
  });

  it("creates a ticket and prints its ID", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { ticketCommand } = await import("../../src/commands/ticket.js");
    await ticketCommand.parseAsync(["node", "ticket", "create", "acme", "--title", "Bug report"]);

    expect(mockUpsertTicket).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("T-1"));
    consoleSpy.mockRestore();
  });

  it("creates a ticket with assignee and description", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { ticketCommand } = await import("../../src/commands/ticket.js");
    await ticketCommand.parseAsync([
      "node",
      "ticket",
      "create",
      "acme",
      "--title",
      "Auth bug",
      "--assignee",
      "bob",
      "--description",
      "Users cannot log in",
    ]);

    expect(mockUpsertTicket).toHaveBeenCalledWith(
      DATA_DIR,
      "acme",
      expect.objectContaining({ assignee: "bob", description: "Users cannot log in" })
    );
    consoleSpy.mockRestore();
  });
});

describe("ticketCommand update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
    mockUpsertTicket.mockResolvedValue(undefined);
  });

  it("updates ticket status", async () => {
    const ticket = makeTicket();
    mockReadTickets.mockResolvedValue([ticket]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { ticketCommand } = await import("../../src/commands/ticket.js");
    await ticketCommand.parseAsync([
      "node",
      "ticket",
      "update",
      "T-1",
      "--slug",
      "acme",
      "--status",
      "resolved",
    ]);

    expect(mockUpsertTicket).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("updated"));
    consoleSpy.mockRestore();
  });

  it("sets resolved date when status is updated to resolved", async () => {
    const ticket = makeTicket({ resolved: undefined });
    mockReadTickets.mockResolvedValue([ticket]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { ticketCommand } = await import("../../src/commands/ticket.js");
    await ticketCommand.parseAsync([
      "node",
      "ticket",
      "update",
      "T-1",
      "--slug",
      "acme",
      "--status",
      "resolved",
    ]);

    expect(mockUpsertTicket).toHaveBeenCalledWith(
      DATA_DIR,
      "acme",
      expect.objectContaining({ status: "resolved", resolved: expect.any(String) })
    );
    consoleSpy.mockRestore();
  });

  it("updates ticket assignee", async () => {
    const ticket = makeTicket();
    mockReadTickets.mockResolvedValue([ticket]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { ticketCommand } = await import("../../src/commands/ticket.js");
    await ticketCommand.parseAsync([
      "node",
      "ticket",
      "update",
      "T-1",
      "--slug",
      "acme",
      "--assignee",
      "carol",
    ]);

    expect(mockUpsertTicket).toHaveBeenCalledWith(
      DATA_DIR,
      "acme",
      expect.objectContaining({ assignee: "carol" })
    );
    consoleSpy.mockRestore();
  });

  it("exits with error when ticket not found", async () => {
    mockReadTickets.mockResolvedValue([]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as () => never);

    const { ticketCommand } = await import("../../src/commands/ticket.js");
    await expect(
      ticketCommand.parseAsync([
        "node",
        "ticket",
        "update",
        "T-99",
        "--slug",
        "acme",
        "--status",
        "resolved",
      ])
    ).rejects.toThrow("process.exit");

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("not found"));
    expect(exitSpy).toHaveBeenCalledWith(1);
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

describe("ticketCommand list — SLA breach false branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
    mockLoadSlaRules.mockReturnValue([]);
    mockCalcSlaDue.mockReturnValue("2026-06-10");
    mockUpsertTicket.mockResolvedValue(undefined);
  });

  it("shows no SLA flag when ticket has future slaDue", async () => {
    mockListAllTickets.mockResolvedValue([
      { slug: "acme", ticket: makeTicket({ slaDue: "2027-12-31", status: "open" }) },
    ]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { ticketCommand } = await import("../../src/commands/ticket.js");
    await ticketCommand.parseAsync(["node", "ticket", "list"]);

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).not.toContain("⚠ SLA");
    consoleSpy.mockRestore();
  });

  it("shows no SLA flag when ticket is resolved", async () => {
    mockListAllTickets.mockResolvedValue([
      { slug: "acme", ticket: makeTicket({ slaDue: "2026-05-05", status: "resolved" }) },
    ]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { ticketCommand } = await import("../../src/commands/ticket.js");
    await ticketCommand.parseAsync(["node", "ticket", "list"]);

    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).not.toContain("⚠ SLA");
    consoleSpy.mockRestore();
  });
});

describe("ticketCommand list — branch coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
    mockLoadSlaRules.mockReturnValue([]);
    mockCalcSlaDue.mockReturnValue("2026-06-10");
    mockUpsertTicket.mockResolvedValue(undefined);
  });

  it("shows assignee in output when ticket has one", async () => {
    mockListAllTickets.mockResolvedValue([
      { slug: "acme", ticket: makeTicket({ assignee: "alice" }) },
    ]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { ticketCommand } = await import("../../src/commands/ticket.js");
    await ticketCommand.parseAsync(["node", "ticket", "list"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("@alice"));
    consoleSpy.mockRestore();
  });

  it("passes all filter options to listAllTickets", async () => {
    mockListAllTickets.mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { ticketCommand } = await import("../../src/commands/ticket.js");
    await ticketCommand.parseAsync([
      "node",
      "ticket",
      "list",
      "--slug",
      "acme",
      "--status",
      "open",
      "--priority",
      "high",
    ]);

    expect(mockListAllTickets).toHaveBeenCalledWith(
      DATA_DIR,
      expect.objectContaining({ slug: "acme", status: "open", priority: "high" })
    );
    consoleSpy.mockRestore();
  });
});

describe("ticketCommand — process.cwd() fallbacks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["DXCRM_DATA_DIR"];
    mockLoadSlaRules.mockReturnValue([]);
    mockCalcSlaDue.mockReturnValue("2026-06-10");
    mockListAllTickets.mockResolvedValue([]);
    mockReadTickets.mockResolvedValue([makeTicket()]);
    mockNextTicketId.mockReturnValue("T-2");
    mockUpsertTicket.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("update uses process.cwd() when env not set", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { ticketCommand } = await import("../../src/commands/ticket.js");
    await ticketCommand.parseAsync([
      "node",
      "ticket",
      "update",
      "T-1",
      "--slug",
      "acme",
      "--status",
      "open",
    ]);
    consoleSpy.mockRestore();
  });

  it("close uses process.cwd() when env not set", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { ticketCommand } = await import("../../src/commands/ticket.js");
    await ticketCommand.parseAsync(["node", "ticket", "close", "T-1", "--slug", "acme"]);
    consoleSpy.mockRestore();
  });
});

describe("ticketCommand close — resolved fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
    mockUpsertTicket.mockResolvedValue(undefined);
  });

  it("uses existing resolved date when ticket already has one", async () => {
    const ticket = makeTicket({ resolved: "2026-05-20" });
    mockReadTickets.mockResolvedValue([ticket]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { ticketCommand } = await import("../../src/commands/ticket.js");
    await ticketCommand.parseAsync(["node", "ticket", "close", "T-1", "--slug", "acme"]);

    expect(mockUpsertTicket).toHaveBeenCalledWith(
      DATA_DIR,
      "acme",
      expect.objectContaining({ resolved: "2026-05-20" })
    );
    consoleSpy.mockRestore();
  });
});

describe("ticketCommand close", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
    mockUpsertTicket.mockResolvedValue(undefined);
  });

  it("closes ticket", async () => {
    const ticket = makeTicket();
    mockReadTickets.mockResolvedValue([ticket]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { ticketCommand } = await import("../../src/commands/ticket.js");
    await ticketCommand.parseAsync(["node", "ticket", "close", "T-1", "--slug", "acme"]);

    expect(mockUpsertTicket).toHaveBeenCalledWith(
      DATA_DIR,
      "acme",
      expect.objectContaining({ status: "closed" })
    );
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("closed"));
    consoleSpy.mockRestore();
  });

  it("exits with error when ticket not found for close", async () => {
    mockReadTickets.mockResolvedValue([]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as () => never);

    const { ticketCommand } = await import("../../src/commands/ticket.js");
    await expect(
      ticketCommand.parseAsync(["node", "ticket", "close", "T-99", "--slug", "acme"])
    ).rejects.toThrow("process.exit");

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("not found"));
    expect(exitSpy).toHaveBeenCalledWith(1);
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
