import {
  readSubscriptions,
  writeSubscriptions,
  type PushSubscription,
  type RenewFn,
} from "./push-manager.js";
import { updateSlugSyncState, readSyncState } from "../fs/sync-state.js";
import { appendInteraction } from "../fs/interactions-writer.js";
import type { HistoryMessage, WatchRegistration } from "./gmail-push-watch.js";

export interface GmailPubSubMessage {
  emailAddress: string;
  historyId: string;
}

export function decodeGmailPubSubPayload(body: unknown): GmailPubSubMessage | null {
  try {
    const b = body as { message?: { data?: string } };
    const data = b?.message?.data;
    if (!data) return null;
    const decoded = Buffer.from(data, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded) as { emailAddress?: string; historyId?: string };
    if (!parsed.emailAddress || !parsed.historyId) return null;
    return { emailAddress: parsed.emailAddress, historyId: parsed.historyId };
  } catch {
    return null;
  }
}

export function verifyGmailPubSubSignature(
  authHeader: string | undefined,
  expectedToken: string
): boolean {
  if (!authHeader) return false;
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  return token === expectedToken;
}

function findSubscriptionByEmail(
  subs: PushSubscription[],
  emailAddress: string
): PushSubscription | null {
  return (
    subs.find(
      (s) =>
        s.provider === "gmail" &&
        s.status === "active" &&
        (s.providerData.gmailEmailAddress === emailAddress || s.slug === emailAddress)
    ) ?? null
  );
}

export type FetchHistoryFn = (
  accessToken: string,
  startHistoryId: string
) => Promise<HistoryMessage[]>;
export type FetchMessageFn = (
  accessToken: string,
  messageId: string
) => Promise<{
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  body: string;
}>;
export type AppendInteractionFn = typeof appendInteraction;

export interface HandleGmailPushOptions {
  fetchHistoryFn?: FetchHistoryFn;
  fetchMessageFn?: FetchMessageFn;
  appendInteractionFn?: AppendInteractionFn;
  accessToken?: string;
}

export { readSubscriptions };

export async function handleGmailPushEvent(
  dataDir: string,
  payload: GmailPubSubMessage,
  subscriptionId: string,
  options: HandleGmailPushOptions = {}
): Promise<{ processed: number; slug: string | null }> {
  const subs = await readSubscriptions(dataDir);
  const sub = findSubscriptionByEmail(subs, payload.emailAddress);
  if (!sub) return { processed: 0, slug: null };

  const slug = sub.slug;
  const syncState = readSyncState(dataDir);
  const lastHistoryId =
    syncState[slug]?.lastGmailPushHistoryId ?? sub.providerData.gmailHistoryId ?? "0";

  // Skip if already processed
  if (BigInt(payload.historyId) <= BigInt(lastHistoryId)) {
    return { processed: 0, slug };
  }

  const startHistoryId = sub.providerData.gmailHistoryId ?? lastHistoryId;

  const {
    fetchHistoryFn,
    fetchMessageFn,
    appendInteractionFn = appendInteraction,
    accessToken = "",
  } = options;

  if (!fetchHistoryFn) return { processed: 0, slug };

  const messages = await fetchHistoryFn(accessToken, startHistoryId);
  let processed = 0;

  for (const msg of messages) {
    if (!fetchMessageFn) continue;
    try {
      const full = await fetchMessageFn(accessToken, msg.id);
      const sourceRef = `gmail://thread/${full.threadId}`;

      await appendInteractionFn(dataDir, slug, {
        date: new Date().toISOString().slice(0, 10),
        type: "Email",
        direction: "inbound",
        with: full.from,
        subject: full.subject,
        summary: full.body.slice(0, 300) || "(no body)",
        nextSteps: [],
        sourceRef,
        synced: new Date().toISOString(),
      });
      // Email engagement (#45): mark a prior outbound on this thread as replied
      // and record reply latency — no pixel required.
      try {
        const { correlateReply } = await import("./../fs/sent-store.js");
        const reply = correlateReply(dataDir, {
          threadId: full.threadId,
          from: full.from,
          at: full.date || new Date().toISOString(),
        });
        if (reply) {
          // Event for workflow automation (#48), e.g. "on reply, create a task".
          const { emitEvent } = await import("../core/webhooks.js");
          await emitEvent(dataDir, "email.replied", reply).catch(() => undefined);
        }
      } catch {
        // tracking is best-effort; never block inbound sync
      }
      processed++;
    } catch {
      // Skip individual message errors
    }
  }

  // Update sync state
  updateSlugSyncState(dataDir, slug, { lastGmailPushHistoryId: payload.historyId });

  // Update subscription counters
  const subIdx = subs.findIndex((s) => s.id === sub.id);
  if (subIdx !== -1) {
    subs[subIdx] = {
      ...subs[subIdx]!,
      eventsProcessed: subs[subIdx]!.eventsProcessed + 1,
      lastEventAt: new Date().toISOString(),
    };
    await writeSubscriptions(dataDir, subs);
  }

  return { processed, slug };
}

export type RegisterGmailWatchFn = (
  accessToken: string,
  topicName: string
) => Promise<WatchRegistration>;

export function buildGmailRenewFn(
  accessToken: string,
  topicName: string,
  registerFn?: RegisterGmailWatchFn
): RenewFn {
  return async (_sub: PushSubscription) => {
    const doRegister: RegisterGmailWatchFn =
      registerFn ??
      (async (token: string, topic: string) => {
        const { registerGmailWatch } = await import("./gmail-push-watch.js");
        return registerGmailWatch(token, topic);
      });

    const registration = await doRegister(accessToken, topicName);
    return {
      expiresAt: new Date(Number(registration.expiration)).toISOString(),
      providerData: { gmailHistoryId: registration.historyId },
    };
  };
}
