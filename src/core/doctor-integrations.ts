import fs from "fs";
import path from "path";

/**
 * Per-provider integration checks for `dxcrm doctor --integrations` (#64).
 * Answers, for each live path, "is this actually wired up?" — with a concrete
 * cause when it isn't. Local-first semantics: an unconfigured provider is
 * `off` (fine, not an error); `warn` means *inconsistent* configuration or a
 * failed live probe; `ok` means ready (and verified with `--live`).
 */

export type IntegrationStatus = "ok" | "warn" | "off";

export interface IntegrationCheck {
  provider: string;
  status: IntegrationStatus;
  detail: string;
  /** What to do next — shown for warn/off. */
  hint?: string;
}

export interface IntegrationCheckOptions {
  /** Probe the real APIs (network!) instead of config-only checks. */
  live?: boolean;
  fetchFn?: typeof fetch;
  /** Defaults to process.env; injected in tests. */
  env?: NodeJS.ProcessEnv;
}

function readTokenFile(dataDir: string, file: string): string | null {
  const p = path.join(dataDir, ".agentic", file);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8") as string) as {
      accessToken?: string;
      access_token?: string;
    };
    return raw.accessToken ?? raw.access_token ?? null;
  } catch {
    return null;
  }
}

async function probe(
  fetchFn: typeof fetch,
  url: string,
  headers: Record<string, string>
): Promise<{ ok: boolean; status: number }> {
  try {
    const res = await fetchFn(url, { headers });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** Integration secrets the live paths resolve via env → vault (#72). */
const VAULT_BACKED_SECRETS = [
  "MS_GRAPH_CLIENT_STATE",
  "WHATSAPP_TOKEN",
  "WHATSAPP_PHONE_ID",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
  "STRIPE_API_KEY",
  "STRIPE_WEBHOOK_SECRET",
] as const;

export async function runIntegrationChecks(
  dataDir: string,
  opts: IntegrationCheckOptions = {}
): Promise<IntegrationCheck[]> {
  const rawEnv = opts.env ?? process.env;
  // Mirror the live paths' env → vault resolution (#72): a secret entered via
  // the vault GUI must turn the corresponding readiness check green.
  const { resolveSecret } = await import("./secrets.js");
  const env: NodeJS.ProcessEnv = { ...rawEnv };
  for (const name of VAULT_BACKED_SECRETS) {
    if (!env[name]) {
      const fromVault = resolveSecret(dataDir, name, rawEnv);
      if (fromVault) env[name] = fromVault;
    }
  }
  const fetchFn = opts.fetchFn ?? fetch;
  const live = opts.live ?? false;
  const checks: IntegrationCheck[] = [];

  // ── Public URL — prerequisite for webhooks, widget, portal/booking links ──
  const publicUrl = env["DXCRM_PUBLIC_URL"];
  checks.push(
    publicUrl
      ? { provider: "public-url", status: "ok", detail: publicUrl }
      : {
          provider: "public-url",
          status: "off",
          detail: "DXCRM_PUBLIC_URL not set",
          hint: "Set it to the server's public base URL — webhooks, chat widget and portal links need it.",
        }
  );

  // ── Gmail (legacy customer sync) ──────────────────────────────────────────
  const gmailCreds = fs.existsSync(path.join(dataDir, ".agentic", "gmail-credentials.json"));
  const gmailToken = fs.existsSync(path.join(dataDir, ".agentic", "gmail-token.json"));
  if (!gmailCreds && !gmailToken) {
    checks.push({
      provider: "gmail",
      status: "off",
      detail: "no gmail-credentials.json / gmail-token.json",
      hint: "See docs/quickstart-real.md to connect Gmail.",
    });
  } else if (gmailCreds && gmailToken) {
    checks.push({ provider: "gmail", status: "ok", detail: "credentials + token present" });
  } else {
    checks.push({
      provider: "gmail",
      status: "warn",
      detail: `only ${gmailCreds ? "gmail-credentials.json" : "gmail-token.json"} present — sync will be skipped`,
      hint: "Re-run the Gmail OAuth flow to write both files.",
    });
  }

  // ── Mailbox OAuth accounts (multi-account inbox) ──────────────────────────
  try {
    const { listMailboxTokens, isTokenExpired } = await import("../sync/oauth/token-store.js");
    const tokens = listMailboxTokens(dataDir);
    if (tokens.length > 0) {
      const expired = tokens.filter((t) => isTokenExpired(t));
      checks.push({
        provider: "mailboxes",
        status: expired.length > 0 ? "warn" : "ok",
        detail:
          expired.length > 0
            ? `${expired.length} of ${tokens.length} mailbox token(s) expired`
            : `${tokens.length} mailbox account(s) connected`,
        ...(expired.length > 0
          ? { hint: "dxcrm mailbox connect <provider> to refresh the expired account(s)." }
          : {}),
      });
    } else {
      checks.push({
        provider: "mailboxes",
        status: "off",
        detail: "no mailbox accounts connected",
        hint: "dxcrm mailbox connect gmail|microsoft|imap",
      });
    }
  } catch {
    /* token store unreadable → leave it out rather than fail the report */
  }

  // ── Microsoft Graph (Teams transcripts, Outlook calendar) ─────────────────
  const msToken = readTokenFile(dataDir, "microsoft-token.json");
  if (!msToken) {
    checks.push({
      provider: "microsoft-graph",
      status: "off",
      detail: "no .agentic/microsoft-token.json",
      hint: "Connect the Microsoft account (docs/integrations.md) for Teams transcripts & calendar.",
    });
  } else if (!env["MS_GRAPH_CLIENT_STATE"]) {
    checks.push({
      provider: "microsoft-graph",
      status: "warn",
      detail:
        "token present but MS_GRAPH_CLIENT_STATE unset — /webhooks/microsoft cannot verify notifications",
      hint: "Set MS_GRAPH_CLIENT_STATE before creating subscriptions (dxcrm transcripts subscribe teams).",
    });
  } else if (live) {
    const r = await probe(fetchFn, "https://graph.microsoft.com/v1.0/me", {
      Authorization: `Bearer ${msToken}`,
    });
    checks.push(
      r.ok
        ? { provider: "microsoft-graph", status: "ok", detail: "token verified against Graph /me" }
        : {
            provider: "microsoft-graph",
            status: "warn",
            detail: `Graph probe failed (HTTP ${r.status}) — token expired or missing scopes`,
            hint: "Re-run the Microsoft OAuth flow.",
          }
    );
  } else {
    checks.push({
      provider: "microsoft-graph",
      status: "ok",
      detail: "token + clientState present",
    });
  }

  // ── Google (Meet transcripts, Workspace Events, calendar) ─────────────────
  const gToken = readTokenFile(dataDir, "google-token.json");
  if (!gToken) {
    checks.push({
      provider: "google",
      status: "off",
      detail: "no .agentic/google-token.json",
      hint: "Connect the Google account (docs/integrations.md) for Meet transcripts & calendar.",
    });
  } else if (live) {
    const r = await probe(
      fetchFn,
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(gToken)}`,
      {}
    );
    checks.push(
      r.ok
        ? { provider: "google", status: "ok", detail: "token verified via tokeninfo" }
        : {
            provider: "google",
            status: "warn",
            detail: `tokeninfo probe failed (HTTP ${r.status}) — token expired`,
            hint: "Re-run the Google OAuth flow.",
          }
    );
  } else {
    checks.push({ provider: "google", status: "ok", detail: "token present" });
  }

  // ── WhatsApp Cloud API (#57) ───────────────────────────────────────────────
  const waVars = [
    "WHATSAPP_TOKEN",
    "WHATSAPP_PHONE_ID",
    "WHATSAPP_APP_SECRET",
    "WHATSAPP_VERIFY_TOKEN",
  ];
  const waMissing = waVars.filter((v) => !env[v]);
  if (waMissing.length === waVars.length) {
    checks.push({
      provider: "whatsapp",
      status: "off",
      detail: "no WHATSAPP_* env vars set",
      hint: "docs/integrations.md → WhatsApp (Meta Cloud API).",
    });
  } else if (waMissing.length > 0) {
    checks.push({
      provider: "whatsapp",
      status: "warn",
      detail: `partially configured — missing ${waMissing.join(", ")}`,
      hint: "All four vars are needed: inbound verification, signature check, and outbound replies.",
    });
  } else if (live) {
    const r = await probe(fetchFn, `https://graph.facebook.com/v19.0/${env["WHATSAPP_PHONE_ID"]}`, {
      Authorization: `Bearer ${env["WHATSAPP_TOKEN"]}`,
    });
    checks.push(
      r.ok
        ? {
            provider: "whatsapp",
            status: "ok",
            detail: "token verified against the phone-number endpoint",
          }
        : {
            provider: "whatsapp",
            status: "warn",
            detail: `Cloud API probe failed (HTTP ${r.status})`,
            hint: "Check WHATSAPP_TOKEN / WHATSAPP_PHONE_ID in the Meta app dashboard.",
          }
    );
  } else {
    checks.push({ provider: "whatsapp", status: "ok", detail: "all four WHATSAPP_* vars set" });
  }

  // ── Stripe (#49 quote-to-cash) ─────────────────────────────────────────────
  if (!env["STRIPE_API_KEY"]) {
    checks.push({
      provider: "stripe",
      status: "off",
      detail: "STRIPE_API_KEY not set — quotes go out without payment links",
      hint: "Optional: set STRIPE_API_KEY + STRIPE_WEBHOOK_SECRET for payment links & paid events.",
    });
  } else if (!env["STRIPE_WEBHOOK_SECRET"]) {
    checks.push({
      provider: "stripe",
      status: "warn",
      detail:
        "STRIPE_API_KEY set but STRIPE_WEBHOOK_SECRET missing — /webhooks/stripe cannot verify events",
      hint: "Add the webhook signing secret from the Stripe dashboard.",
    });
  } else if (live) {
    const r = await probe(fetchFn, "https://api.stripe.com/v1/account", {
      Authorization: `Bearer ${env["STRIPE_API_KEY"]}`,
    });
    checks.push(
      r.ok
        ? { provider: "stripe", status: "ok", detail: "key verified against /v1/account" }
        : {
            provider: "stripe",
            status: "warn",
            detail: `Stripe probe failed (HTTP ${r.status})`,
            hint: "Check the API key (live vs. test mode).",
          }
    );
  } else {
    checks.push({ provider: "stripe", status: "ok", detail: "API key + webhook secret set" });
  }

  // ── Slack (notifications + inbound events) ────────────────────────────────
  const slackBot = env["SLACK_BOT_TOKEN"];
  const slackSigning = env["SLACK_SIGNING_SECRET"];
  if (!slackBot && !slackSigning) {
    checks.push({ provider: "slack", status: "off", detail: "no SLACK_* env vars set" });
  } else if (!slackBot || !slackSigning) {
    checks.push({
      provider: "slack",
      status: "warn",
      detail: `missing ${!slackBot ? "SLACK_BOT_TOKEN" : "SLACK_SIGNING_SECRET"}`,
      hint: "Both are needed: signing secret verifies inbound events, bot token sends messages.",
    });
  } else {
    checks.push({ provider: "slack", status: "ok", detail: "bot token + signing secret set" });
  }

  // ── Telegram (agent notifications) ────────────────────────────────────────
  if (!env["TELEGRAM_BOT_TOKEN"]) {
    checks.push({ provider: "telegram", status: "off", detail: "TELEGRAM_BOT_TOKEN not set" });
  } else if (live) {
    const r = await probe(
      fetchFn,
      `https://api.telegram.org/bot${env["TELEGRAM_BOT_TOKEN"]}/getMe`,
      {}
    );
    checks.push(
      r.ok
        ? { provider: "telegram", status: "ok", detail: "bot token verified via getMe" }
        : {
            provider: "telegram",
            status: "warn",
            detail: `getMe probe failed (HTTP ${r.status})`,
            hint: "Check the bot token with @BotFather.",
          }
    );
  } else {
    checks.push({ provider: "telegram", status: "ok", detail: "bot token set" });
  }

  // ── Push subscriptions (mailbox + transcripts) ────────────────────────────
  try {
    const { readSubscriptions } = await import("../sync/push-manager.js");
    const subs = await readSubscriptions(dataDir);
    if (subs.length > 0) {
      const now = Date.now();
      const bad = subs.filter(
        (s) =>
          s.status === "error" ||
          s.status === "permanently_failed" ||
          (s.status === "active" && s.expiresAt !== null && new Date(s.expiresAt).getTime() < now)
      );
      checks.push({
        provider: "push-subscriptions",
        status: bad.length > 0 ? "warn" : "ok",
        detail:
          bad.length > 0
            ? `${bad.length} of ${subs.length} subscription(s) need attention: ${bad
                .map((s) => `${s.id} (${s.status === "active" ? "expired" : s.status})`)
                .slice(0, 5)
                .join(", ")}`
            : `${subs.length} subscription(s) active`,
        ...(bad.length > 0
          ? {
              hint: "Re-create with dxcrm transcripts subscribe / push register; the daemon renews healthy ones daily.",
            }
          : {}),
      });
    }
  } catch {
    /* push store unreadable → omit */
  }

  return checks;
}
