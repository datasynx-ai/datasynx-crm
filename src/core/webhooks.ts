import { createHash, createHmac, randomBytes } from "crypto";
import path from "path";
import { readJsonArray as readJson, writeJsonArray as writeJson } from "../fs/json-store.js";

/**
 * Outbound webhooks (event-driven architecture, N5-2). Subscriptions live in
 * .agentic/webhooks.json; failed deliveries are queued in
 * .agentic/webhook-failures.json (replay store) and re-attempted by
 * retryFailures (e.g. from the daemon) — backoff via periodic replay.
 */
export interface WebhookSubscription {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  createdAt: string;
}

export interface WebhookFailure {
  id: string;
  subscriptionId: string;
  url: string;
  secret?: string;
  event: string;
  payload: unknown;
  attempts: number;
  lastError: string;
  queuedAt: string;
}

function subsPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "webhooks.json");
}
function failuresPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "webhook-failures.json");
}

export function loadWebhooks(dataDir: string): WebhookSubscription[] {
  return readJson<WebhookSubscription>(subsPath(dataDir), "subscriptions");
}

export function addWebhook(
  dataDir: string,
  url: string,
  events: string[],
  secret?: string
): WebhookSubscription {
  const sub: WebhookSubscription = {
    id: `wh_${randomBytes(5).toString("hex")}`,
    url,
    events,
    ...(secret ? { secret } : {}),
    createdAt: new Date().toISOString(),
  };
  writeJson(subsPath(dataDir), "subscriptions", [...loadWebhooks(dataDir), sub]);
  return sub;
}

export function removeWebhook(dataDir: string, id: string): boolean {
  const subs = loadWebhooks(dataDir);
  const next = subs.filter((s) => s.id !== id);
  if (next.length === subs.length) return false;
  writeJson(subsPath(dataDir), "subscriptions", next);
  return true;
}

/** A subscription matches an event by exact name, "*", or a "prefix.*" pattern. */
export function matchSubscriptions(
  subs: WebhookSubscription[],
  event: string
): WebhookSubscription[] {
  return subs.filter((s) =>
    s.events.some((pat) => {
      if (pat === "*" || pat === event) return true;
      if (pat.endsWith(".*")) return event.startsWith(pat.slice(0, -1));
      return false;
    })
  );
}

export function signPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function loadFailures(dataDir: string): WebhookFailure[] {
  return readJson<WebhookFailure>(failuresPath(dataDir), "failures");
}

async function deliver(
  sub: WebhookSubscription,
  event: string,
  payload: unknown
): Promise<{ ok: boolean; error?: string }> {
  const body = JSON.stringify({ event, payload, deliveredAt: new Date().toISOString() });
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-DXCRM-Event": event,
  };
  if (sub.secret) headers["X-DXCRM-Signature"] = `sha256=${signPayload(sub.secret, body)}`;
  try {
    const res = (await fetch(sub.url, { method: "POST", headers, body })) as {
      ok: boolean;
      status: number;
    };
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Emit an event to all matching subscriptions; queue failures for replay. */
export async function emitEvent(dataDir: string, event: string, payload: unknown): Promise<void> {
  const matched = matchSubscriptions(loadWebhooks(dataDir), event);
  if (matched.length === 0) return;
  const failures = loadFailures(dataDir);
  for (const sub of matched) {
    const r = await deliver(sub, event, payload);
    if (!r.ok) {
      failures.push({
        id: `whf_${createHash("sha256").update(`${sub.id}:${event}:${Date.now()}`).digest("hex").slice(0, 10)}`,
        subscriptionId: sub.id,
        url: sub.url,
        ...(sub.secret ? { secret: sub.secret } : {}),
        event,
        payload,
        attempts: 1,
        lastError: r.error ?? "unknown",
        queuedAt: new Date().toISOString(),
      });
    }
  }
  if (failures.length > 0) writeJson(failuresPath(dataDir), "failures", failures);
}

/** Re-attempt queued failures; remove on success, increment attempts on failure. */
export async function retryFailures(
  dataDir: string
): Promise<{ retried: number; stillFailing: number }> {
  const failures = loadFailures(dataDir);
  const remaining: WebhookFailure[] = [];
  let retried = 0;
  for (const f of failures) {
    const sub: WebhookSubscription = {
      id: f.subscriptionId,
      url: f.url,
      events: [f.event],
      ...(f.secret ? { secret: f.secret } : {}),
      createdAt: f.queuedAt,
    };
    const r = await deliver(sub, f.event, f.payload);
    if (r.ok) retried++;
    else remaining.push({ ...f, attempts: f.attempts + 1, lastError: r.error ?? "unknown" });
  }
  writeJson(failuresPath(dataDir), "failures", remaining);
  return { retried, stillFailing: remaining.length };
}
