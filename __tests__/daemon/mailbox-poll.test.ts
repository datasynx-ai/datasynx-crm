import { describe, it, expect, vi } from "vitest";
import { runMailboxPollCycle } from "../../src/daemon/mailbox-poll.js";
import type { MailboxToken } from "../../src/sync/oauth/token-store.js";
import type { ImapMailboxConfig } from "../../src/sync/connectors/imap.js";

const since = new Date("2026-06-04T00:00:00Z");

function token(provider: "gmail" | "microsoft", user: string): MailboxToken {
  return {
    provider,
    user,
    accessToken: "AT",
    refreshToken: "RT",
    expiresAt: Date.now() + 3600_000,
  };
}

function cfg(user: string): ImapMailboxConfig {
  return {
    host: "imap.x.com",
    port: 993,
    secure: true,
    mailbox: "INBOX",
    auth: { user, accessToken: "AT" },
  };
}

describe("runMailboxPollCycle", () => {
  it("polls every stored OAuth account, auto-routing", async () => {
    const syncFn = vi.fn().mockResolvedValue({ synced: 2, skipped: 0, unrouted: 1 });
    const res = await runMailboxPollCycle("/data", since, {
      env: {} as NodeJS.ProcessEnv,
      listTokens: () => [token("gmail", "a@x.com"), token("microsoft", "b@org.com")],
      resolveConfig: (_d, account) => Promise.resolve(cfg(account)),
      envConfig: () => null,
      syncFn,
    });

    expect(res.accounts).toBe(2);
    expect(res.synced).toBe(4);
    expect(res.unrouted).toBe(2);
    expect(syncFn).toHaveBeenCalledTimes(2);
    // auto-route mode: no slug passed
    expect(syncFn.mock.calls[0]![0]).not.toHaveProperty("slug");
    expect(syncFn.mock.calls[0]![0].since).toBe(since);
  });

  it("also polls an env-configured IMAP mailbox", async () => {
    const syncFn = vi.fn().mockResolvedValue({ synced: 1, skipped: 0, unrouted: 0 });
    const res = await runMailboxPollCycle("/data", since, {
      env: {} as NodeJS.ProcessEnv,
      listTokens: () => [],
      envConfig: () => cfg("env@x.com"),
      syncFn,
    });
    expect(res.accounts).toBe(1);
    expect(res.synced).toBe(1);
  });

  it("collects a token-refresh failure without aborting other accounts", async () => {
    const syncFn = vi.fn().mockResolvedValue({ synced: 1, skipped: 0, unrouted: 0 });
    const res = await runMailboxPollCycle("/data", since, {
      env: {} as NodeJS.ProcessEnv,
      listTokens: () => [token("gmail", "bad@x.com"), token("microsoft", "good@org.com")],
      resolveConfig: (_d, account) =>
        account.includes("bad")
          ? Promise.reject(new Error("refresh failed"))
          : Promise.resolve(cfg(account)),
      envConfig: () => null,
      syncFn,
    });
    expect(res.accounts).toBe(1); // only the good one was synced
    expect(res.synced).toBe(1);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toContain("bad@x.com");
  });

  it("collects a sync failure per account", async () => {
    const syncFn = vi.fn().mockRejectedValue(new Error("imap down"));
    const res = await runMailboxPollCycle("/data", since, {
      env: {} as NodeJS.ProcessEnv,
      listTokens: () => [token("gmail", "a@x.com")],
      resolveConfig: (_d, account) => Promise.resolve(cfg(account)),
      envConfig: () => null,
      syncFn,
    });
    expect(res.synced).toBe(0);
    expect(res.errors[0]).toContain("imap down");
  });

  it("does nothing when no mailboxes are configured", async () => {
    const res = await runMailboxPollCycle("/data", since, {
      env: {} as NodeJS.ProcessEnv,
      listTokens: () => [],
      envConfig: () => null,
    });
    expect(res.accounts).toBe(0);
    expect(res.errors).toEqual([]);
  });
});
