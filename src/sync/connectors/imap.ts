// src/sync/connectors/imap.ts
import { readInteractions } from "../../fs/interactions-writer.js";
import { ingestEmail, type NormalizedEmail } from "../email-ingest.js";
import { buildRoutingTable, routeMessage, domainOf } from "../email-router.js";
import { htmlToMarkdown } from "../converters/html.js";
import { logger } from "../../core/logger.js";

export interface ImapMailboxConfig {
  host: string;
  port?: number;
  secure?: boolean;
  /** Either a password (legacy IMAP) or an OAuth2 access token (XOAUTH2). */
  auth: { user: string; pass?: string; accessToken?: string };
  mailbox?: string;
}

/** Minimal slice of the ImapFlow client surface we depend on (for testability). */
export interface ImapMessage {
  uid: number;
  source: Buffer;
}
export interface ImapClient {
  connect(): Promise<void>;
  getMailboxLock(mailbox: string): Promise<{ release: () => void }>;
  fetch(range: unknown, query: { uid?: boolean; source?: boolean }): AsyncIterable<ImapMessage>;
  logout(): Promise<void>;
}

export interface SyncImapOptions {
  dataDir: string;
  config: ImapMailboxConfig;
  since?: Date;
  /** Fixed customer slug. When omitted, messages are auto-routed by domain. */
  slug?: string;
  includeAttachments?: boolean;
  maxAttachmentBytes?: number;
  /** Inject a client (tests); defaults to a real ImapFlow connection. */
  clientFactory?: (config: ImapMailboxConfig) => ImapClient;
}

export interface SyncImapResult {
  synced: number;
  skipped: number;
  unrouted: number;
}

/** Build a real ImapFlow client. Loaded lazily so the dep stays off hot paths. */
async function defaultClientFactory(config: ImapMailboxConfig): Promise<ImapClient> {
  const { ImapFlow } = await import("imapflow");
  const auth = config.auth.accessToken
    ? { user: config.auth.user, accessToken: config.auth.accessToken }
    : { user: config.auth.user, pass: config.auth.pass ?? "" };
  return new ImapFlow({
    host: config.host,
    port: config.port ?? 993,
    secure: config.secure ?? true,
    auth,
    logger: false,
  }) as unknown as ImapClient;
}

/** Fields extracted from a parsed message, decoupled from mailparser's types. */
export interface ParsedEmailInput {
  messageId?: string | undefined;
  fromText?: string | undefined;
  toAddresses?: string[] | undefined;
  subject?: string | undefined;
  date?: Date | undefined;
  text?: string | undefined;
  html?: string | false | undefined;
  attachments?:
    | Array<{ filename?: string | undefined; contentType?: string | undefined; content: Buffer }>
    | undefined;
}

/** Normalize extracted email fields into the provider-independent email shape. */
export async function normalizeParsedEmail(
  parsed: ParsedEmailInput,
  ctx: { user: string; host: string; mailbox: string; uid: number }
): Promise<NormalizedEmail> {
  const toAddresses = (parsed.toAddresses ?? [])
    .map((a) => a.toLowerCase())
    .filter((a) => a.includes("@"));

  const plain = (parsed.text ?? "").trim();
  const bodyMarkdown = plain
    ? plain
    : parsed.html
      ? (await htmlToMarkdown(parsed.html)).trim()
      : "";

  const rawId = (parsed.messageId ?? "").replace(/[<>]/g, "").trim();
  const messageId = rawId || `uid-${ctx.uid}`;

  return {
    messageId,
    from: parsed.fromText ?? "",
    toAddresses,
    subject: parsed.subject ?? "(no subject)",
    date: (parsed.date ?? new Date()).toISOString().slice(0, 10),
    bodyMarkdown,
    attachments: (parsed.attachments ?? [])
      .filter((a) => a.filename)
      .map((a) => ({
        filename: a.filename!,
        mimeType: a.contentType ?? "application/octet-stream",
        content: a.content,
      })),
    sourceRef: `imap://${ctx.user}@${ctx.host}/${ctx.mailbox}/${ctx.uid}`,
  };
}

