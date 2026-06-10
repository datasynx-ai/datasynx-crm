import { register, type PushSubscription } from "./push-manager.js";
import type { RenewFn } from "./push-manager.js";
import { logger } from "../core/logger.js";

/**
 * Real subscription *creation* for transcript auto-discovery (#56 → #63).
 * #56 shipped receiving (webhook handlers) and renewal; this module closes the
 * loop by actually creating the Graph / Workspace-Events subscriptions and
 * registering them in the push-manager store. All network access is injected,
 * so the logic is fully testable and a clean no-op offline.
 */

type FetchFn = typeof fetch;

async function errorText(res: { status?: number; text?: () => Promise<string> }): Promise<string> {
  const body = res.text ? await res.text().catch(() => "") : "";
  return `${res.status ?? "?"}${body ? `: ${body.slice(0, 300)}` : ""}`;
}

// ─── Microsoft Teams (Graph change notifications) ──────────────────────────────

export interface TeamsSubscriptionOptions {
  dataDir: string;
  accessToken: string;
  /** Public base URL of this CRM server, e.g. https://crm.example.com */
  webhookBaseUrl: string;
  /** Echoed back by Graph on every notification; defaults to MS_GRAPH_CLIENT_STATE. */
  clientState?: string;
  /** Subscribe per-user instead of tenant-wide (communications scope). */
  userId?: string;
  fetchFn?: FetchFn;
}

// Graph caps getAllTranscripts subscriptions at 4230 minutes — stay below.
const GRAPH_TRANSCRIPT_EXPIRY_MINUTES = 4200;

/** Create a Graph subscription for new online-meeting transcripts. */
export async function createTeamsTranscriptSubscription(
  opts: TeamsSubscriptionOptions
): Promise<PushSubscription> {
  const fetchFn = opts.fetchFn ?? fetch;
  const base = opts.webhookBaseUrl.replace(/\/+$/, "");
  const resource = opts.userId
    ? `users/${opts.userId}/onlineMeetings/getAllTranscripts`
    : "communications/onlineMeetings/getAllTranscripts";
  const clientState = opts.clientState ?? process.env["MS_GRAPH_CLIENT_STATE"] ?? "";
  const expiration = new Date(Date.now() + GRAPH_TRANSCRIPT_EXPIRY_MINUTES * 60_000).toISOString();

  const res = await fetchFn("https://graph.microsoft.com/v1.0/subscriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      changeType: "created",
      notificationUrl: `${base}/webhooks/microsoft`,
      resource,
      expirationDateTime: expiration,
      clientState,
      includeResourceData: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`Graph subscription create failed: ${await errorText(res)}`);
  }
  const data = (await res.json()) as { id?: string; expirationDateTime?: string };

  const sub = await register(opts.dataDir, "microsoft-graph", "*", {
    webhookUrl: `${base}/webhooks/microsoft`,
    ...(data.expirationDateTime ? { expiresAt: data.expirationDateTime } : {}),
    providerData: {
      ...(data.id ? { microsoftSubscriptionId: data.id } : {}),
      microsoftResource: resource,
      ...(clientState ? { microsoftClientState: clientState } : {}),
    },
  });
  logger.info("subscription-create", "teams transcript subscription created", {
    id: sub.id,
    graphId: data.id,
    resource,
  });
  return sub;
}

// ─── Google Meet (Workspace Events API) ────────────────────────────────────────

export interface MeetSubscriptionOptions {
  dataDir: string;
  accessToken: string;
  /** Pub/Sub topic that pushes to <base>/webhooks/google. */
  pubsubTopic: string;
  /** Workspace-Events target; defaults to all meetings of the auth'd user. */
  targetResource?: string;
  fetchFn?: FetchFn;
}

const WORKSPACE_EVENTS_BASE = "https://workspaceevents.googleapis.com/v1";
const MEET_TRANSCRIPT_EVENT = "google.workspace.meet.transcript.v2.fileGenerated";
const WORKSPACE_TTL_SECONDS = 604_800; // 7 days — the Workspace Events maximum

/** Create a Workspace-Events subscription for generated Meet transcripts. */
export async function createMeetTranscriptSubscription(
  opts: MeetSubscriptionOptions
): Promise<PushSubscription> {
  const fetchFn = opts.fetchFn ?? fetch;
  const targetResource = opts.targetResource ?? "//cloudidentity.googleapis.com/users/me";

  const res = await fetchFn(`${WORKSPACE_EVENTS_BASE}/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      targetResource,
      eventTypes: [MEET_TRANSCRIPT_EVENT],
      notificationEndpoint: { pubsubTopic: opts.pubsubTopic },
      ttl: `${WORKSPACE_TTL_SECONDS}s`,
    }),
  });
  if (!res.ok) {
    throw new Error(`Workspace Events subscription create failed: ${await errorText(res)}`);
  }
  const data = (await res.json()) as { name?: string; expireTime?: string };

  const sub = await register(opts.dataDir, "google-workspace", "*", {
    webhookUrl: opts.pubsubTopic,
    ...(data.expireTime ? { expiresAt: data.expireTime } : {}),
    providerData: {
      ...(data.name ? { googleSubscriptionName: data.name } : {}),
      googleTargetResource: targetResource,
      googlePubsubTopic: opts.pubsubTopic,
    },
  });
  logger.info("subscription-create", "meet transcript subscription created", {
    id: sub.id,
    name: data.name,
    targetResource,
  });
  return sub;
}

/** A push-manager RenewFn that refreshes a Workspace-Events subscription's ttl. */
export function buildGoogleWorkspaceRenewFn(
  accessToken: string,
  fetchFn: FetchFn = fetch
): RenewFn {
  return async (sub) => {
    const name = sub.providerData.googleSubscriptionName;
    if (!name) throw new Error("subscription has no googleSubscriptionName");
    const res = await fetchFn(`${WORKSPACE_EVENTS_BASE}/${name}?updateMask=ttl`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ ttl: `${WORKSPACE_TTL_SECONDS}s` }),
    });
    if (!res.ok) throw new Error(`Workspace Events renew failed: ${await errorText(res)}`);
    const data = (await res.json()) as { expireTime?: string };
    return {
      expiresAt:
        data.expireTime ?? new Date(Date.now() + WORKSPACE_TTL_SECONDS * 1000).toISOString(),
    };
  };
}
