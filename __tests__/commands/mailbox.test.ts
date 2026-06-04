import { describe, it, expect, beforeEach, vi } from "vitest";

const syncImapMailbox = vi.fn();
vi.mock("../../src/sync/connectors/imap.js", () => ({ syncImapMailbox }));

import { imapConfigFromEnv, runMailboxSync } from "../../src/commands/mailbox.js";

beforeEach(() => {
  vi.clearAllMocks();
  syncImapMailbox.mockResolvedValue({ synced: 2, skipped: 1, unrouted: 3 });
});

describe("imapConfigFromEnv", () => {
  it("builds a password config", () => {
    const cfg = imapConfigFromEnv({
      DXCRM_IMAP_HOST: "imap.x.com",
      DXCRM_IMAP_USER: "me@x.com",
      DXCRM_IMAP_PASS: "secret",
    } as NodeJS.ProcessEnv);
    expect(cfg).toEqual({
      host: "imap.x.com",
      port: 993,
      secure: true,
      mailbox: "INBOX",
      auth: { user: "me@x.com", pass: "secret" },
    });
  });

  it("prefers an OAuth token when present", () => {
    const cfg = imapConfigFromEnv({
      DXCRM_IMAP_HOST: "outlook.office365.com",
      DXCRM_IMAP_USER: "me@org.com",
      DXCRM_IMAP_TOKEN: "ya29.token",
      DXCRM_IMAP_MAILBOX: "Archive",
    } as NodeJS.ProcessEnv);
    expect(cfg?.auth).toEqual({ user: "me@org.com", accessToken: "ya29.token" });
    expect(cfg?.mailbox).toBe("Archive");
  });

  it("returns null when required settings are missing", () => {
    expect(imapConfigFromEnv({ DXCRM_IMAP_HOST: "x" } as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe("runMailboxSync", () => {
  const env = {
    DXCRM_IMAP_HOST: "imap.x.com",
    DXCRM_IMAP_USER: "me@x.com",
    DXCRM_IMAP_PASS: "secret",
  } as NodeJS.ProcessEnv;

  it("errors clearly when IMAP is not configured", async () => {
    const res = await runMailboxSync({ dataDir: "/data", env: {} as NodeJS.ProcessEnv });
    expect("error" in res).toBe(true);
    expect(syncImapMailbox).not.toHaveBeenCalled();
  });

  it("passes a fixed slug through to the connector", async () => {
    await runMailboxSync({ dataDir: "/data", slug: "acme", env });
    expect(syncImapMailbox).toHaveBeenCalledWith(
      expect.objectContaining({ dataDir: "/data", slug: "acme" })
    );
  });

  it("auto-routes (no slug) and returns the connector result", async () => {
    const res = await runMailboxSync({ dataDir: "/data", env });
    expect(res).toEqual({ synced: 2, skipped: 1, unrouted: 3 });
    const call = syncImapMailbox.mock.calls[0]![0] as Record<string, unknown>;
    expect(call["slug"]).toBeUndefined();
  });
});