/** Flatten mailparser's AddressObject | AddressObject[] | undefined to addresses. */
function flattenAddresses(
  field:
    | { value?: Array<{ address?: string | undefined }> }
    | Array<{ value?: Array<{ address?: string | undefined }> }>
    | undefined
): string[] {
  if (!field) return [];
  const objects = Array.isArray(field) ? field : [field];
  return objects
    .flatMap((o) => o.value ?? [])
    .map((a) => (a.address ?? "").toLowerCase())
    .filter((a) => a.includes("@"));
}

/**
 * Sync a whole IMAP mailbox (any provider). Each message is parsed, routed to a
 * customer — by a fixed `slug` or auto-routed by sender/recipient domain — and
 * ingested through the shared pipeline (attachments→Markdown, summary, index).
 * Messages that match no customer are counted as `unrouted` and skipped.
 */
export async function syncImapMailbox(opts: SyncImapOptions): Promise<SyncImapResult> {
  const result: SyncImapResult = { synced: 0, skipped: 0, unrouted: 0 };
  const mailbox = opts.config.mailbox ?? "INBOX";
  const { simpleParser } = await import("mailparser");

  const client = opts.clientFactory
    ? opts.clientFactory(opts.config)
    : await defaultClientFactory(opts.config);

  // Routing table (auto-route mode) + per-slug dedup cache.
  const table = opts.slug ? null : buildRoutingTable(opts.dataDir);
  const dedupCache = new Map<string, string>();
  const seen = async (slug: string, sourceRef: string): Promise<boolean> => {
    let content = dedupCache.get(slug);
    if (content === undefined) {
      content = await readInteractions(opts.dataDir, slug).catch(() => "");
      dedupCache.set(slug, content);
    }
    return content.includes(sourceRef);
  };

  await client.connect();
  const lock = await client.getMailboxLock(mailbox);
  try {
    const range = opts.since ? { since: opts.since } : { all: true };
    for await (const message of client.fetch(range, { uid: true, source: true })) {
      try {
        const parsed = await simpleParser(message.source);
        const msg = await normalizeParsedEmail(
          {
            messageId: parsed.messageId,
            fromText: parsed.from?.text,
            toAddresses: [...flattenAddresses(parsed.to), ...flattenAddresses(parsed.cc)],
            subject: parsed.subject,
            date: parsed.date,
            text: parsed.text,
            html: parsed.html,
            attachments: parsed.attachments,
          },
          {
            user: opts.config.auth.user,
            host: opts.config.host,
            mailbox,
            uid: message.uid,
          }
        );

        // Route: fixed slug, or auto-route by any from/to/cc domain.
        let slug = opts.slug ?? null;
        if (!slug && table) {
          const fromAddr = (msg.from.match(/<([^>]+)>/)?.[1] ?? msg.from).toLowerCase();
          const addresses = [fromAddr, ...msg.toAddresses].filter((a) => domainOf(a));
          slug = routeMessage(addresses, table);
        }
        if (!slug) {
          result.unrouted++;
          continue;
        }

        if (await seen(slug, msg.sourceRef)) {
          result.skipped++;
          continue;
        }

        await ingestEmail(opts.dataDir, slug, msg, {
          ...(opts.includeAttachments !== undefined
            ? { includeAttachments: opts.includeAttachments }
            : {}),
          ...(opts.maxAttachmentBytes !== undefined
            ? { maxAttachmentBytes: opts.maxAttachmentBytes }
            : {}),
          direction: directionFor(msg, opts.config.auth.user),
        });
        dedupCache.set(slug, (dedupCache.get(slug) ?? "") + msg.sourceRef);
        result.synced++;
      } catch (err) {
        logger.warn("imap-sync", "message failed", {
          uid: message.uid,
          error: (err as Error).message,
        });
        result.skipped++;
      }
    }
  } finally {
    lock.release();
    await client.logout().catch(() => undefined);
  }

  return result;
}

/** Inbound unless the mailbox owner is the sender. */
function directionFor(msg: NormalizedEmail, user: string): "inbound" | "outbound" {
  const fromAddr = (msg.from.match(/<([^>]+)>/)?.[1] ?? msg.from).toLowerCase();
  return fromAddr === user.toLowerCase() ? "outbound" : "inbound";
}
