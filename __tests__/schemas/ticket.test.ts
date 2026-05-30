import { describe, it, expect } from "vitest";
import { TicketSchema, TicketStatusSchema, TicketPrioritySchema } from "../../src/schemas/ticket.js";

describe("TicketSchema", () => {
  const valid = {
    id: "T-001",
    title: "Login fails for enterprise users",
    status: "open",
    priority: "high",
    created: "2026-05-30",
  };

  it("accepts a minimal valid ticket", () => {
    const result = TicketSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("defaults priority to normal", () => {
    const result = TicketSchema.safeParse({ ...valid, priority: undefined });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.priority).toBe("normal");
  });

  it("accepts all optional fields", () => {
    const result = TicketSchema.safeParse({
      ...valid,
      assignee: "alice",
      slaDue: "2026-06-02",
      resolved: "2026-06-01",
      description: "Cannot log in via SSO.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects id without T- prefix", () => {
    expect(TicketSchema.safeParse({ ...valid, id: "001" }).success).toBe(false);
  });

  it("rejects empty title", () => {
    expect(TicketSchema.safeParse({ ...valid, title: "" }).success).toBe(false);
  });

  it("rejects invalid created date format", () => {
    expect(TicketSchema.safeParse({ ...valid, created: "30-05-2026" }).success).toBe(false);
  });

  it("rejects invalid status", () => {
    expect(TicketSchema.safeParse({ ...valid, status: "pending" }).success).toBe(false);
  });

  it("rejects invalid priority", () => {
    expect(TicketSchema.safeParse({ ...valid, priority: "critical" }).success).toBe(false);
  });
});

describe("TicketStatusSchema", () => {
  it("accepts all valid statuses", () => {
    for (const s of ["open", "in-progress", "waiting", "resolved", "closed"]) {
      expect(TicketStatusSchema.safeParse(s).success).toBe(true);
    }
  });
});

describe("TicketPrioritySchema", () => {
  it("accepts all valid priorities", () => {
    for (const p of ["urgent", "high", "normal", "low"]) {
      expect(TicketPrioritySchema.safeParse(p).success).toBe(true);
    }
  });
});
