import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { initOAuthFromDisk } from "../core/oauth-store.js";
import { decodeGmailPubSubPayload, verifyGmailPubSubSignature, handleGmailPushEvent } from "../sync/gmail-webhook-handler.js";
import { handleMicrosoftValidationRequest, verifyMicrosoftGraphSignature, handleMicrosoftPushEvent, type MicrosoftGraphNotification } from "../sync/microsoft-webhook-handler.js";
import { verifySlackSignature, handleSlackUrlVerification, handleSlackPushEvent, type SlackEvent } from "../sync/slack-webhook-handler.js";
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

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "datasynx-opencrm",
    version: "0.1.0",
  });

  // Register all 30 tools
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

  return server;
}

export async function startStdio(): Promise<void> {
  await initOAuthFromDisk(process.cwd());
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // IMPORTANT: console.log would corrupt the MCP stdio protocol — always use console.error
  console.error("DatasynxOpenCRM MCP Server running via stdio");
}

export async function startHttp(port = 3847): Promise<void> {
  await initOAuthFromDisk(process.cwd());
  const { default: express } = await import("express");
  const app = express();
  app.use(express.json());

  const server = createMcpServer();

  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
    // Ensure onclose is always a function (required by Transport interface with exactOptionalPropertyTypes)
    transport.onclose = () => { /* no-op */ };
    res.on("close", () => { void transport.close(); });
    await server.connect(transport as unknown as Transport);
    await transport.handleRequest(req, res, req.body as Record<string, unknown>);
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "datasynx-opencrm", version: "0.1.0" });
  });

  const dataDir = process.cwd();

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
    if (!payload) { res.status(400).json({ error: "invalid_payload" }); return; }
    const result = await handleGmailPushEvent(dataDir, payload, "").catch(() => ({ processed: 0, slug: null }));
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
    const result = await handleMicrosoftPushEvent(dataDir, body.value ?? [], "").catch(() => ({ processed: 0, skipped: 0 }));
    res.json({ ok: true, ...result });
  });

  // Slack Events API webhook
  app.post("/webhooks/slack", express.text({ type: "*/*" }), async (req, res) => {
    const rawBody = req.body as string;
    const signingSecret = process.env["SLACK_SIGNING_SECRET"] ?? "";
    if (!verifySlackSignature(rawBody, req.headers as { "x-slack-signature"?: string; "x-slack-request-timestamp"?: string }, signingSecret)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    let parsed: { type?: string; challenge?: string; event?: SlackEvent; team_id?: string };
    try { parsed = JSON.parse(rawBody) as typeof parsed; } catch { res.status(400).json({ error: "invalid_json" }); return; }
    const verification = handleSlackUrlVerification(parsed);
    if (verification.isVerification) { res.json({ challenge: verification.challenge }); return; }
    if (!parsed.event) { res.json({ ok: true, processed: 0 }); return; }
    const botToken = process.env["SLACK_BOT_TOKEN"] ?? "";
    const result = await handleSlackPushEvent(dataDir, parsed.event, botToken, { ...(parsed.team_id !== undefined ? { teamId: parsed.team_id } : {}) }).catch(() => ({ processed: 0, skipped: 1 }));
    res.json({ ok: true, ...result });
  });

  app.listen(port, () => {
    console.error(`DatasynxOpenCRM MCP Server running on http://0.0.0.0:${port}/mcp`);
  });
}

// Entry point when run directly (e.g. node dist/mcp.js)
const mode = process.env["DXCRM_MCP_MODE"] ?? "stdio";
if (mode === "http") {
  const port = parseInt(process.env["DXCRM_MCP_PORT"] ?? "3847", 10);
  startHttp(port).catch((err: unknown) => {
    console.error("MCP Server fatal error:", (err as Error).message);
    process.exit(1);
  });
} else {
  startStdio().catch((err: unknown) => {
    console.error("MCP Server fatal error:", (err as Error).message);
    process.exit(1);
  });
}
