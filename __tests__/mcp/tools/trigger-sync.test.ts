import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

vi.mock("../../../src/core/oauth-store.js", () => ({
  getGmailAuth: vi.fn().mockReturnValue(null),
  initOAuthFromDisk: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/fs/sync-state.js", () => ({
  updateSlugSyncState: vi.fn(),
  getLastGmailSync: vi.fn().mockReturnValue(null),
}));

vi.mock("../../../src/sync/gmail-sync.js", () => ({
  syncGmail: vi.fn().mockResolvedValue({ synced: 2, skipped: 1 }),
}));

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
});

describe("handleTriggerSync — no auth", () => {
  it("returns error when Gmail auth not configured", async () => {
    const { handleTriggerSync } = await import("../../../src/mcp/tools/trigger-sync.js");
    const result = await handleTriggerSync({}, "/data");

    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as { success: boolean; error: string };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("auth not configured");
  });
});

describe("handleTriggerSync — with auth", () => {
  beforeEach(async () => {
    const { getGmailAuth } = await import("../../../src/core/oauth-store.js");
    vi.mocked(getGmailAuth).mockReturnValue({ credentials: { access_token: "tok" } } as never);
  });

  it("returns success with synced=0 when no customers dir", async () => {
    vol.fromJSON({});
    const { handleTriggerSync } = await import("../../../src/mcp/tools/trigger-sync.js");
    const result = await handleTriggerSync({}, "/data");

    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as { success: boolean; synced: number };
    expect(parsed.success).toBe(true);
    expect(parsed.synced).toBe(0);
  });

  it("returns success with synced=0 when customer has no sources.json", async () => {
    vol.fromJSON({ "/data/customers/acme-corp/.keep": "" });
    const { handleTriggerSync } = await import("../../../src/mcp/tools/trigger-sync.js");
    const result = await handleTriggerSync({ slug: "acme-corp" }, "/data");

    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as { success: boolean; synced: number };
    expect(parsed.success).toBe(true);
    expect(parsed.synced).toBe(0);
  });

  it("returns success with synced=0 when gmail is disabled in sources.json", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/sources.json": JSON.stringify({
        gmail: { query: "from:acme.com", enabled: false },
      }),
    });
    const { handleTriggerSync } = await import("../../../src/mcp/tools/trigger-sync.js");
    const result = await handleTriggerSync({ slug: "acme-corp" }, "/data");

    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as { success: boolean; synced: number };
    expect(parsed.success).toBe(true);
    expect(parsed.synced).toBe(0);
  });

  it("syncs enabled customer and returns synced count", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/sources.json": JSON.stringify({
        gmail: { query: "from:acme.com", enabled: true },
      }),
    });
    const { handleTriggerSync } = await import("../../../src/mcp/tools/trigger-sync.js");
    const result = await handleTriggerSync({ slug: "acme-corp" }, "/data");

    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as {
      success: boolean;
      synced: number;
      skipped: number;
      customers: Array<{ slug: string; synced: number }>;
    };
    expect(parsed.success).toBe(true);
    expect(parsed.synced).toBe(2);
    expect(parsed.skipped).toBe(1);
    expect(parsed.customers[0]?.slug).toBe("acme-corp");
  });

  it("records error when syncGmail throws", async () => {
    vol.fromJSON({
      "/data/customers/fail-corp/sources.json": JSON.stringify({
        gmail: { query: "from:fail.com", enabled: true },
      }),
    });
    const { syncGmail } = await import("../../../src/sync/gmail-sync.js");
    vi.mocked(syncGmail).mockRejectedValueOnce(new Error("network timeout"));

    const { handleTriggerSync } = await import("../../../src/mcp/tools/trigger-sync.js");
    const result = await handleTriggerSync({ slug: "fail-corp" }, "/data");

    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text) as { success: boolean; errors: string[] };
    expect(parsed.success).toBe(true);
    expect(parsed.errors[0]).toContain("network timeout");
  });

  it("uses provided since date when specified", async () => {
    vol.fromJSON({
      "/data/customers/acme-corp/sources.json": JSON.stringify({
        gmail: { query: "from:acme.com", enabled: true },
      }),
    });
    const { syncGmail } = await import("../../../src/sync/gmail-sync.js");

    const { handleTriggerSync } = await import("../../../src/mcp/tools/trigger-sync.js");
    await handleTriggerSync({ slug: "acme-corp", since: "2026-01-01T00:00:00Z" }, "/data");

    const callArgs = vi.mocked(syncGmail).mock.calls[0]?.[0] as { since: Date } | undefined;
    expect(callArgs?.since).toBeInstanceOf(Date);
    expect(callArgs?.since.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});
