import { readSubscriptions, writeSubscriptions, type PushSubscription } from "./push-manager.js";
import { appendInteraction } from "../fs/interactions-writer.js";
import type { TeamsDiscoverDeps } from "./transcript-discovery.js";

export interface MicrosoftGraphNotification {
  subscriptionId: string;
  clientState?: string;
  resource: string;
  resourceData?: { id: string; "@odata.type": string };
}

export function verifyMicrosoftGraphSignature(
  body: { value?: Array<Partial<MicrosoftGraphNotification>> },
  expectedClientState: string
): boolean {
  const notifications = body.value ?? [];
  if (notifications.length === 0) return expectedClientState === "";
  return notifications.every((n) => n.clientState === expectedClientState);
}

export interface ValidationResult {
  isValidation: boolean;
  token?: string;
}

export function handleMicrosoftValidationRequest(
  queryParams: Record<string, string | undefined>
): ValidationResult {
  const token = queryParams["validationToken"];
  if (token) return { isValidation: true, token };
  return { isValidation: false };
}

export interface GraphMessage {
  id: string;
  subject?: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  receivedDateTime?: string;
  bodyPreview?: string;
}

export type FetchGraphMessageFn = (
  accessToken: string,
  messageId: string
) => Promise<GraphMessage | null>;
export type AppendInteractionFn = typeof appendInteraction;

export interface HandleMicrosoftPushOptions {
  fetchMessageFn?: FetchGraphMessageFn;
  appendInteractionFn?: AppendInteractionFn;
  /** When present, transcript notifications (#56) are auto-discovered + routed. */
  transcriptDeps?: TeamsDiscoverDeps;
}

export { readSubscriptions };

function findSubscriptionByMsId(
  subs: PushSubscription[],
  subscriptionId: string
): PushSubscription | null {
  return (
    subs.find(
      (s) =>
        s.provider === "microsoft-graph" &&
        s.status === "active" &&
        s.providerData.microsoftSubscriptionId === subscriptionId
    ) ?? null
  );
}

export async function handleMicrosoftPushEvent(
  dataDir: string,
  notifications: MicrosoftGraphNotification[],
  accessToken: string,
  options: HandleMicrosoftPushOptions = {}
): Promise<{ processed: number; skipped: number }> {
  const subs = await readSubscriptions(dataDir);
  const { fetchMessageFn, appendInteractionFn = appendInteraction, transcriptDeps } = options;

  let processed = 0;
  let skipped = 0;
  let anyProcessed = false;

  for (const notification of notifications) {
    // Online-meeting transcript notifications (#56) are auto-discovered and
    // routed to a customer by their attendees — no slug needed up front.
    if (transcriptDeps) {
      const { isTeamsTranscriptResource, discoverTeamsTranscript } =
        await import("./transcript-discovery.js");
      if (isTeamsTranscriptResource(notification.resource)) {
        const result = await discoverTeamsTranscript(dataDir, notification, transcriptDeps);
        if (result.status === "routed") processed++;
        else skipped++;
        continue;
      }
    }

    const sub = findSubscriptionByMsId(subs, notification.subscriptionId);
    if (!sub) {
      skipped++;
      continue;
    }

    const messageId = notification.resourceData?.id;
    if (!messageId || !fetchMessageFn) {
      skipped++;
      continue;
    }

    try {
      const message = await fetchMessageFn(accessToken, messageId);
      if (!message) {
        skipped++;
        continue;
      }

      const from = message.from?.emailAddress?.address ?? "unknown";
      const sourceRef = `msgraph://message/${message.id}`;

      await appendInteractionFn(dataDir, sub.slug, {
        date: message.receivedDateTime
          ? new Date(message.receivedDateTime).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
        type: "Email",
        direction: "inbound",
        with: from,
        subject: message.subject ?? "(no subject)",
        summary: message.bodyPreview ?? "(no preview)",
        nextSteps: [],
        sourceRef,
        synced: new Date().toISOString(),
      });

      processed++;
      anyProcessed = true;

      // Update sub counters
      const idx = subs.findIndex((s) => s.id === sub.id);
      if (idx !== -1) {
        subs[idx] = {
          ...subs[idx]!,
          eventsProcessed: subs[idx]!.eventsProcessed + 1,
          lastEventAt: new Date().toISOString(),
        };
      }
    } catch {
      skipped++;
    }
  }

  if (anyProcessed) {
    await writeSubscriptions(dataDir, subs);
  }

  return { processed, skipped };
}
