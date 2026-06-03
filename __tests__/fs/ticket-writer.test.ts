import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});
vi.mock("@lancedb/lancedb", () => ({
  connect: vi.fn().mockResolvedValue({ tableNames: vi.fn().mockResolvedValue([]) }),
}));

const DATA_DIR = "/data";

describe("nextTicketId", () => {
  it("returns T-001 when no tickets exist", async () => {
    const { nextTicketId } = await import("../../src/fs/ticket-writer.js");
    expect(nextTicketId([])).toBe("T-001");
  });

  it("increments from the highest existing ID", async () => {
    const { nextTicketId } = await import("../../src/fs/ticket-writer.js");
    const tickets = [
      {
        id: "T-001",
        title: "A",
        status: "open" as const,
        priority: "normal" as const,
        created: "2026-05-29",
      },
      {
        id: "T-003",
        title: "B",
        status: "open" as const,
        priority: "normal" as const,
        created: "2026-05-29",
      },
    ];
    expect(nextTicketId(tickets)).toBe("T-004");
  });
});

describe("readTickets / upsertTicket", () => {
  beforeEach(() => {
    vol.reset();
    vi.resetModules();
  });

  it("returns empty array for missing file", async () => {
    vol.fromJSON({});
    const { readTickets } = await import("../../src/fs/ticket-writer.js");
    expect(await readTickets(DATA_DIR, "acme")).toEqual([]);
  });

  it("upserts and reads back a ticket", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/.keep`]: "" });
    const { upsertTicket, readTickets } = await import("../../src/fs/ticket-writer.js");
    await upsertTicket(DATA_DIR, "acme", {
      id: "T-001",
      title: "API timeout",
      status: "open",
      priority: "high",
      created: "2026-05-29",
      slaDue: "2026-05-31",
    });
    const tickets = await readTickets(DATA_DIR, "acme");
    expect(tickets).toHaveLength(1);
    expect(tickets[0]!.id).toBe("T-001");
    expect(tickets[0]!.priority).toBe("high");
  });

  it("upsert updates existing ticket by id", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/.keep`]: "" });
    const { upsertTicket, readTickets } = await import("../../src/fs/ticket-writer.js");
    await upsertTicket(DATA_DIR, "acme", {
      id: "T-001",
      title: "Old title",
      status: "open",
      priority: "normal",
      created: "2026-05-29",
    });
    await upsertTicket(DATA_DIR, "acme", {
      id: "T-001",
      title: "Old title",
      status: "resolved",
      priority: "normal",
      created: "2026-05-29",
      resolved: "2026-05-30",
    });
    const tickets = await readTickets(DATA_DIR, "acme");
    expect(tickets).toHaveLength(1);
    expect(tickets[0]!.status).toBe("resolved");
  });
});

describe("listAllTickets", () => {
  beforeEach(() => {
    vol.reset();
    vi.resetModules();
  });

  it("returns tickets across multiple customers sorted by priority", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/.keep`]: "",
      [`${DATA_DIR}/customers/beta/.keep`]: "",
    });
    const { upsertTicket, listAllTickets } = await import("../../src/fs/ticket-writer.js");
    await upsertTicket(DATA_DIR, "acme", {
      id: "T-001",
      title: "Low prio",
      status: "open",
      priority: "low",
      created: "2026-05-29",
    });
    await upsertTicket(DATA_DIR, "beta", {
      id: "T-001",
      title: "Urgent",
      status: "open",
      priority: "urgent",
      created: "2026-05-29",
    });
    const all = await listAllTickets(DATA_DIR);
    expect(all[0]!.ticket.priority).toBe("urgent");
    expect(all[1]!.ticket.priority).toBe("low");
  });

  it("sorts by created date when priorities are equal", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/.keep`]: "" });
    const { upsertTicket, listAllTickets } = await import("../../src/fs/ticket-writer.js");
    await upsertTicket(DATA_DIR, "acme", {
      id: "T-001",
      title: "Earlier",
      status: "open",
      priority: "normal",
      created: "2026-05-01",
    });
    await upsertTicket(DATA_DIR, "acme", {
      id: "T-002",
      title: "Later",
      status: "open",
      priority: "normal",
      created: "2026-05-15",
    });
    const all = await listAllTickets(DATA_DIR);
    expect(all[0]!.ticket.id).toBe("T-001");
    expect(all[1]!.ticket.id).toBe("T-002");
  });

  it("filters by status", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/.keep`]: "" });
    const { upsertTicket, listAllTickets } = await import("../../src/fs/ticket-writer.js");
    await upsertTicket(DATA_DIR, "acme", {
      id: "T-001",
      title: "Open",
      status: "open",
      priority: "normal",
      created: "2026-05-29",
    });
    await upsertTicket(DATA_DIR, "acme", {
      id: "T-002",
      title: "Closed",
      status: "closed",
      priority: "normal",
      created: "2026-05-29",
      resolved: "2026-05-30",
    });
    const open = await listAllTickets(DATA_DIR, { status: "open" });
    expect(open).toHaveLength(1);
    expect(open[0]!.ticket.id).toBe("T-001");
  });
});
