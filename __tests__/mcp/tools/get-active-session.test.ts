import { describe, it, expect, beforeEach } from "vitest";
import { handleGetActiveSession } from "../../../src/mcp/tools/get-active-session.js";
import { setSession, clearSession } from "../../../src/core/session-store.js";

describe("get_active_session tool", () => {
  beforeEach(() => {
    clearSession();
  });

  it("returns hasSession: false when no session is active", async () => {
    const result = await handleGetActiveSession();
    expect(result.content).toBeDefined();
    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as { hasSession: boolean };
    expect(parsed.hasSession).toBe(false);
  });

  it("returns hasSession: true with customer info when session is active", async () => {
    setSession({
      customerSlug: "acme-corp",
      customerName: "Acme Corp",
      startedAt: "2026-05-25T10:00:00.000Z",
    });

    const result = await handleGetActiveSession();
    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as {
      hasSession: boolean;
      customerSlug: string;
      customerName: string;
      startedAt: string;
    };

    expect(parsed.hasSession).toBe(true);
    expect(parsed.customerSlug).toBe("acme-corp");
    expect(parsed.customerName).toBe("Acme Corp");
    expect(parsed.startedAt).toBe("2026-05-25T10:00:00.000Z");
  });

  it("returns hasSession: false after clearSession", async () => {
    setSession({
      customerSlug: "test-corp",
      customerName: "Test Corp",
      startedAt: "2026-05-25T10:00:00.000Z",
    });
    clearSession();

    const result = await handleGetActiveSession();
    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as { hasSession: boolean };
    expect(parsed.hasSession).toBe(false);
  });

  it("returns owner when session has owner set", async () => {
    setSession({
      customerSlug: "acme-corp",
      customerName: "Acme Corp",
      startedAt: "2026-05-26T08:00:00.000Z",
      owner: "alice",
    });

    const result = await handleGetActiveSession();
    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as {
      hasSession: boolean;
      customerSlug: string;
      customerName: string;
      startedAt: string;
      owner: string;
    };

    expect(parsed.hasSession).toBe(true);
    expect(parsed.owner).toBe("alice");
  });

  it("owner is absent in response when not set on session", async () => {
    setSession({
      customerSlug: "acme-corp",
      customerName: "Acme Corp",
      startedAt: "2026-05-26T08:00:00.000Z",
    });

    const result = await handleGetActiveSession();
    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as Record<string, unknown>;

    expect(parsed.hasSession).toBe(true);
    expect(parsed["owner"]).toBeUndefined();
  });
});
