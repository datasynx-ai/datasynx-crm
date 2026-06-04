import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

const syncImapMailbox = vi.fn();
vi.mock("../../src/sync/connectors/imap.js", () => ({ syncImapMailbox }));

import {
  imapConfigFromEnv,
  runMailboxSync,
  parseAccount,
  resolveAccountConfig,
} from "../../src/commands/mailbox.js";
import { saveMailboxToken } from "../../src/sync/oauth/token-store.js";

beforeEach(() => {
  vol.reset();
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

describe("parseAccount", () => {
  it("parses provider:user", () => {
    expect(parseAccount("gmail:me@gmail.com")).toEqual({ provider: "gmail", user: "me@gmail.com" });
    expect(parseAccount("microsoft:me@org.com")).toEqual({
      provider: "microsoft",
      user: "me@org.com",
    });
  });
  it("rejects unknown providers or missing user", () => {
    expect(parseAccount("yahoo:me@y.com")).toBeNull();
    expect(parseAccount("gmail:")).toBeNull();
    expect(parseAccount("nonsense")).toBeNull();
  });
});

describe("resolveAccountConfig", () => {
  it("builds a Gmail IMAP config from a stored token", async () => {
    saveMailboxToken("/data", {
      provider: "gmail",
      user: "me@gmail.com",
      accessToken: "AT",
      refreshToken: "RT",
      expiresAt: Date.now() + 3600_000,
    });
    const cfg = await resolveAccountConfig("/data", "gmail:me@gmail.com");
    expect(cfg.host).toBe("imap.gmail.com");
    expect(cfg.auth).toEqual({ user: "me@gmail.com", accessToken: "AT" });
  });

  it("rejects a malformed account", async () => {
    await expect(resolveAccountConfig("/data", "bogus")).rejects.toThrow(/Invalid account/);
  });
});

describe("runMailboxSync with --account", () => {
  it("resolves a stored OAuth mailbox and syncs it", async () => {
    saveMailboxToken("/data", {
      provider: "microsoft",
      user: "me@org.com",
      accessToken: "AT",
      refreshToken: "RT",
      expiresAt: Date.now() + 3600_000,
    });
    await runMailboxSync({
      dataDir: "/data",
      account: "microsoft:me@org.com",
      env: {} as NodeJS.ProcessEnv,
    });
    const call = syncImapMailbox.mock.calls[0]![0] as { config: { host: string; auth: unknown } };
    expect(call.config.host).toBe("outlook.office365.com");
    expect(call.config.auth).toEqual({ user: "me@org.com", accessToken: "AT" });
  });

  it("errors when the account has no stored token", async () => {
    const res = await runMailboxSync({
      dataDir: "/data",
      account: "gmail:nobody@gmail.com",
      env: {} as NodeJS.ProcessEnv,
    });
    expect("error" in res).toBe(true);
    expect(syncImapMailbox).not.toHaveBeenCalled();
  });
});
