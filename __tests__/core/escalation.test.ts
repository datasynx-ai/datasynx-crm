import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

beforeEach(() => {
  vol.reset();
});

const DATA_DIR = "/crm";

describe("escalateToHuman", () => {
  it("creates a high-priority ticket and assigns via routing", async () => {
    vol.fromJSON({
      "/crm/customers/acme/main_facts.md": "---\nname: Acme\n---\n",
      "/crm/.agentic/routing-agents.json": JSON.stringify({
        agents: [
          { name: "alice", skills: ["support"], available: true, load: 3 },
          { name: "bob", skills: ["support"], available: true, load: 1 },
        ],
      }),
    });
    const { escalateToHuman } = await import("../../src/core/escalation.js");
    const ticket = await escalateToHuman(DATA_DIR, "acme", "Customer demands a refund");

    expect(ticket.priority).toBe("high");
    expect(ticket.status).toBe("open");
    expect(ticket.title).toContain("refund");
    expect(ticket.assignee).toBe("bob"); // least loaded
    expect(ticket.id).toMatch(/^T-\d{3,}$/);

    const { readTickets } = await import("../../src/fs/ticket-writer.js");
    expect(await readTickets(DATA_DIR, "acme")).toHaveLength(1);
  });

  it("works with no routing agents (no assignee)", async () => {
    vol.fromJSON({ "/crm/customers/acme/main_facts.md": "---\nname: Acme\n---\n" });
    const { escalateToHuman } = await import("../../src/core/escalation.js");
    const ticket = await escalateToHuman(DATA_DIR, "acme", "Needs attention", "urgent");
    expect(ticket.priority).toBe("urgent");
    expect(ticket.assignee).toBeUndefined();
  });
});
