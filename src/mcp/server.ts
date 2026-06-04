import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { initOAuthFromDisk } from "../core/oauth-store.js";
import {
  decodeGmailPubSubPayload,
  verifyGmailPubSubSignature,
  handleGmailPushEvent,
} from "../sync/gmail-webhook-handler.js";
import {
  handleMicrosoftValidationRequest,
  verifyMicrosoftGraphSignature,
  handleMicrosoftPushEvent,
  type MicrosoftGraphNotification,
} from "../sync/microsoft-webhook-handler.js";
import {
  verifySlackSignature,
  handleSlackUrlVerification,
  handleSlackPushEvent,
  type SlackEvent,
} from "../sync/slack-webhook-handler.js";
import { registerGetCapabilities } from "./tools/get-capabilities.js";
import { registerGetActiveSession } from "./tools/get-active-session.js";
import { registerGetCustomerContext } from "./tools/get-customer-context.js";
import { registerSearchCustomerKnowledge } from "./tools/search-customer-knowledge.js";
import { registerListCustomers } from "./tools/list-customers.js";
import { registerLogInteraction } from "./tools/log-interaction.js";
import { registerUpdateDeal } from "./tools/update-deal.js";
import { registerExportCustomer } from "./tools/export-customer.js";
import { registerUpdateCustomerFacts } from "./tools/update-customer-facts.js";
import { registerGetDealHealth } from "./tools/get-deal-health.js";
import { registerGetPipelineForecast } from "./tools/get-pipeline-forecast.js";
import { registerSummarizeMeeting } from "./tools/summarize-meeting.js";
import { registerGetPipelineStages } from "./tools/get-pipeline-stages.js";
import { registerGetMarketIntelligence } from "./tools/get-market-intelligence.js";
import { registerGetRelationshipGraph } from "./tools/get-relationship-graph.js";
import { registerGetRelationshipHealth } from "./tools/get-relationship-health.js";
import { registerRunDealAgent } from "./tools/run-deal-agent.js";
import { registerApproveAgentAction } from "./tools/approve-agent-action.js";
import { registerSimulateRevenue } from "./tools/simulate-revenue.js";
import { registerGetPlaybook } from "./tools/get-playbook.js";
import { registerCreatePlaybook } from "./tools/create-playbook.js";
import { registerListPlaybooks } from "./tools/list-playbooks.js";
import { registerDistillPlaybook } from "./tools/distill-playbook.js";
import { registerPursueGoal } from "./tools/pursue-goal.js";
import { registerGetGoalStatus } from "./tools/get-goal-status.js";
import { registerRegisterPushSubscription } from "./tools/register-push-subscription.js";
import { registerGetPushStatus } from "./tools/get-push-status.js";
import { registerGetOrgIntelligence } from "./tools/get-org-intelligence.js";
import { registerOpenDealRoom } from "./tools/open-deal-room.js";
import { registerGetProactiveBriefing } from "./tools/get-proactive-briefing.js";
import { registerListEmailTemplates } from "./tools/list-email-templates.js";
import { registerGetEmailTemplate } from "./tools/get-email-template.js";
import { registerDraftEmail } from "./tools/draft-email.js";
import { registerEnrollInSequence } from "./tools/enroll-in-sequence.js";
import { registerListSequenceEnrollments } from "./tools/list-sequence-enrollments.js";
import { registerUnenrollFromSequence } from "./tools/unenroll-from-sequence.js";
import { registerListSequences } from "./tools/list-sequences.js";
import { registerGenerateQuote } from "./tools/generate-quote.js";
import { registerGetQuoteStatus } from "./tools/get-quote-status.js";
import { registerGetBookingLink } from "./tools/get-booking-link.js";
import { registerCreateTicket } from "./tools/create-ticket.js";
import { registerUpdateTicket } from "./tools/update-ticket.js";
import { registerListTickets } from "./tools/list-tickets.js";
import { registerCloseTicket } from "./tools/close-ticket.js";
import { registerSendNpsSurvey } from "./tools/send-nps-survey.js";
import { registerGetSurveyResults } from "./tools/get-survey-results.js";
import { registerSearchKnowledgeBase } from "./tools/search-knowledge-base.js";
import { registerCreateKbArticle } from "./tools/create-kb-article.js";
import { registerBackupNow } from "./tools/backup-now.js";
import { registerListBackups } from "./tools/list-backups.js";
import { registerTriggerSync } from "./tools/trigger-sync.js";
import { registerGetAuditLog } from "./tools/get-audit-log.js";
import { registerGetLogs } from "./tools/get-logs.js";
import { logger } from "../core/logger.js";
import { registerPrompts } from "./prompts.js";
import { registerResources } from "./resources.js";
import { registerCustomObjectTools } from "./tools/custom-objects.js";
import {
  isAuthRequired,
  verifyBearer,
  protectedResourceMetadata,
  wwwAuthenticateHeader,
} from "./auth.js";

