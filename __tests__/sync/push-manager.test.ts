import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("makePushSubId", () => {
  it("returns string starting with psub_", async () => {
    const { makePushSubId } = await import("../../src/sync/push-manager.js");
    expect(makePushSubId()).toMatch(/^psub_\d+_[0-9a-f]+$/);
  });

  it("is unique across calls", async () => {
    const { makePushSubId } = await import("../../src/sync/push-manager.js");
    const ids = new Set(Array.from({ length: 20 }, () => makePushSubId()));
    expect(ids.size).toBe(20);
  });
});

describe("readSubscriptions / writeSubscriptions", () => {
  it("returns empty array when file missing", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { readSubscriptions } = await import("../../src/sync/push-manager.js");
    const subs = await readSubscriptions("/data");
    expect(subs).toEqual([]);
  });

  it("round-trips subscriptions correctly", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { readSubscriptions, writeSubscriptions } = await import("../../src/sync/push-manager.js");
    const sub = {
      id: "psub_1_abc123",
      provider: "gmail" as const,
      slug: "acme-corp",
      webhookUrl: "https://example.com/webhooks/gmail",
      expiresAt: "2026-06-04T06:00:00.000Z",
      renewedAt: null,
      createdAt: "2026-05-28T06:00:00.000Z",
      providerData: { gmailTopicName: "projects/x/topics/y", gmailHistoryId: "12345" },
      status: "active" as const,
      lastEventAt: null,
      eventsProcessed: 0,
    };
    await writeSubscriptions("/data", [sub]);
    const result = await readSubscriptions("/data");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "psub_1_abc123", provider: "gmail", slug: "acme-corp" });
  });

  it("sets updatedAt on write", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { writeSubscriptions } = await import("../../src/sync/push-manager.js");
    await writeSubscriptions("/data", []);
    const raw = vol.readFileSync("/data/.agentic/push-subscriptions.json", "utf-8") as string;
    const parsed = JSON.parse(raw) as { updatedAt: string };
    expect(parsed.updatedAt).toBeDefined();
    expect(new Date(parsed.updatedAt).getTime()).toBeGreaterThan(0);
  });
});

describe("register", () => {
  it("creates subscription with active status", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { register } = await import("../../src/sync/push-manager.js");
    const sub = await register("/data", "gmail", "acme-corp", {
      webhookUrl: "https://example.com/webhooks/gmail",
    });
    expect(sub.status).toBe("active");
    expect(sub.slug).toBe("acme-corp");
    expect(sub.provider).toBe("gmail");
  });

  it("sets expiresAt 7 days for gmail", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { register } = await import("../../src/sync/push-manager.js");
    const before = Date.now();
    const sub = await register("/data", "gmail", "acme-corp", {
      webhookUrl: "https://example.com/webhooks/gmail",
    });
    const after = Date.now();
    expect(sub.expiresAt).not.toBeNull();
    const expMs = new Date(sub.expiresAt!).getTime();
    expect(expMs).toBeGreaterThanOrEqual(before + 7 * 24 * 60 * 60 * 1000 - 1000);
    expect(expMs).toBeLessThanOrEqual(after + 7 * 24 * 60 * 60 * 1000 + 1000);
  });

  it("sets expiresAt 3 days for microsoft-graph", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { register } = await import("../../src/sync/push-manager.js");
    const before = Date.now();
    const sub = await register("/data", "microsoft-graph", "acme-corp", {
      webhookUrl: "https://example.com/webhooks/microsoft",
    });
    const after = Date.now();
    const expMs = new Date(sub.expiresAt!).getTime();
    expect(expMs).toBeGreaterThanOrEqual(before + 3 * 24 * 60 * 60 * 1000 - 1000);
    expect(expMs).toBeLessThanOrEqual(after + 3 * 24 * 60 * 60 * 1000 + 1000);
  });

  it("sets expiresAt null for slack", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { register } = await import("../../src/sync/push-manager.js");
    const sub = await register("/data", "slack", "acme-corp", {
      webhookUrl: "https://example.com/webhooks/slack",
    });
    expect(sub.expiresAt).toBeNull();
  });

  it("appends to existing subscriptions", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { register, readSubscriptions } = await import("../../src/sync/push-manager.js");
    await register("/data", "gmail", "acme-corp", { webhookUrl: "https://example.com/webhooks/gmail" });
    await register("/data", "slack", "widget-co", { webhookUrl: "https://example.com/webhooks/slack" });
    const subs = await readSubscriptions("/data");
    expect(subs).toHaveLength(2);
  });

  it("returns the new subscription", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { register } = await import("../../src/sync/push-manager.js");
    const sub = await register("/data", "gmail", "acme-corp", {
      webhookUrl: "https://example.com/webhooks/gmail",
      providerData: { gmailTopicName: "projects/x/topics/y" },
    });
    expect(sub.id).toMatch(/^psub_/);
    expect(sub.providerData.gmailTopicName).toBe("projects/x/topics/y");
    expect(sub.eventsProcessed).toBe(0);
    expect(sub.lastEventAt).toBeNull();
    expect(sub.renewedAt).toBeNull();
  });
});

