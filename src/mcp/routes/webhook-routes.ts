import express, { type Express } from "express";
import {
  decodeGmailPubSubPayload,
  verifyGmailPubSubSignature,
  handleGmailPushEvent,
} from "../../sync/gmail-webhook-handler.js";
import {
  handleMicrosoftValidationRequest,
  verifyMicrosoftGraphSignature,
  handleMicrosoftPushEvent,
  type MicrosoftGraphNotification,
} from "../../sync/microsoft-webhook-handler.js";
import {
  verifySlackSignature,
  handleSlackUrlVerification,
  handleSlackPushEvent,
  type SlackEvent,
} from "../../sync/slack-webhook-handler.js";

/**
 * Inbound sync webhooks (Gmail Pub/Sub, Microsoft Graph incl. transcript
 * auto-discovery #56, Google Workspace Events, Slack Events API), extracted
 * from `startHttp()` for route-level integration testing (#65). Pure move —
 * verification semantics and handler wiring are unchanged.
 */
export function registerWebhookRoutes(app: Express, dataDir: string): void {
  // Gmail Pub/Sub webhook
  app.post("/webhooks/gmail", async (req, res) => {
    const token = process.env["GMAIL_PUBSUB_TOKEN"] ?? "";
    if (!verifyGmailPubSubSignature(req.headers["authorization"] as string | undefined, token)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const payload = decodeGmailPubSubPayload(req.body);
    if (!payload) {
      res.status(400).json({ error: "invalid_payload" });
      return;
    }
    const result = await handleGmailPushEvent(dataDir, payload, "").catch(() => ({
      processed: 0,
      slug: null,
    }));
    res.json({ ok: true, processed: result.processed });
  });

  // Microsoft Graph webhook
  app.all("/webhooks/microsoft", async (req, res) => {
    const validation = handleMicrosoftValidationRequest(req.query as Record<string, string>);
    if (validation.isValidation) {
      res.setHeader("content-type", "text/plain");
      res.status(200).send(validation.token);
      return;
    }
    const clientState = process.env["MS_GRAPH_CLIENT_STATE"] ?? "";
    const body = req.body as { value?: MicrosoftGraphNotification[] };
    if (!verifyMicrosoftGraphSignature(body, clientState)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    // Auto-discover online-meeting transcripts (#56) when a Graph token exists.
    const { getMicrosoftToken } = await import("../../sync/microsoft-auth.js");
    const msToken = await getMicrosoftToken(dataDir).catch(() => null);
    let opts = {};
    if (msToken) {
      const { fetchTeamsAttendees } = await import("../../sync/transcript-discovery.js");
      opts = {
        transcriptDeps: { accessToken: msToken, fetchAttendees: fetchTeamsAttendees },
      };
    }
    const result = await handleMicrosoftPushEvent(
      dataDir,
      body.value ?? [],
      msToken ?? "",
      opts
    ).catch(() => ({ processed: 0, skipped: 0 }));
    res.json({ ok: true, ...result });
  });

  // Google Workspace-Events webhook (#56): Meet transcript.fileGenerated →
  // auto-discover the conference record and route it to a customer.
  app.post("/webhooks/google", async (req, res) => {
    const { extractConferenceRecordId, discoverMeetTranscript, fetchMeetAttendees } =
      await import("../../sync/transcript-discovery.js");
    const conferenceRecordId = extractConferenceRecordId(req.body);
    if (!conferenceRecordId) {
      res.json({ ok: true, status: "skipped" });
      return;
    }
    const { getGoogleToken } = await import("../../sync/google-auth.js");
    const gToken = await getGoogleToken(dataDir).catch(() => null);
    const result = await discoverMeetTranscript(
      dataDir,
      { conferenceRecordId },
      { accessToken: gToken ?? "", fetchAttendees: fetchMeetAttendees }
    ).catch(() => ({ status: "skipped" as const }));
    res.json({ ok: true, ...result });
  });

  // Slack Events API webhook
  app.post("/webhooks/slack", express.text({ type: "*/*" }), async (req, res) => {
    // Slack signs the exact bytes. When the global express.json() already
    // consumed an application/json body, req.body is an object and the
    // signature could never match (#65) — use the preserved rawBody instead.
    const rawBody =
      typeof req.body === "string"
        ? req.body
        : ((req as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(req.body ?? {}));
    const signingSecret = process.env["SLACK_SIGNING_SECRET"] ?? "";
    if (
      !verifySlackSignature(
        rawBody,
        req.headers as { "x-slack-signature"?: string; "x-slack-request-timestamp"?: string },
        signingSecret
      )
    ) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    let parsed: { type?: string; challenge?: string; event?: SlackEvent; team_id?: string };
    try {
      parsed = JSON.parse(rawBody) as typeof parsed;
    } catch {
      res.status(400).json({ error: "invalid_json" });
      return;
    }
    const verification = handleSlackUrlVerification(parsed);
    if (verification.isVerification) {
      res.json({ challenge: verification.challenge });
      return;
    }
    if (!parsed.event) {
      res.json({ ok: true, processed: 0 });
      return;
    }
    const botToken = process.env["SLACK_BOT_TOKEN"] ?? "";
    const result = await handleSlackPushEvent(dataDir, parsed.event, botToken, {
      ...(parsed.team_id !== undefined ? { teamId: parsed.team_id } : {}),
    }).catch(() => ({ processed: 0, skipped: 1 }));
    res.json({ ok: true, ...result });
  });
}
