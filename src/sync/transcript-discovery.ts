import { buildRoutingTable, routeMessage } from "./email-router.js";
import { appendUnmatched } from "../fs/unmatched-transcripts.js";
import { emitEvent } from "../core/webhooks.js";
import { logger } from "../core/logger.js";
import type { MicrosoftGraphNotification } from "./microsoft-webhook-handler.js";
import type { TeamsTranscriptOptions } from "./microsoft-teams-transcripts.js";
import type { MeetSyncOptions } from "./google-meet-sync.js";
import type { RenewFn, PushSubscription } from "./push-manager.js";

/**
 * Auto-discovery & customer routing for online-meeting transcripts (#56). After
 * a Teams/Meet call, a webhook (or the poll fallback) hands us a transcript
 * reference; we resolve the meeting's attendees, route them to a customer via
 * the existing email-router, and feed the existing transcript sync with the
 * resolved slug — no manual IDs. Unroutable transcripts land in the unmatched
 * queue. All network access is injected so the logic is fully testable and a
 * clean no-op offline.
 */

// ─── Teams resource parsing ─────────────────────────────────────────────────

export interface TeamsTranscriptRef {
  userId?: string;
  meetingId: string;
  transcriptId?: string;
}

export function isTeamsTranscriptResource(resource: string): boolean {
  return resource.includes("onlineMeetings") && resource.includes("transcripts");
}

/** Extract the ids from a Graph transcript resource path (key('id') or /id/). */
export function parseTeamsTranscriptResource(resource: string): TeamsTranscriptRef | null {
  if (!isTeamsTranscriptResource(resource)) return null;
  const pick = (key: string): string | undefined =>
    resource.match(new RegExp(`${key}\\('([^']+)'\\)`))?.[1] ??
    resource.match(new RegExp(`${key}/([^/]+)`))?.[1];
  const meetingId = pick("onlineMeetings");
  if (!meetingId) return null;
  const userId = pick("users");
  const transcriptId = pick("transcripts");
  return {
    ...(userId ? { userId } : {}),
    meetingId,
    ...(transcriptId ? { transcriptId } : {}),
  };
}

/**
 * Extract the conferenceRecord id from a Google Workspace-Events
 * `transcript.fileGenerated` payload. The transcript resource name embeds it
 * as `conferenceRecords/<id>/transcripts/<id>`; we read it shape-agnostically.
 */
export function extractConferenceRecordId(payload: unknown): string | null {
  const json = JSON.stringify(payload ?? {});
  const m = json.match(/conferenceRecords\/([A-Za-z0-9_-]+)/);
  return m ? `conferenceRecords/${m[1]}` : null;
}

// ─── Routing ────────────────────────────────────────────────────────────────

/** Map a set of attendee emails to a customer slug, or null when none match. */
export function routeByAttendees(dataDir: string, emails: string[]): string | null {
  if (emails.length === 0) return null;
  return routeMessage(emails, buildRoutingTable(dataDir));
}

export type DiscoverStatus = "routed" | "unmatched" | "skipped";
export interface DiscoverResult {
  status: DiscoverStatus;
  slug?: string;
  meetingId?: string;
}

// ─── Teams discovery ──────────────────────────────────────────────────────────

export interface TeamsDiscoverDeps {
  accessToken: string;
  /** Resolve the meeting's attendee emails (Graph onlineMeeting participants). */
  fetchAttendees: (ref: TeamsTranscriptRef, accessToken: string) => Promise<string[]>;
  /** Defaults to the real syncTeamsTranscript. */
  syncTeams?: (opts: TeamsTranscriptOptions) => Promise<{ synced: boolean; error?: string }>;
  /** Fallback user id when the resource is communications-scoped. */
  userId?: string;
}