describe("revoke", () => {
  it("sets status to revoked", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { register, revoke, readSubscriptions } = await import("../../src/sync/push-manager.js");
    const sub = await register("/data", "gmail", "acme-corp", {
      webhookUrl: "https://example.com/webhooks/gmail",
    });
    await revoke("/data", sub.id);
    const subs = await readSubscriptions("/data");
    expect(subs[0]!.status).toBe("revoked");
  });

  it("throws if id not found", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { revoke } = await import("../../src/sync/push-manager.js");
    await expect(revoke("/data", "psub_nonexistent")).rejects.toThrow("not found");
  });
});

describe("renewExpiringSubscriptions", () => {
  it("returns empty arrays when no subscriptions expire within threshold", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { register, renewExpiringSubscriptions } = await import("../../src/sync/push-manager.js");
    // Register with far-future expiry (gmail = 7 days), threshold = 24h → won't match
    await register("/data", "gmail", "acme-corp", { webhookUrl: "https://example.com/webhooks/gmail" });
    const renewFn = vi.fn();
    const result = await renewExpiringSubscriptions("/data", renewFn, 24);
    expect(result.renewed).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(renewFn).not.toHaveBeenCalled();
  });

  it("identifies subscriptions expiring within threshold hours", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { writeSubscriptions, renewExpiringSubscriptions } = await import("../../src/sync/push-manager.js");
    const expiringSoon = new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString(); // 10h from now
    await writeSubscriptions("/data", [{
      id: "psub_test_1",
      provider: "gmail",
      slug: "acme-corp",
      webhookUrl: "https://example.com/webhooks/gmail",
      expiresAt: expiringSoon,
      renewedAt: null,
      createdAt: new Date().toISOString(),
      providerData: {},
      status: "active",
      lastEventAt: null,
      eventsProcessed: 0,
    }]);
    const renewFn = vi.fn().mockResolvedValue({
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const result = await renewExpiringSubscriptions("/data", renewFn, 24);
    expect(result.renewed).toHaveLength(1);
    expect(result.renewed[0]).toBe("psub_test_1");
    expect(renewFn).toHaveBeenCalledOnce();
  });

  it("updates expiresAt and renewedAt after renewal", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { writeSubscriptions, renewExpiringSubscriptions, readSubscriptions } = await import("../../src/sync/push-manager.js");
    const expiringSoon = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await writeSubscriptions("/data", [{
      id: "psub_test_2",
      provider: "gmail",
      slug: "widget-co",
      webhookUrl: "https://example.com/webhooks/gmail",
      expiresAt: expiringSoon,
      renewedAt: null,
      createdAt: new Date().toISOString(),
      providerData: {},
      status: "active",
      lastEventAt: null,
      eventsProcessed: 0,
    }]);
    const renewFn = vi.fn().mockResolvedValue({ expiresAt: newExpiry, providerData: { gmailHistoryId: "99999" } });
    await renewExpiringSubscriptions("/data", renewFn, 24);
    const subs = await readSubscriptions("/data");
    expect(subs[0]!.expiresAt).toBe(newExpiry);
    expect(subs[0]!.renewedAt).not.toBeNull();
    expect(subs[0]!.providerData.gmailHistoryId).toBe("99999");
  });

  it("marks subscription as error if renewFn throws", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { writeSubscriptions, renewExpiringSubscriptions, readSubscriptions } = await import("../../src/sync/push-manager.js");
    const expiringSoon = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString();
    await writeSubscriptions("/data", [{
      id: "psub_test_3",
      provider: "gmail",
      slug: "broken-co",
      webhookUrl: "https://example.com/webhooks/gmail",
      expiresAt: expiringSoon,
      renewedAt: null,
      createdAt: new Date().toISOString(),
      providerData: {},
      status: "active",
      lastEventAt: null,
      eventsProcessed: 0,
    }]);
    const renewFn = vi.fn().mockRejectedValue(new Error("API timeout"));
    const result = await renewExpiringSubscriptions("/data", renewFn, 24);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toBe("psub_test_3");
    const subs = await readSubscriptions("/data");
    expect(subs[0]!.status).toBe("error");
  });

  it("skips already-revoked subscriptions", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { writeSubscriptions, renewExpiringSubscriptions } = await import("../../src/sync/push-manager.js");
    const expiringSoon = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString();
    await writeSubscriptions("/data", [{
      id: "psub_revoked_1",
      provider: "gmail",
      slug: "acme-corp",
      webhookUrl: "https://example.com/webhooks/gmail",
      expiresAt: expiringSoon,
      renewedAt: null,
      createdAt: new Date().toISOString(),
      providerData: {},
      status: "revoked",
      lastEventAt: null,
      eventsProcessed: 0,
    }]);
    const renewFn = vi.fn();
    const result = await renewExpiringSubscriptions("/data", renewFn, 24);
    expect(result.renewed).toHaveLength(0);
    expect(renewFn).not.toHaveBeenCalled();
  });

  it("skips slack subscriptions (no expiry)", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { register, renewExpiringSubscriptions } = await import("../../src/sync/push-manager.js");
    await register("/data", "slack", "acme-corp", { webhookUrl: "https://example.com/webhooks/slack" });
    const renewFn = vi.fn();
    const result = await renewExpiringSubscriptions("/data", renewFn, 24);
    expect(result.renewed).toHaveLength(0);
    expect(renewFn).not.toHaveBeenCalled();
  });

  it("marks permanently_failed after 3 consecutive renewal errors", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { writeSubscriptions, renewExpiringSubscriptions, readSubscriptions } = await import("../../src/sync/push-manager.js");
    const expiringSoon = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString();
    await writeSubscriptions("/data", [{
      id: "psub_pf_1",
      provider: "gmail",
      slug: "fragile-co",
      webhookUrl: "https://example.com/webhooks/gmail",
      expiresAt: expiringSoon,
      renewedAt: null,
      createdAt: new Date().toISOString(),
      providerData: {},
      status: "active",
      lastEventAt: null,
      eventsProcessed: 0,
    }]);
    const renewFn = vi.fn().mockRejectedValue(new Error("API error"));
    // 3 renewal attempts → permanently_failed on the 3rd
    await renewExpiringSubscriptions("/data", renewFn, 24);
    await renewExpiringSubscriptions("/data", renewFn, 24);
    await renewExpiringSubscriptions("/data", renewFn, 24);
    const subs = await readSubscriptions("/data");
    expect(subs[0]!.status).toBe("permanently_failed");
  });

  it("skips permanently_failed subscriptions in subsequent renewals", async () => {
    vol.fromJSON({ "/data/.agentic/.keep": "" });
    const { writeSubscriptions, renewExpiringSubscriptions } = await import("../../src/sync/push-manager.js");
    const expiringSoon = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString();
    await writeSubscriptions("/data", [{
      id: "psub_pf_2",
      provider: "gmail",
      slug: "fragile-co",
      webhookUrl: "https://example.com/webhooks/gmail",
      expiresAt: expiringSoon,
      renewedAt: null,
      createdAt: new Date().toISOString(),
      providerData: {},
      status: "permanently_failed",
      lastEventAt: null,
      eventsProcessed: 0,
    }]);
    const renewFn = vi.fn();
    const result = await renewExpiringSubscriptions("/data", renewFn, 24);
    expect(renewFn).not.toHaveBeenCalled();
    expect(result.renewed).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});
