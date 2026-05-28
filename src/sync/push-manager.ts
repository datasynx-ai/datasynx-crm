import fs from "fs";
import path from "path";

export type PushProvider = "gmail" | "microsoft-graph" | "slack";
export type PushStatus = "active" | "expired" | "revoked" | "error" | "permanently_failed";

export interface PushSubscription {
  id: string;
  provider: PushProvider;
  slug: string;
  webhookUrl: string;
  expiresAt: string | null;
  renewedAt: string | null;
  createdAt: string;
  providerData: {
    gmailHistoryId?: string;
    gmailTopicName?: string;
    gmailLabelIds?: string[];
    gmailEmailAddress?: string;
    microsoftSubscriptionId?: string;
    microsoftResource?: string;
    microsoftClientState?: string;
    slackTeamId?: string;
    slackChannelId?: string;
    slackBotToken?: string;
  };
  status: PushStatus;
  lastEventAt: string | null;
  eventsProcessed: number;
  renewFailures?: number;
}

interface PushSubscriptionsFile {
  subscriptions: PushSubscription[];
  updatedAt: string;
}

export function makePushSubId(): string {
  return `psub_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

export function subscriptionsPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "push-subscriptions.json");
}

export async function readSubscriptions(dataDir: string): Promise<PushSubscription[]> {
  const filePath = subscriptionsPath(dataDir);
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf-8") as string;
    const parsed = JSON.parse(raw) as PushSubscriptionsFile;
    return parsed.subscriptions ?? [];
  } catch {
    return [];
  }
}

export async function writeSubscriptions(dataDir: string, subs: PushSubscription[]): Promise<void> {
  const filePath = subscriptionsPath(dataDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const file: PushSubscriptionsFile = { subscriptions: subs, updatedAt: new Date().toISOString() };
  fs.writeFileSync(filePath, JSON.stringify(file, null, 2), "utf-8");
}

function expiresAtForProvider(provider: PushProvider): string | null {
  if (provider === "gmail") {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (provider === "microsoft-graph") {
    return new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  }
  return null; // slack: no expiry
}

export async function register(
  dataDir: string,
  provider: PushProvider,
  slug: string,
  opts: { webhookUrl: string; providerData?: Partial<PushSubscription["providerData"]> }
): Promise<PushSubscription> {
  const subs = await readSubscriptions(dataDir);
  const sub: PushSubscription = {
    id: makePushSubId(),
    provider,
    slug,
    webhookUrl: opts.webhookUrl,
    expiresAt: expiresAtForProvider(provider),
    renewedAt: null,
    createdAt: new Date().toISOString(),
    providerData: opts.providerData ?? {},
    status: "active",
    lastEventAt: null,
    eventsProcessed: 0,
  };
  await writeSubscriptions(dataDir, [...subs, sub]);
  return sub;
}

export async function revoke(dataDir: string, id: string): Promise<void> {
  const subs = await readSubscriptions(dataDir);
  const idx = subs.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error(`Subscription ${id} not found`);
  subs[idx] = { ...subs[idx]!, status: "revoked" };
  await writeSubscriptions(dataDir, subs);
}

export type RenewFn = (
  sub: PushSubscription
) => Promise<{ expiresAt: string; providerData?: Partial<PushSubscription["providerData"]> }>;

export async function renewExpiringSubscriptions(
  dataDir: string,
  renewFn: RenewFn,
  thresholdHours = 24
): Promise<{ renewed: string[]; errors: string[] }> {
  const subs = await readSubscriptions(dataDir);
  const thresholdMs = thresholdHours * 60 * 60 * 1000;
  const cutoff = Date.now() + thresholdMs;

  const renewed: string[] = [];
  const errors: string[] = [];

  const PERMANENT_FAILURE_THRESHOLD = 3;

  for (let i = 0; i < subs.length; i++) {
    const sub = subs[i]!;
    if (sub.status !== "active" && sub.status !== "error") continue;
    if (sub.expiresAt === null) continue; // slack: no expiry
    if (new Date(sub.expiresAt).getTime() > cutoff) continue;

    try {
      const result = await renewFn(sub);
      subs[i] = {
        ...sub,
        status: "active",
        expiresAt: result.expiresAt,
        renewedAt: new Date().toISOString(),
        renewFailures: 0,
        providerData: result.providerData
          ? { ...sub.providerData, ...result.providerData }
          : sub.providerData,
      };
      renewed.push(sub.id);
    } catch {
      const failures = (sub.renewFailures ?? 0) + 1;
      const newStatus: PushStatus = failures >= PERMANENT_FAILURE_THRESHOLD
        ? "permanently_failed"
        : "error";
      subs[i] = { ...sub, status: newStatus, renewFailures: failures };
      errors.push(sub.id);
    }
  }

  await writeSubscriptions(dataDir, subs);
  return { renewed, errors };
}
