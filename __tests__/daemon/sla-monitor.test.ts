import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

const mockEnqueue = vi.hoisted(() => vi.fn());
const mockEmitEvent = vi.hoisted(() => vi.fn());
vi.mock("../../src/core/proactive-agent.js", () => ({ enqueueTask: mockEnqueue }));
vi.mock("../../src/core/webhooks.js", () => ({ emitEvent: mockEmitEvent }));

const DATA_DIR = "/data";
const TODAY = "2026-06-09";

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
  mockEnqueue.mockResolvedValue({ id: "q" });
  mockEmitEvent.mockResolvedValue(undefined);
});

async function seedTicket(overrides: Record<string, unknown> = {}) {
  const { upsertTicket } = await import("../../src/fs/ticket-writer.js");
  await upsertTicket(DATA_DIR, "acme", {
    id: "T-001",
    title: "Login broken",
    status: "open",
    priority: "high",
    assignee: "alice",
    created: "2026-06-01",
    slaDue: "2026-06-09",
    ...overrides,
  } as never);
}

async function seedRouting() {
  const { saveRoutingAgents } = await import("../../src/core/routing.js");
  saveRoutingAgents(DATA_DIR, [
    { name: "alice", skills: ["billing"], available: true, load: 0 },
    { name: "bob", skills: ["technical"], available: true, load: 0 },
  ]);
  const { addRoutingRule } = await import("../../src/core/ticket-routing.js");
  addRoutingRule(DATA_DIR, { match: {}, assign: { roundRobin: true } });
}

describe("ticket routing (#59)", () => {
  it("resolveAssignee honors rule order: customer > priority > skill > round-robin", async () => {
    const { addRoutingRule, resolveAssignee } = await import("../../src/core/ticket-routing.js");
    const { saveRoutingAgents } = await import("../../src/core/routing.js");
    saveRoutingAgents(DATA_DIR, [
      { name: "alice", skills: ["billing"], available: true, load: 0 },
      { name: "bob", skills: ["technical"], available: true, load: 0 },
    ]);
    addRoutingRule(DATA_DIR, { match: { slug: "vip-corp" }, assign: { assignee: "alice" } });
    addRoutingRule(DATA_DIR, { match: { tag: "technical" }, assign: { skill: "technical" } });
    addRoutingRule(DATA_DIR, { match: {}, assign: { roundRobin: true } });

    expect(resolveAssignee(DATA_DIR, { slug: "vip-corp", priority: "normal" })).toBe("alice");
    expect(
      resolveAssignee(DATA_DIR, { slug: "acme", priority: "normal", tags: ["technical"] })
    ).toBe("bob");
    // round-robin rotates by load: bob now has load 1 → alice next
    expect(resolveAssignee(DATA_DIR, { slug: "acme", priority: "normal" })).toBe("alice");
  });

  it("create_ticket auto-assigns via the rules and audits it", async () => {
    await seedRouting();
    const { handleCreateTicket } = await import("../../src/mcp/tools/create-ticket.js");
    const res = await handleCreateTicket(
      { slug: "acme", title: "Help", priority: "normal" },
      DATA_DIR
    );
    const parsed = JSON.parse(res.content[0]!.text) as { ticket: { assignee?: string } };
    expect(parsed.ticket.assignee).toBeDefined();
    const { readAuditLog } = await import("../../src/fs/audit-log.js");
    expect(readAuditLog(DATA_DIR).some((e) => e.tool === "ticket_auto_route")).toBe(true);
  });
});

describe("runSlaMonitor (#59)", () => {
  it("warns once before the SLA due date", async () => {
    await seedTicket({ slaDue: "2026-06-10" }); // due tomorrow
    const { runSlaMonitor } = await import("../../src/daemon/sla-monitor.js");
    const r1 = await runSlaMonitor(DATA_DIR, TODAY);
    expect(r1.warned).toBe(1);
    expect(mockEnqueue).toHaveBeenCalledOnce();
    const r2 = await runSlaMonitor(DATA_DIR, TODAY);
    expect(r2.warned).toBe(0); // slaWarnedAt guard
  });

  it("escalates once on breach: reassign + alert + ticket.sla_breached + audit", async () => {
    await seedRouting();
    await seedTicket({ slaDue: "2026-06-01", assignee: "alice" }); // breached
    const { runSlaMonitor } = await import("../../src/daemon/sla-monitor.js");
    const r1 = await runSlaMonitor(DATA_DIR, TODAY);
    expect(r1.escalated).toBe(1);

    const { readTickets } = await import("../../src/fs/ticket-writer.js");
    const t = (await readTickets(DATA_DIR, "acme"))[0]!;
    expect(t.escalatedAt).toBeDefined();
    expect(t.priority).toBe("urgent");
    expect(t.assignee).toBe("bob"); // reassigned away from alice

    expect(mockEmitEvent).toHaveBeenCalledWith(
      DATA_DIR,
      "ticket.sla_breached",
      expect.objectContaining({ slug: "acme", previousAssignee: "alice" })
    );
    expect(mockEnqueue).toHaveBeenCalledOnce();
    const { readAuditLog } = await import("../../src/fs/audit-log.js");
    expect(readAuditLog(DATA_DIR).some((e) => e.tool === "sla_escalation")).toBe(true);

    const r2 = await runSlaMonitor(DATA_DIR, TODAY);
    expect(r2.escalated).toBe(0); // escalatedAt guard
  });

  it("ignores resolved/closed tickets", async () => {
    await seedTicket({ slaDue: "2026-06-01", status: "resolved" });
    const { runSlaMonitor } = await import("../../src/daemon/sla-monitor.js");
    const r = await runSlaMonitor(DATA_DIR, TODAY);
    expect(r.warned + r.escalated).toBe(0);
  });
});
