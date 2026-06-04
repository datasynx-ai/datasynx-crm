import { Command } from "commander";
import readline from "readline";
import { success, error, info, bold } from "../ui/colors.js";
import type { ImapMailboxConfig, SyncImapResult } from "../sync/connectors/imap.js";
import type { MailboxProvider } from "../sync/oauth/token-store.js";
import { imapConfigFromEnv, resolveAccountConfig } from "../sync/mailbox-config.js";

// Re-exported for backward compatibility (tests + external callers).
export { imapConfigFromEnv, parseAccount, resolveAccountConfig } from "../sync/mailbox-config.js";

export interface RunMailboxSyncOptions {
  dataDir: string;
  slug?: string | undefined;
  since?: Date | undefined;
  includeAttachments?: boolean | undefined;
  /** "provider:user" of a stored OAuth account; overrides env IMAP config. */
  account?: string | undefined;
  env?: NodeJS.ProcessEnv;
}

/**
 * Sync an IMAP mailbox (any provider). With a slug, all mail goes to that one
 * customer; without, mail is auto-routed to customers by sender/recipient
 * domain and unmatched mail is reported as unrouted. Use `account` to sync a
 * stored OAuth mailbox (Gmail/Outlook) instead of env-configured IMAP.
 */
export async function runMailboxSync(
  opts: RunMailboxSyncOptions
): Promise<SyncImapResult | { error: string }> {
  const env = opts.env ?? process.env;

  let config: ImapMailboxConfig | null;
  try {
    config = opts.account
      ? await resolveAccountConfig(opts.dataDir, opts.account, env)
      : imapConfigFromEnv(env);
  } catch (err) {
    const msg = (err as Error).message;
    console.error(error(msg));
    return { error: msg };
  }
  if (!config) {
    const msg =
      "IMAP not configured. Set DXCRM_IMAP_HOST, DXCRM_IMAP_USER and DXCRM_IMAP_PASS (or DXCRM_IMAP_TOKEN), or use --account.";
    console.error(error(msg));
    return { error: msg };
  }

  const { syncImapMailbox } = await import("../sync/connectors/imap.js");
  const result = await syncImapMailbox({
    dataDir: opts.dataDir,
    config,
    ...(opts.slug ? { slug: opts.slug } : {}),
    ...(opts.since ? { since: opts.since } : {}),
    ...(opts.includeAttachments !== undefined
      ? { includeAttachments: opts.includeAttachments }
      : {}),
  });

  const target = opts.slug ? `customer ${bold(opts.slug)}` : "all customers (auto-routed)";
  console.log(
    success(
      `✓ IMAP ${config.mailbox} → ${target}: +${result.synced} synced, ${result.skipped} skipped, ${result.unrouted} unrouted`
    )
  );
  if (!opts.slug && result.unrouted > 0) {
    console.log(
      info(
        `  ${result.unrouted} message(s) matched no customer. Add their domains via 'dxcrm create <slug> --domain <domain>'.`
      )
    );
  }
  return result;
}

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => (rl.close(), resolve(a))));
}

/** Interactive `dxcrm mailbox login <provider>` flow. */
async function runLogin(provider: MailboxProvider, user: string | undefined): Promise<void> {
  const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
  const print = (l: string): void => console.log(l);

  if (provider === "gmail") {
    const clientId = process.env["DXCRM_GOOGLE_CLIENT_ID"];
    const clientSecret = process.env["DXCRM_GOOGLE_CLIENT_SECRET"];
    if (!clientId || !clientSecret) {
      console.error(
        error("Set DXCRM_GOOGLE_CLIENT_ID and DXCRM_GOOGLE_CLIENT_SECRET (OAuth desktop app).")
      );
      return;
    }
    const account = user ?? (await ask("Gmail address: ")).trim();
    const { runGmailLogin } = await import("../sync/oauth/login.js");
    await runGmailLogin({ dataDir, clientId, clientSecret, user: account, prompt: ask, print });
    console.log(
      success(
        `✓ Gmail authorized for ${bold(account)}. Sync: dxcrm mailbox sync --account gmail:${account}`
      )
    );
    return;
  }

  if (provider === "microsoft") {
    const clientId = process.env["DXCRM_MS_CLIENT_ID"];
    if (!clientId) {
      console.error(error("Set DXCRM_MS_CLIENT_ID (Azure app registration, public client)."));
      return;
    }
    const tenant = process.env["DXCRM_MS_TENANT"] ?? "common";
    const account = user ?? (await ask("Outlook/Microsoft address: ")).trim();
    const { runMicrosoftLogin } = await import("../sync/oauth/login.js");
    await runMicrosoftLogin({ dataDir, clientId, user: account, tenant, print });
    console.log(
      success(
        `✓ Microsoft authorized for ${bold(account)}. Sync: dxcrm mailbox sync --account microsoft:${account}`
      )
    );
    return;
  }

  console.error(error(`Unknown provider '${provider}'. Use 'gmail' or 'microsoft'.`));
}

export const mailboxCommand = new Command("mailbox").description(
  "Sync any IMAP mailbox (Gmail, Outlook, custom) into the CRM"
);

mailboxCommand
  .command("login")
  .description("Authorize a Gmail or Microsoft mailbox via OAuth (stores tokens locally)")
  .argument("<provider>", "gmail | microsoft")
  .option("--user <email>", "Mailbox address (otherwise prompted)")
  .action(async (provider: string, options: { user?: string }) => {
    await runLogin(provider as MailboxProvider, options.user);
  });

mailboxCommand
  .command("sync")
  .description("Sync an IMAP mailbox; auto-routes to customers by domain unless a slug is given")
  .argument("[slug]", "Route all mail to this customer (omit to auto-route by domain)")
  .option("--account <provider:user>", "Use a stored OAuth mailbox (e.g. gmail:you@gmail.com)")
  .option("--since <date>", "Only sync messages after this date (YYYY-MM-DD)")
  .option("--no-attachments", "Skip downloading/converting/indexing attachments")
  .action(
    async (
      slug: string | undefined,
      options: { account?: string; since?: string; attachments?: boolean }
    ) => {
      const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
      await runMailboxSync({
        dataDir,
        slug,
        ...(options.account ? { account: options.account } : {}),
        ...(options.since ? { since: new Date(options.since) } : {}),
        includeAttachments: options.attachments !== false,
      });
    }
  );
