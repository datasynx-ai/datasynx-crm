// src/daemon/mailbox-poll.ts
// Background polling of every configured mailbox (stored OAuth accounts +
// optional env-configured IMAP). Each mailbox is auto-routed to customers by
// domain. Kept separate from worker.ts so it is unit-testable.
import { logger } from "../core/logger.js";
import { listMailboxTokens } from "../sync/oauth/token-store.js";
import { resolveAccountConfig, imapConfigFromEnv } from "../sync/mailbox-config.js";
import {
  syncImapMailbox,
  type ImapMailboxConfig,
  type SyncImapResult,
} from "../sync/connectors/imap.js";

export interface MailboxPollResult {
  accounts: number;
  synced: number;
  skipped: number;
  unrouted: number;
  errors: string[];
}

export interface MailboxPollDeps {
  env?: NodeJS.ProcessEnv;
  listTokens?: typeof listMailboxTokens;
  resolveConfig?: typeof resolveAccountConfig;
  envConfig?: (env: NodeJS.ProcessEnv) => ImapMailboxConfig | null;
  syncFn?: (opts: {
    dataDir: string;
    config: ImapMailboxConfig;
    since: Date;
  }) => Promise<SyncImapResult>;
}

/**
 * Poll every configured mailbox once and auto-route new mail to customers.
 * Resolves a fresh access token per OAuth account (refreshing as needed) and
 * also syncs an env-configured IMAP mailbox when present. Per-account failures
 * are collected, never thrown, so one bad mailbox can't stall the daemon.
 */
export async function runMailboxPollCycle(
  dataDir: string,
  since: Date,
  deps: MailboxPollDeps = {}
): Promise<MailboxPollResult> {
  const env = deps.env ?? process.env;
  const listTokens = deps.listTokens ?? listMailboxTokens;
  const resolveConfig = deps.resolveConfig ?? resolveAccountConfig;
  const envConfig = deps.envConfig ?? imapConfigFromEnv;
  const syncFn =
    deps.syncFn ??
    ((o: { dataDir: string; config: ImapMailboxConfig; since: Date }) =>
      syncImapMailbox({ dataDir: o.dataDir, config: o.config, since: o.since }));

  const result: MailboxPollResult = { accounts: 0, synced: 0, skipped: 0, unrouted: 0, errors: [] };

  // 1. Build the list of mailbox configs to poll (OAuth accounts + env IMAP).
  const configs: Array<{ label: string; config: ImapMailboxConfig }> = [];
  for (const token of listTokens(dataDir)) {
    if (token.provider !== "gmail" && token.provider !== "microsoft") continue;
    const label = `${token.provider}:${token.user}`;
    try {
      configs.push({ label, config: await resolveConfig(dataDir, label, env) });
    } catch (err) {
      result.errors.push(`${label}: ${(err as Error).message}`);
      logger.warn("daemon", "mailbox token unusable", {
        account: label,
        error: (err as Error).message,
      });
    }
  }
  const envCfg = envConfig(env);
  if (envCfg) configs.push({ label: `imap:${envCfg.auth.user}`, config: envCfg });

  // 2. Sync each mailbox (auto-route).
  for (const { label, config } of configs) {
    result.accounts++;
    try {
      const r = await syncFn({ dataDir, config, since });
      result.synced += r.synced;
      result.skipped += r.skipped;
      result.unrouted += r.unrouted;
      if (r.synced > 0 || r.unrouted > 0) {
        logger.info("daemon", "mailbox polled", {
          account: label,
          synced: r.synced,
          unrouted: r.unrouted,
        });
      }
    } catch (err) {
      result.errors.push(`${label}: ${(err as Error).message}`);
      logger.error("daemon", "mailbox poll failed", {
        account: label,
        error: (err as Error).message,
      });
    }
  }

  return result;
}
