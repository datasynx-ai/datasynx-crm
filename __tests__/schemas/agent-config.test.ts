import { describe, it, expect } from "vitest";
import { AgentConfigSchema } from "../../src/schemas/agent-config.js";

describe("AgentConfigSchema", () => {
  const valid = {
    slug: "acme-corp",
    channel: "telegram",
    wakeOn: ["email"],
    createdAt: "2026-05-30T10:00:00Z",
    lastWake: null,
  };

  it("accepts a valid agent config", () => {
    expect(AgentConfigSchema.safeParse(valid).success).toBe(true);
  });

  it("defaults wakeOn to email", () => {
    const result = AgentConfigSchema.safeParse({ ...valid, wakeOn: undefined });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.wakeOn).toEqual(["email"]);
  });

  it("defaults lastWake to null", () => {
    const result = AgentConfigSchema.safeParse({ ...valid, lastWake: undefined });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.lastWake).toBeNull();
  });

  it("accepts telegramChatId", () => {
    const result = AgentConfigSchema.safeParse({ ...valid, telegramChatId: "123456789" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.telegramChatId).toBe("123456789");
  });

  it("accepts wakeOn with both email and calendar", () => {
    const result = AgentConfigSchema.safeParse({ ...valid, wakeOn: ["email", "calendar"] });
    expect(result.success).toBe(true);
  });

  it("rejects empty slug", () => {
    expect(AgentConfigSchema.safeParse({ ...valid, slug: "" }).success).toBe(false);
  });

  it("rejects invalid channel", () => {
    expect(AgentConfigSchema.safeParse({ ...valid, channel: "slack" }).success).toBe(false);
  });

  it("rejects invalid wakeOn event", () => {
    expect(AgentConfigSchema.safeParse({ ...valid, wakeOn: ["email", "sms"] }).success).toBe(false);
  });

  it("accepts lastWake as ISO string", () => {
    const result = AgentConfigSchema.safeParse({ ...valid, lastWake: "2026-05-30T08:00:00Z" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.lastWake).toBe("2026-05-30T08:00:00Z");
  });
});
