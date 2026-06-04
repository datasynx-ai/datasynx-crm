// src/sync/mailbox-config.ts
// Mailbox connection resolution shared by the CLI command and the daemon.
import type { ImapMailboxConfig } from "./connectors/imap.js";

/** Default IMAP endpoints for OAuth providers. */
export const PROVIDER_IMAP_HOST: Record<"gmail" | "microsoft", { host: string; port: number }> = {
  gmail: { host: "imap.gmail.com", port: 993 },
  microsoft: { host: "outlook.office365.com", port: 993 },
};

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

/** Parse a "provider:user" account string. */
export function parseAccount(
  account: string
): { provider: "gmail" | "microsoft"; user: string } | null {
  const idx = account.indexOf(":");
  if (idx < 0) return null;
  const provider = account.slice(0, idx);
  const user = account.slice(idx + 1);
  if ((provider !== "gmail" && provider !== "microsoft") || !user) return null;
  return { provider, user };
}

/** Build an IMAP config for a stored OAuth account, refreshing the token if needed. */
export async function resolveAccountConfig(
  dataDir: string,
  account: string,
  env: NodeJS.ProcessEnv = process.env,
  mailbox?: string
): Promise<ImapMailboxConfig> {
  const parsed = parseAccount(account);
  if (!parsed) {
    throw new Error(
      `Invalid account '${account}'. Use 'gmail:you@gmail.com' or 'microsoft:you@org.com'.`
    );
  }
  const { getFreshAccessToken } = await import("./oauth/token-resolver.js");
  const accessToken = await getFreshAccessToken(dataDir, parsed.provider, parsed.user, { env });
  const { host, port } = PROVIDER_IMAP_HOST[parsed.provider];
  return {
    host,
    port,
    secure: true,
    mailbox: mailbox ?? env["DXCRM_IMAP_MAILBOX"] ?? "INBOX",
    auth: { user: parsed.user, accessToken },
  };
}