export function surveyThankYouPage(score: number, comment?: string): string {
  const emoji = score >= 9 ? "🎉" : score >= 7 ? "🙂" : "🙏";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Thank you</title>
<style>body{font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center;padding:0 20px}
h1{font-size:2.5em;margin-bottom:.3em}p{color:#555;font-size:1.1em}</style></head>
<body><h1>${emoji}</h1><h2>Thank you for your feedback!</h2>
<p>You rated us <strong>${score}/10</strong>.${comment ? `<br>Your comment: <em>"${String(comment).slice(0, 200).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}"</em>` : ""}</p>
<p style="margin-top:40px;color:#aaa;font-size:.85em">Powered by DatasynxOpenCRM</p>
</body></html>`;
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "datasynx-opencrm",
    version: "0.1.0",
  });

  // Register all 57 tools
  // IMPORTANT: Use server.registerTool() — server.tool() is deprecated in v2
  registerGetCapabilities(server);
  registerGetActiveSession(server);
  registerGetCustomerContext(server);
  registerSearchCustomerKnowledge(server);
  registerListCustomers(server);
  registerLogInteraction(server);
  registerUpdateDeal(server);
  registerExportCustomer(server);
  registerUpdateCustomerFacts(server);
  registerGetDealHealth(server);
  registerGetPipelineForecast(server);
  registerSummarizeMeeting(server);
  registerGetPipelineStages(server);
  registerGetMarketIntelligence(server);
  registerGetRelationshipGraph(server);
  registerGetRelationshipHealth(server);
  registerRunDealAgent(server);
  registerApproveAgentAction(server);
  registerSimulateRevenue(server);
  registerGetPlaybook(server);
  registerCreatePlaybook(server);
  registerListPlaybooks(server);
  registerDistillPlaybook(server);
  registerPursueGoal(server);
  registerGetGoalStatus(server);
  registerRegisterPushSubscription(server);
  registerGetPushStatus(server);
  registerGetOrgIntelligence(server);
  registerOpenDealRoom(server);
  registerGetProactiveBriefing(server);
  registerListEmailTemplates(server);
  registerGetEmailTemplate(server);
  registerDraftEmail(server);
  registerEnrollInSequence(server);
  registerListSequenceEnrollments(server);
  registerUnenrollFromSequence(server);
  registerListSequences(server);
  registerGenerateQuote(server);
  registerGetQuoteStatus(server);
  registerGetBookingLink(server);
  registerCreateTicket(server);
  registerUpdateTicket(server);
  registerListTickets(server);
  registerCloseTicket(server);
  registerSendNpsSurvey(server);
  registerGetSurveyResults(server);
  registerSearchKnowledgeBase(server);
  registerCreateKbArticle(server);
  registerBackupNow(server);
  registerListBackups(server);
  registerTriggerSync(server);
  registerGetAuditLog(server);
  registerGetLogs(server);
  registerCustomObjectTools(server);

  // MCP Prompts (playbooks) + Resources (read-only entities) — agent-native primitives
  registerPrompts(server);
  registerResources(server);

  return server;
}

export async function startStdio(): Promise<void> {
  await initOAuthFromDisk(process.cwd());
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // IMPORTANT: stdout would corrupt the MCP stdio protocol — the logger writes
  // only to stderr (and the persistent ledger), never stdout.
  logger.info("mcp-server", "running via stdio");
}

export async function startHttp(port = 3847): Promise<void> {
  await initOAuthFromDisk(process.cwd());
  const { default: express } = await import("express");
  const app = express();
  app.use(express.json());

  const server = createMcpServer();
  const dataDir = process.cwd();

  // RFC 9728 — OAuth 2.0 Protected Resource Metadata
  app.get("/.well-known/oauth-protected-resource", (req, res) => {
    const base = `${req.protocol}://${req.get("host") ?? "localhost"}`;
    res.json(protectedResourceMetadata(`${base}/mcp`));
  });

  app.post("/mcp", async (req, res) => {
    // OAuth 2.1 resource-server gate: require a valid bearer token when auth is
    // enabled (a token is provisioned or DXCRM_MCP_AUTH=required).
    if (isAuthRequired(dataDir)) {
      const auth = verifyBearer(req.headers["authorization"], dataDir);
      if (!auth.ok) {
        const base = `${req.protocol}://${req.get("host") ?? "localhost"}`;
        res
          .status(401)
          .set(
            "WWW-Authenticate",
            wwwAuthenticateHeader(`${base}/.well-known/oauth-protected-resource`)
          )
          .json({ error: "unauthorized" });
        return;
      }
      // Attach the token's actor for RBAC enforcement on this request.
      if (auth.actor) process.env["DXCRM_ACTOR"] = auth.actor;
    }

    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
    // Ensure onclose is always a function (required by Transport interface with exactOptionalPropertyTypes)
    transport.onclose = () => {
      /* no-op */
    };
    res.on("close", () => {
      void transport.close();
    });
    await server.connect(transport as unknown as Transport);
    await transport.handleRequest(req, res, req.body as Record<string, unknown>);
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "datasynx-opencrm", version: "0.1.0" });
  });

  app.get("/sessions", async (_req, res) => {
    try {
      const { readAllSessions } = await import("../commands/session.js");
      const sessions = readAllSessions(dataDir);
      res.json({ sessions });
    } catch {
      res.json({ sessions: [] });
    }
  });

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
    const result = await handleMicrosoftPushEvent(dataDir, body.value ?? [], "").catch(() => ({
      processed: 0,
      skipped: 0,
    }));
    res.json({ ok: true, ...result });
  });

  // Slack Events API webhook
  app.post("/webhooks/slack", express.text({ type: "*/*" }), async (req, res) => {
    const rawBody = req.body as string;
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

  // NPS/CSAT survey response endpoint — linked from survey emails
  // GET  /survey/respond?token=<t>&score=<0-10>   → record score + thank-you page
  // GET  /survey/respond?token=<t>&comment=true   → show comment form
  // POST /survey/respond                           → record comment + thank-you page
  app.get("/survey/respond", async (req, res) => {
    const { token, score, comment } = req.query as Record<string, string | undefined>;
    if (!token) {
      res.status(400).send("<h2>Invalid survey link.</h2>");
      return;
    }

    if (comment === "true") {
      res.setHeader("content-type", "text/html");
      res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Survey Comment</title>
<style>body{font-family:sans-serif;max-width:520px;margin:60px auto;padding:0 20px}
textarea{width:100%;padding:10px;font-size:1em;border:1px solid #ccc;border-radius:4px}
input[type=number]{width:80px;padding:8px;font-size:1em}
button{margin-top:12px;padding:12px 28px;background:#1a1a2e;color:#fff;border:none;border-radius:4px;font-size:1em;cursor:pointer}</style></head>
<body><h2>Leave a comment</h2>
<form method="POST" action="/survey/respond">
<input type="hidden" name="token" value="${String(token).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}">
<label>Your score (0–10):<br><input type="number" name="score" min="0" max="10" required></label><br><br>
<label>Comment (optional):<br><textarea name="comment" rows="5" placeholder="What can we improve?"></textarea></label><br>
<button type="submit">Submit</button>
</form></body></html>`);
      return;
    }

    const numScore = score !== undefined ? parseInt(score, 10) : NaN;
    if (isNaN(numScore) || numScore < 0 || numScore > 10) {
      res.status(400).send("<h2>Invalid score. Please use the link from your email.</h2>");
      return;
    }

    const { recordSurveyResponse } = await import("../core/survey-engine.js");
    await recordSurveyResponse(dataDir, token, numScore).catch(() => null);
    res.setHeader("content-type", "text/html");
    res.send(surveyThankYouPage(numScore));
  });

  app.post("/survey/respond", express.urlencoded({ extended: false }), async (req, res) => {
    const { token, score, comment: commentText } = req.body as Record<string, string | undefined>;
    if (!token) {
      res.status(400).send("<h2>Invalid survey link.</h2>");
      return;
    }
    const numScore = score !== undefined ? parseInt(score, 10) : NaN;
    if (isNaN(numScore) || numScore < 0 || numScore > 10) {
      res
        .status(400)
        .send("<h2>Invalid score. Please go back and enter a number between 0 and 10.</h2>");
      return;
    }
    const { recordSurveyResponse } = await import("../core/survey-engine.js");
    await recordSurveyResponse(dataDir, token, numScore, commentText || undefined).catch(
      () => null
    );
    res.setHeader("content-type", "text/html");
    res.send(surveyThankYouPage(numScore, commentText));
  });

  app.listen(port, () => {
    logger.info("mcp-server", "running over http", { url: `http://0.0.0.0:${port}/mcp` });
  });
}

// Entry point when run directly (e.g. node dist/mcp.js)
const mode = process.env["DXCRM_MCP_MODE"] ?? "stdio";
if (mode === "http") {
  const port = parseInt(process.env["DXCRM_MCP_PORT"] ?? "3847", 10);
  startHttp(port).catch((err: unknown) => {
    logger.error("mcp-server", "fatal error", { error: (err as Error).message });
    process.exit(1);
  });
} else {
  startStdio().catch((err: unknown) => {
    logger.error("mcp-server", "fatal error", { error: (err as Error).message });
    process.exit(1);
  });
}