export async function discoverTeamsTranscript(
  dataDir: string,
  notification: Pick<MicrosoftGraphNotification, "resource" | "resourceData" | "subscriptionId">,
  deps: TeamsDiscoverDeps
): Promise<DiscoverResult> {
  const ref = parseTeamsTranscriptResource(notification.resource);
  if (!ref) return { status: "skipped" };

  const emails = await deps.fetchAttendees(ref, deps.accessToken).catch(() => []);
  if (emails.length === 0) {
    logger.info("transcript-discovery", "teams transcript without attendees — skipped", {
      meetingId: ref.meetingId,
    });
    return { status: "skipped", meetingId: ref.meetingId };
  }

  const slug = routeByAttendees(dataDir, emails);
  if (!slug) {
    const unmatchedRef = `teams://onlineMeetings/${ref.meetingId}`;
    appendUnmatched(dataDir, {
      filePath: unmatchedRef,
      addedAt: new Date().toISOString(),
      reason: "no_customer_match",
    });
    await emitEvent(dataDir, "transcript.unmatched", {
      source: "teams",
      ref: unmatchedRef,
      reason: "no_customer_match",
    }).catch(() => undefined);
    logger.info("transcript-discovery", "teams transcript unmatched", { meetingId: ref.meetingId });
    return { status: "unmatched", meetingId: ref.meetingId };
  }

  const syncTeams =
    deps.syncTeams ??
    (async (opts: TeamsTranscriptOptions) => {
      const { syncTeamsTranscript } = await import("./microsoft-teams-transcripts.js");
      return syncTeamsTranscript(opts);
    });

  await syncTeams({
    userId: ref.userId ?? deps.userId ?? "me",
    meetingId: ref.meetingId,
    slug,
    dataDir,
    accessToken: deps.accessToken,
  }).catch((err) => {
    logger.warn("transcript-discovery", "teams sync failed", {
      meetingId: ref.meetingId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { synced: false };
  });

  await emitEvent(dataDir, "meeting.transcribed", {
    slug,
    source: "teams",
    sourceRef: `microsoft://teams/meeting/${ref.meetingId}`,
    meetingId: ref.meetingId,
  }).catch(() => undefined);

  logger.info("transcript-discovery", "teams transcript routed", {
    meetingId: ref.meetingId,
    slug,
  });
  return { status: "routed", slug, meetingId: ref.meetingId };
}

// ─── Meet discovery ───────────────────────────────────────────────────────────

export interface MeetTranscriptEvent {
  conferenceRecordId: string;
}

export interface MeetDiscoverDeps {
  accessToken: string;
  fetchAttendees: (conferenceRecordId: string, accessToken: string) => Promise<string[]>;
  syncMeet?: (opts: MeetSyncOptions) => Promise<{ synced: boolean; error?: string }>;
}

export async function discoverMeetTranscript(
  dataDir: string,
  event: MeetTranscriptEvent,
  deps: MeetDiscoverDeps
): Promise<DiscoverResult> {
  if (!event.conferenceRecordId) return { status: "skipped" };

  const emails = await deps
    .fetchAttendees(event.conferenceRecordId, deps.accessToken)
    .catch(() => []);
  if (emails.length === 0) return { status: "skipped" };

  const slug = routeByAttendees(dataDir, emails);
  if (!slug) {
    const unmatchedRef = `meet://${event.conferenceRecordId}`;
    appendUnmatched(dataDir, {
      filePath: unmatchedRef,
      addedAt: new Date().toISOString(),
      reason: "no_customer_match",
    });
    await emitEvent(dataDir, "transcript.unmatched", {
      source: "meet",
      ref: unmatchedRef,
      reason: "no_customer_match",
    }).catch(() => undefined);
    logger.info("transcript-discovery", "meet transcript unmatched", {
      conferenceRecordId: event.conferenceRecordId,
    });
    return { status: "unmatched" };
  }

  const syncMeet =
    deps.syncMeet ??
    (async (opts: MeetSyncOptions) => {
      const { syncGoogleMeetTranscript } = await import("./google-meet-sync.js");
      return syncGoogleMeetTranscript(opts);
    });

  await syncMeet({
    conferenceRecordId: event.conferenceRecordId,
    slug,
    dataDir,
    accessToken: deps.accessToken,
  }).catch(() => ({ synced: false }));

  await emitEvent(dataDir, "meeting.transcribed", {
    slug,
    source: "meet",
    sourceRef: `google://meet/${event.conferenceRecordId}`,
    conferenceRecordId: event.conferenceRecordId,
  }).catch(() => undefined);

  logger.info("transcript-discovery", "meet transcript routed", {
    conferenceRecordId: event.conferenceRecordId,
    slug,
  });
  return { status: "routed", slug };
}

// ─── Attendee resolution (best-effort, offline → []) ──────────────────────────

type FetchFnLoose = (
  url: string,
  init?: unknown
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/**
 * Recursively collect every email-looking string from an API payload. Graph and
 * Meet expose attendees under varying shapes (upn, identity.user.email, …); a
 * shape-agnostic harvest is the most robust way to feed the email-router.
 */
export function harvestEmails(obj: unknown): string[] {
  const out = new Set<string>();
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const walk = (v: unknown): void => {
    if (typeof v === "string") {
      if (re.test(v)) out.add(v.toLowerCase());
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === "object") {
      Object.values(v as Record<string, unknown>).forEach(walk);
    }
  };
  walk(obj);
  return [...out];
}

/** Resolve Teams meeting attendee emails from the Graph onlineMeeting resource. */
export async function fetchTeamsAttendees(
  ref: TeamsTranscriptRef,
  accessToken: string,
  fetchFn: FetchFnLoose = fetch as unknown as FetchFnLoose
): Promise<string[]> {
  const base = ref.userId
    ? `https://graph.microsoft.com/v1.0/users/${ref.userId}/onlineMeetings/${ref.meetingId}`
    : `https://graph.microsoft.com/v1.0/communications/onlineMeetings/${ref.meetingId}`;
  try {
    const res = await fetchFn(base, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      // Contract stays []/skip, but the cause must be visible to operators (#67).
      logger.warn("transcript-discovery", "teams attendee lookup failed", {
        meetingId: ref.meetingId,
        status: (res as { status?: number }).status,
      });
      return [];
    }
    return harvestEmails(await res.json());
  } catch (err) {
    logger.warn("transcript-discovery", "teams attendee lookup failed", {
      meetingId: ref.meetingId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/** Resolve Meet attendee emails from the conferenceRecord participants. */
export async function fetchMeetAttendees(
  conferenceRecordId: string,
  accessToken: string,
  fetchFn: FetchFnLoose = fetch as unknown as FetchFnLoose
): Promise<string[]> {
  const url = `https://meet.googleapis.com/v2/${conferenceRecordId}/participants`;
  try {
    const res = await fetchFn(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      logger.warn("transcript-discovery", "meet attendee lookup failed", {
        conferenceRecordId,
        status: (res as { status?: number }).status,
      });
      return [];
    }
    return harvestEmails(await res.json());
  } catch (err) {
    logger.warn("transcript-discovery", "meet attendee lookup failed", {
      conferenceRecordId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// ─── Poll fallbacks (orchestrate over an injected listing) ──────────────────────

export interface PollSummary {
  routed: number;
  unmatched: number;
  skipped: number;
}

/**
 * Fallback when no live subscription exists: dispatch a caller-supplied list of
 * recent Teams transcript refs through discovery. The listing itself
 * (calendar/Graph) is credential-gated and injected, so this is a no-op offline.
 */
export async function pollTeamsTranscripts(
  dataDir: string,
  refs: TeamsTranscriptRef[],
  deps: TeamsDiscoverDeps
): Promise<PollSummary> {
  const summary: PollSummary = { routed: 0, unmatched: 0, skipped: 0 };
  for (const ref of refs) {
    const resource = `${ref.userId ? `users('${ref.userId}')/` : ""}onlineMeetings('${ref.meetingId}')/transcripts('${ref.transcriptId ?? "latest"}')`;
    const r = await discoverTeamsTranscript(dataDir, { subscriptionId: "poll", resource }, deps);
    summary[r.status]++;
  }
  return summary;
}

/** Meet poll fallback over a caller-supplied list of conference record ids. */
export async function pollMeetTranscripts(
  dataDir: string,
  conferenceRecordIds: string[],
  deps: MeetDiscoverDeps
): Promise<PollSummary> {
  const summary: PollSummary = { routed: 0, unmatched: 0, skipped: 0 };
  for (const conferenceRecordId of conferenceRecordIds) {
    const r = await discoverMeetTranscript(dataDir, { conferenceRecordId }, deps);
    summary[r.status]++;
  }
  return summary;
}

// ─── Microsoft Graph subscription renewal ──────────────────────────────────────

type FetchFn = typeof fetch;

/** A push-manager RenewFn that PATCHes the Graph subscription's expiry. */
export function buildMicrosoftRenewFn(accessToken: string, fetchFn: FetchFn = fetch): RenewFn {
  return async (sub: PushSubscription) => {
    const subId = sub.providerData.microsoftSubscriptionId;
    if (!subId) throw new Error("subscription has no microsoftSubscriptionId");
    const newExp = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const res = await fetchFn(`https://graph.microsoft.com/v1.0/subscriptions/${subId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ expirationDateTime: newExp }),
    });
    if (!res.ok) throw new Error(`Graph subscription renew failed: ${res.status}`);
    const data = (await res.json()) as { expirationDateTime?: string };
    return { expiresAt: data.expirationDateTime ?? newExp };
  };
}
