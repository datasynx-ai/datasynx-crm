import { describe, it, expect, beforeEach } from "vitest";
import { setSession, getSession, clearSession } from "../../src/core/session-store.js";

beforeEach(() => {
  clearSession();
});

describe("session-store", () => {
  it("returns null when no session set", () => {
    expect(getSession()).toBeNull();
  });

  it("returns session after setSession", () => {
    const s = { customerSlug: "acme-corp", customerName: "Acme Corp", startedAt: "2026-05-30T10:00:00Z" };
    setSession(s);
    expect(getSession()).toEqual(s);
  });

  it("returns null after clearSession", () => {
    setSession({ customerSlug: "acme", customerName: "Acme", startedAt: "2026-05-30T10:00:00Z" });
    clearSession();
    expect(getSession()).toBeNull();
  });

  it("overwrites previous session on setSession", () => {
    setSession({ customerSlug: "acme", customerName: "Acme", startedAt: "2026-05-30T09:00:00Z" });
    setSession({ customerSlug: "beta", customerName: "Beta Corp", startedAt: "2026-05-30T10:00:00Z" });
    expect(getSession()?.customerSlug).toBe("beta");
  });

  it("stores optional owner field", () => {
    setSession({ customerSlug: "acme", customerName: "Acme", startedAt: "2026-05-30T10:00:00Z", owner: "alice" });
    expect(getSession()?.owner).toBe("alice");
  });
});
