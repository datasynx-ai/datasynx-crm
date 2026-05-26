import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

// Mock context builder so we don't need full filesystem structure
vi.mock("../../../src/core/context-builder.js", () => ({
  buildContext: vi.fn().mockResolvedValue("# Customer Context: acme-corp\n\nContext here."),
}));

// Mock sync-state
vi.mock("../../../src/fs/sync-state.js", () => ({
  getLastGmailSync: vi.fn(),
  updateSlugSyncState: vi.fn(),
}));

// Mock oauth-store
vi.mock("../../../src/core/oauth-store.js", () => ({
  getGmailAuth: vi.fn(),
}));

// Mock gmail-sync
const mockSyncGmail = vi.fn().mockResolvedValue({ synced: 2, skipped: 0 });
vi.mock("../../../src/sync/gmail-sync.js", () => ({
  syncGmail: mockSyncGmail,
}));

import { handleGetCustomerContext } from "../../../src/mcp/tools/get-customer-context.js";
import { getLastGmailSync, updateSlugSyncState } from "../../../src/fs/sync-state.js";
import { getGmailAuth } from "../../../src/core/oauth-store.js";

const mockGetLastSync = vi.mocked(getLastGmailSync);
const mockUpdateSyncState = vi.mocked(updateSlugSyncState);
const mockGetGmailAuth = vi.mocked(getGmailAuth);

const DATA_DIR = "/data";
const SLUG = "acme-corp";
const CUSTOMER_DIR = `${DATA_DIR}/customers/${SLUG}`;
const SOURCES_PATH = `${CUSTOMER_DIR}/sources.json`;

const enabledSources = JSON.stringify({
  gmail: { enabled: true, query: "from:acme.com" },
});

const fakeAuth = { setCredentials: vi.fn() } as unknown as import("googleapis").Auth.OAuth2Client;

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
  mockSyncGmail.mockResolvedValue({ synced: 2, skipped: 0 });
});

describe("get_customer_context — On-Query-Sync", () => {
  it("does not attempt sync when no auth is available", async () => {
    mockGetGmailAuth.mockReturnValue(null);
    vol.fromJSON({
      [`${CUSTOMER_DIR}/`]: null,
      [SOURCES_PATH]: enabledSources,
    });

    await handleGetCustomerContext({ slug: SLUG }, DATA_DIR);

    expect(mockSyncGmail).not.toHaveBeenCalled();
  });

  it("does not sync when last sync was less than 30 minutes ago", async () => {
    mockGetGmailAuth.mockReturnValue(fakeAuth);
    // Last sync was 10 minutes ago
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    mockGetLastSync.mockReturnValue(tenMinAgo);

    vol.fromJSON({
      [`${CUSTOMER_DIR}/`]: null,
      [SOURCES_PATH]: enabledSources,
    });

    await handleGetCustomerContext({ slug: SLUG }, DATA_DIR);

    expect(mockSyncGmail).not.toHaveBeenCalled();
  });

  it("triggers fire-and-forget sync when last sync is more than 30 minutes ago", async () => {
    mockGetGmailAuth.mockReturnValue(fakeAuth);
    // Last sync was 35 minutes ago
    const thirtyFiveMinAgo = new Date(Date.now() - 35 * 60 * 1000);
    mockGetLastSync.mockReturnValue(thirtyFiveMinAgo);

    vol.fromJSON({
      [`${CUSTOMER_DIR}/`]: null,
      [SOURCES_PATH]: enabledSources,
    });

    await handleGetCustomerContext({ slug: SLUG }, DATA_DIR);

    // syncGmail should have been called (fire-and-forget — may not be awaited)
    // Give microtasks a tick to flush
    await new Promise((r) => setTimeout(r, 0));

    expect(mockSyncGmail).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: SLUG,
        dataDir: DATA_DIR,
        auth: fakeAuth,
        query: "from:acme.com",
      })
    );
  });

  it("triggers sync when last sync is undefined (never synced)", async () => {
    mockGetGmailAuth.mockReturnValue(fakeAuth);
    mockGetLastSync.mockReturnValue(undefined);

    vol.fromJSON({
      [`${CUSTOMER_DIR}/`]: null,
      [SOURCES_PATH]: enabledSources,
    });

    await handleGetCustomerContext({ slug: SLUG }, DATA_DIR);

    await new Promise((r) => setTimeout(r, 0));
    expect(mockSyncGmail).toHaveBeenCalled();
  });

  it("does not sync if sources.json does not exist", async () => {
    mockGetGmailAuth.mockReturnValue(fakeAuth);
    mockGetLastSync.mockReturnValue(undefined);

    // No sources.json
    vol.fromJSON({ [`${CUSTOMER_DIR}/`]: null });

    await handleGetCustomerContext({ slug: SLUG }, DATA_DIR);

    await new Promise((r) => setTimeout(r, 0));
    expect(mockSyncGmail).not.toHaveBeenCalled();
  });

  it("does not sync if gmail is disabled in sources.json", async () => {
    mockGetGmailAuth.mockReturnValue(fakeAuth);
    mockGetLastSync.mockReturnValue(undefined);

    vol.fromJSON({
      [`${CUSTOMER_DIR}/`]: null,
      [SOURCES_PATH]: JSON.stringify({ gmail: { enabled: false, query: "from:acme.com" } }),
    });

    await handleGetCustomerContext({ slug: SLUG }, DATA_DIR);

    await new Promise((r) => setTimeout(r, 0));
    expect(mockSyncGmail).not.toHaveBeenCalled();
  });

  it("does not sync if gmail query is missing in sources.json", async () => {
    mockGetGmailAuth.mockReturnValue(fakeAuth);
    mockGetLastSync.mockReturnValue(undefined);

    vol.fromJSON({
      [`${CUSTOMER_DIR}/`]: null,
      [SOURCES_PATH]: JSON.stringify({ gmail: { enabled: true } }),
    });

    await handleGetCustomerContext({ slug: SLUG }, DATA_DIR);

    await new Promise((r) => setTimeout(r, 0));
    expect(mockSyncGmail).not.toHaveBeenCalled();
  });

  it("still returns context even when sync is triggered", async () => {
    mockGetGmailAuth.mockReturnValue(fakeAuth);
    mockGetLastSync.mockReturnValue(undefined);

    vol.fromJSON({
      [`${CUSTOMER_DIR}/`]: null,
      [SOURCES_PATH]: enabledSources,
    });

    const result = await handleGetCustomerContext({ slug: SLUG }, DATA_DIR);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("acme-corp");
    expect(result.isError).toBeFalsy();
  });

  it("updates sync state after successful sync completes", async () => {
    mockGetGmailAuth.mockReturnValue(fakeAuth);
    mockGetLastSync.mockReturnValue(undefined);
    mockSyncGmail.mockResolvedValue({ synced: 1, skipped: 0 });

    vol.fromJSON({
      [`${CUSTOMER_DIR}/`]: null,
      [SOURCES_PATH]: enabledSources,
    });

    await handleGetCustomerContext({ slug: SLUG }, DATA_DIR);

    // Wait for the fire-and-forget promise to resolve
    await new Promise((r) => setTimeout(r, 10));

    expect(mockUpdateSyncState).toHaveBeenCalledWith(
      DATA_DIR,
      SLUG,
      expect.objectContaining({ lastGmailSync: expect.any(String) })
    );
  });
});
