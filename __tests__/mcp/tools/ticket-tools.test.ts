import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

const mockReadTickets = vi.hoisted(() => vi.fn());
const mockUpsertTicket = vi.hoisted(() => vi.fn());
const mockAppendInteraction = vi.hoisted(() => vi.fn());
const mockListAllTickets = vi.hoisted(() => vi.fn());

vi.mock("../../../src/fs/ticket-writer.js", () => ({
  readTickets: mockReadTickets,
  upsertTicket: mockUpsertTicket,
  listAllTickets: mockListAllTickets,
}));

vi.mock("../../../src/fs/interactions-writer.js", () => ({
  appendInteraction: mockAppendInteraction,
}));

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

const DATA_DIR = "/data";

function makeTicket(id = "T-001", overrides = {}) {
  return {
    id,
    title: "Test ticket",
    status: "open" as const,
    priority: "normal" as const,
    created: "2026-05-30",
    ...overrides,
  };
}

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
  mockUpsertTicket.mockResolvedValue(undefined);
  mockAppendInteraction.mockResolvedValue(undefined);
});

// ─── close_ticket ──────────────────────────────────────────────────────────────

describe("handleCloseTicket", () => {
  it("returns error when ticket not found", async () => {
    mockReadTickets.mockResolvedValue([]);
    const { handleCloseTicket } = await import("../../../src/mcp/tools/close-ticket.js");
    const result = await handleCloseTicket({ slug: "acme", ticketId: "T-999" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { error: string };
    expect(parsed.error).toContain("T-999");
  });

  it("sets status to closed", async () => {
    mockReadTickets.mockResolvedValue([makeTicket("T-001")]);
    const { handleCloseTicket } = await import("../../../src/mcp/tools/close-ticket.js");
    const result = await handleCloseTicket({ slug: "acme", ticketId: "T-001" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { ticket: { status: string } };
    expect(parsed.ticket.status).toBe("closed");
  });

  it("sets resolved date when not already set", async () => {
    mockReadTickets.mockResolvedValue([makeTicket("T-001")]);
    const { handleCloseTicket } = await import("../../../src/mcp/tools/close-ticket.js");
    const result = await handleCloseTicket({ slug: "acme", ticketId: "T-001" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { ticket: { resolved: string } };
    expect(parsed.ticket.resolved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("preserves existing resolved date", async () => {
    mockReadTickets.mockResolvedValue([makeTicket("T-001", { resolved: "2026-05-28" })]);
    const { handleCloseTicket } = await import("../../../src/mcp/tools/close-ticket.js");
    const result = await handleCloseTicket({ slug: "acme", ticketId: "T-001" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { ticket: { resolved: string } };
    expect(parsed.ticket.resolved).toBe("2026-05-28");
  });

  it("logs resolution as interaction when provided", async () => {
    mockReadTickets.mockResolvedValue([makeTicket("T-001")]);
    const { handleCloseTicket } = await import("../../../src/mcp/tools/close-ticket.js");
    await handleCloseTicket({ slug: "acme", ticketId: "T-001", resolution: "Issue fixed in v2.1" }, DATA_DIR);
    expect(mockAppendInteraction).toHaveBeenCalledOnce();
    const call = mockAppendInteraction.mock.calls[0];
    expect((call[2] as { summary: string }).summary).toContain("Issue fixed in v2.1");
  });

  it("does not log interaction when no resolution provided", async () => {
    mockReadTickets.mockResolvedValue([makeTicket("T-001")]);
    const { handleCloseTicket } = await import("../../../src/mcp/tools/close-ticket.js");
    await handleCloseTicket({ slug: "acme", ticketId: "T-001" }, DATA_DIR);
    expect(mockAppendInteraction).not.toHaveBeenCalled();
  });
});

// ─── update_ticket ─────────────────────────────────────────────────────────────

describe("handleUpdateTicket", () => {
  it("returns error when ticket not found", async () => {
    mockReadTickets.mockResolvedValue([]);
    const { handleUpdateTicket } = await import("../../../src/mcp/tools/update-ticket.js");
    const result = await handleUpdateTicket({ slug: "acme", ticketId: "T-999" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { error: string };
    expect(parsed.error).toContain("T-999");
  });

  it("updates status", async () => {
    mockReadTickets.mockResolvedValue([makeTicket("T-001")]);
    const { handleUpdateTicket } = await import("../../../src/mcp/tools/update-ticket.js");
    const result = await handleUpdateTicket({ slug: "acme", ticketId: "T-001", status: "in-progress" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { ticket: { status: string } };
    expect(parsed.ticket.status).toBe("in-progress");
  });

  it("auto-sets resolved date when status=resolved", async () => {
    mockReadTickets.mockResolvedValue([makeTicket("T-001")]);
    const { handleUpdateTicket } = await import("../../../src/mcp/tools/update-ticket.js");
    const result = await handleUpdateTicket({ slug: "acme", ticketId: "T-001", status: "resolved" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { ticket: { resolved: string } };
    expect(parsed.ticket.resolved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("updates assignee", async () => {
    mockReadTickets.mockResolvedValue([makeTicket("T-001")]);
    const { handleUpdateTicket } = await import("../../../src/mcp/tools/update-ticket.js");
    const result = await handleUpdateTicket({ slug: "acme", ticketId: "T-001", assignee: "bob" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { ticket: { assignee: string } };
    expect(parsed.ticket.assignee).toBe("bob");
  });

  it("calls upsertTicket with updated ticket", async () => {
    mockReadTickets.mockResolvedValue([makeTicket("T-001")]);
    const { handleUpdateTicket } = await import("../../../src/mcp/tools/update-ticket.js");
    await handleUpdateTicket({ slug: "acme", ticketId: "T-001", status: "waiting" }, DATA_DIR);
    expect(mockUpsertTicket).toHaveBeenCalledOnce();
  });
});

// ─── list_tickets ──────────────────────────────────────────────────────────────

describe("handleListTickets", () => {
  it("returns all tickets when no filters", async () => {
    mockListAllTickets.mockResolvedValue([
      { slug: "acme", ticket: makeTicket("T-001") },
      { slug: "beta", ticket: makeTicket("T-002") },
    ]);
    const { handleListTickets } = await import("../../../src/mcp/tools/list-tickets.js");
    const result = await handleListTickets({}, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { tickets: unknown[] };
    expect(parsed.tickets.length).toBe(2);
  });

  it("passes filter options to listAllTickets", async () => {
    mockListAllTickets.mockResolvedValue([]);
    const { handleListTickets } = await import("../../../src/mcp/tools/list-tickets.js");
    await handleListTickets({ slug: "acme", status: "open", priority: "urgent" }, DATA_DIR);
    expect(mockListAllTickets).toHaveBeenCalledWith(DATA_DIR, expect.objectContaining({
      slug: "acme", status: "open", priority: "urgent",
    }));
  });
});
