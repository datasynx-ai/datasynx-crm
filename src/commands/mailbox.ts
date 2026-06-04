import { Command } from "commander";
import { success, error, info, bold } from "../ui/colors.js";
import type { ImapMailboxConfig, SyncImapResult } from "../sync/connectors/imap.js";

/** Read IMAP mailbox connection settings from the environment. */
export function imapConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ImapMailboxConfig | null {
  const host = env["DXCRM_IMAP_HOST"];
  const user = env["DXCRM_IMAP_USER"];
  const pass = env["DXCRM_IMAP_PASS"];
  const accessToken = env["DXCRM_IMAP_TOKEN"];
  if (!host || !user || (!pass && !accessToken)) return null;

  return {
    host,
    port: env["DXCRM_IMAP_PORT"] ? Number(env["DXCRM_IMAP_PORT"]) : 993,
    secure: env["DXCRM_IMAP_SECURE"] !== "false",
    mailbox: env["DXCRM_IMAP_MAILBOX"] ?? "INBOX",
    auth: accessToken ? { user, accessToken } : { user, pass: pass! },
  };
}

export interface RunMailboxSyncOptions {
  dataDir: string;
  slug?: string | undefined;
  since?: Date | undefined;
  includeAttachments?: boolean | undefined;
  env?: NodeJS.ProcessEnv;
}

/**
 * Sync an IMAP mailbox (any provider). With a slug, all mail goes to that one
 * customer; without, mail is auto-routed to customers by sender/recipient
 * domain and unmatched mail is reported as unrouted.
 */
export async function runMailboxSync(
  opts: RunMailboxSyncOptions
): Promise<SyncImapResult | { error: string }> {
  const config = imapConfigFromEnv(opts.env ?? process.env);
  if (!config) {
    const msg =
      "IMAP not configured. Set DXCRM_IMAP_HOST, DXCRM_IMAP_USER and DXCRM_IMAP_PASS (or DXCRM_IMAP_TOKEN).";
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

export const mailboxCommand = new Command("mailbox").description(
  "Sync any IMAP mailbox (Gmail, Outlook, custom) into the CRM"
);

mailboxCommand
  .command("sync")
  .description("Sync an IMAP mailbox; auto-routes to customers by domain unless a slug is given")
  .argument("[slug]", "Route all mail to this customer (omit to auto-route by domain)")
  .option("--since <date>", "Only sync messages after this date (YYYY-MM-DD)")
  .option("--no-attachments", "Skip downloading/converting/indexing attachments")
  .action(async (slug: string | undefined, options: { since?: string; attachments?: boolean }) => {
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
    await runMailboxSync({
      dataDir,
      slug,
      ...(options.since ? { since: new Date(options.since) } : {}),
      includeAttachments: options.attachments !== false,
    });
  });
