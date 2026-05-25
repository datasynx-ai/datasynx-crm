import { describe, it, expect } from "vitest";
import { InteractionEntrySchema, type InteractionEntry } from "../../src/schemas/interaction.js";

describe("InteractionEntrySchema", () => {
  const validEntry: InteractionEntry = {
    date: "2024-06-01",
    type: "Email",
    with: "max@acme.com",
    summary: "Discussed pricing and next steps.",
    nextSteps: [],
    sourceRef: "gmail://thread/abc123",
    synced: "2024-06-01T10:00:00.000Z",
  };

  it("accepts a minimal valid entry", () => {
    const result = InteractionEntrySchema.safeParse(validEntry);
    expect(result.success).toBe(true);
  });

  it("accepts an entry with direction", () => {
    const withDirection = { ...validEntry, direction: "inbound" };
    const result = InteractionEntrySchema.safeParse(withDirection);
    expect(result.success).toBe(true);
  });

  it("accepts all valid types", () => {
    const types = ["Email", "Call", "Meeting", "Note", "Demo", "Proposal", "Contract", "Other"] as const;
    for (const type of types) {
      const result = InteractionEntrySchema.safeParse({ ...validEntry, type });
      expect(result.success).toBe(true);
    }
  });

  it("accepts both valid directions", () => {
    for (const direction of ["inbound", "outbound"] as const) {
      const result = InteractionEntrySchema.safeParse({ ...validEntry, direction });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid type", () => {
    const result = InteractionEntrySchema.safeParse({
      ...validEntry,
      type: "Chat",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid direction", () => {
    const result = InteractionEntrySchema.safeParse({
      ...validEntry,
      direction: "both",
    });
    expect(result.success).toBe(false);
  });

  it("requires date", () => {
    const { date: _date, ...withoutDate } = validEntry;
    const result = InteractionEntrySchema.safeParse(withoutDate);
    expect(result.success).toBe(false);
  });

  it("requires date in YYYY-MM-DD format", () => {
    const result = InteractionEntrySchema.safeParse({
      ...validEntry,
      date: "01-06-2024",
    });
    expect(result.success).toBe(false);
  });

  it("requires summary", () => {
    const { summary: _summary, ...withoutSummary } = validEntry;
    const result = InteractionEntrySchema.safeParse(withoutSummary);
    expect(result.success).toBe(false);
  });

  it("requires sourceRef", () => {
    const { sourceRef: _sourceRef, ...withoutSourceRef } = validEntry;
    const result = InteractionEntrySchema.safeParse(withoutSourceRef);
    expect(result.success).toBe(false);
  });

  it("requires synced timestamp", () => {
    const { synced: _synced, ...withoutSynced } = validEntry;
    const result = InteractionEntrySchema.safeParse(withoutSynced);
    expect(result.success).toBe(false);
  });

  it("nextSteps defaults to empty array", () => {
    const { nextSteps: _nextSteps, ...withoutNextSteps } = validEntry;
    const result = InteractionEntrySchema.safeParse(withoutNextSteps);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nextSteps).toEqual([]);
    }
  });

  it("accepts nextSteps as an array of strings", () => {
    const result = InteractionEntrySchema.safeParse({
      ...validEntry,
      nextSteps: ["Follow up by Friday", "Send proposal"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nextSteps).toHaveLength(2);
    }
  });

  it("subject is optional", () => {
    const withSubject = { ...validEntry, subject: "Re: Pricing" };
    const result = InteractionEntrySchema.safeParse(withSubject);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subject).toBe("Re: Pricing");
    }
  });
});
