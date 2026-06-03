import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vol.reset();
});

const DATA_DIR = "/data";
const SLUG = "acme-corp";

function makeTicketsMd(): string {
  return `# Tickets

| ID | Title | Status | Priority | Assignee | Created | SLA Due | Resolved |
|----|-------|--------|----------|----------|---------|---------|---------|
| T-001 | Login broken | open | urgent | alice | 2026-05-01 |  |  |
| T-002 | Slow reports | in-progress | normal | bob | 2026-05-02 |  |  |
`;
}

function parseResult(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

describe("handleListTickets", () => {
  it("returns empty list when no customers have tickets", async () => {
    vol.fromJSON({});
    const { handleListTickets } = await import("../../../src/mcp/tools/list-tickets.js");
    const result = await handleListTickets({}, DATA_DIR);
    const parsed = parseResult(result);
    expect(Array.isArray(parsed["tickets"])).toBe(true);
    expect((parsed["tickets"] as unknown[]).length).toBe(0);
  });

  it("returns tickets for all customers when no filter", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/tickets.md`]: makeTicketsMd(),
    });
    const { handleListTickets } = await import("../../../src/mcp/tools/list-tickets.js");
    const result = await handleListTickets({}, DATA_DIR);
    const parsed = parseResult(result);
    expect((parsed["tickets"] as unknown[]).length).toBe(2);
  });

  it("filters by slug", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/tickets.md`]: makeTicketsMd(),
      [`${DATA_DIR}/customers/other-co/tickets.md`]: makeTicketsMd(),
    });
    const { handleListTickets } = await import("../../../src/mcp/tools/list-tickets.js");
    const result = await handleListTickets({ slug: SLUG }, DATA_DIR);
    const parsed = parseResult(result);
    const tickets = parsed["tickets"] as Array<{ slug: string }>;
    expect(tickets.every((t) => t.slug === SLUG)).toBe(true);
  });

  it("filters by status", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/tickets.md`]: makeTicketsMd(),
    });
    const { handleListTickets } = await import("../../../src/mcp/tools/list-tickets.js");
    const result = await handleListTickets({ status: "open" }, DATA_DIR);
    const parsed = parseResult(result);
    const tickets = parsed["tickets"] as Array<{ ticket: { status: string } }>;
    expect(tickets.every((t) => t.ticket.status === "open")).toBe(true);
  });

  it("filters by priority", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/tickets.md`]: makeTicketsMd(),
    });
    const { handleListTickets } = await import("../../../src/mcp/tools/list-tickets.js");
    const result = await handleListTickets({ priority: "urgent" }, DATA_DIR);
    const parsed = parseResult(result);
    const tickets = parsed["tickets"] as Array<{ ticket: { priority: string } }>;
    expect(tickets.length).toBe(1);
    expect(tickets[0]!.ticket.priority).toBe("urgent");
  });

  it("registers tool with correct name", async () => {
    const { registerListTickets } = await import("../../../src/mcp/tools/list-tickets.js");
    const calls: string[] = [];
    const fakeServer = { registerTool: (name: string) => calls.push(name) };
    registerListTickets(fakeServer as never, DATA_DIR);
    expect(calls).toContain("list_tickets");
  });

  it("registered handler invokes handleListTickets with all optional filters", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/${SLUG}/tickets.md`]: makeTicketsMd(),
    });
    const { registerListTickets } = await import("../../../src/mcp/tools/list-tickets.js");
    type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    let capturedHandler: Handler | undefined;
    const fakeServer = {
      registerTool: (_name: string, _schema: unknown, handler: Handler) => {
        capturedHandler = handler;
      },
    };
    registerListTickets(fakeServer as never, DATA_DIR);
    const result = await capturedHandler!({
      slug: SLUG,
      status: "open",
      priority: "urgent",
      assignee: "alice",
    });
    const parsed = JSON.parse(result.content[0]!.text) as { tickets: unknown[] };
    expect(Array.isArray(parsed.tickets)).toBe(true);
  });
});
