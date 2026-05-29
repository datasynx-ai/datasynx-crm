import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => { const { fs } = await import("memfs"); return { default: fs, ...fs }; });
vi.mock("@lancedb/lancedb", () => ({ connect: vi.fn().mockResolvedValue({ tableNames: vi.fn().mockResolvedValue([]) }) }));

const DATA_DIR = "/data";

describe("handleCreateTicket", () => {
  beforeEach(() => { vol.reset(); vi.resetModules(); });

  it("creates a ticket with auto-SLA", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/.keep`]: "" });
    const { handleCreateTicket } = await import("../../../src/mcp/tools/create-ticket.js");
    const res = await handleCreateTicket({ slug: "acme", title: "API down", priority: "urgent" }, DATA_DIR);
    const parsed = JSON.parse(res.content[0]!.text) as { ticket: { id: string; slaDue: string; status: string } };
    expect(parsed.ticket.id).toMatch(/^T-\d{3}$/);
    expect(parsed.ticket.status).toBe("open");
    expect(parsed.ticket.slaDue).toBeDefined();
  });

  it("urgent ticket SLA is 1 day", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/.keep`]: "" });
    const { handleCreateTicket } = await import("../../../src/mcp/tools/create-ticket.js");
    const res = await handleCreateTicket({ slug: "acme", title: "URGENT", priority: "urgent" }, DATA_DIR);
    const parsed = JSON.parse(res.content[0]!.text) as { ticket: { created: string; slaDue: string } };
    const created = new Date(parsed.ticket.created);
    const slaDue = new Date(parsed.ticket.slaDue);
    const diff = Math.round((slaDue.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    expect(diff).toBe(1);
  });

  it("persists ticket to tickets.md", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/.keep`]: "" });
    const { handleCreateTicket } = await import("../../../src/mcp/tools/create-ticket.js");
    await handleCreateTicket({ slug: "acme", title: "Test ticket" }, DATA_DIR);
    const ticketsFile = vol.toJSON()[`${DATA_DIR}/customers/acme/tickets.md`];
    expect(ticketsFile).toBeDefined();
    expect(ticketsFile).toContain("Test ticket");
  });

  it("sets assignee if provided", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/.keep`]: "" });
    const { handleCreateTicket } = await import("../../../src/mcp/tools/create-ticket.js");
    const res = await handleCreateTicket({ slug: "acme", title: "Issue", assignee: "alice" }, DATA_DIR);
    const parsed = JSON.parse(res.content[0]!.text) as { ticket: { assignee: string } };
    expect(parsed.ticket.assignee).toBe("alice");
  });
});
