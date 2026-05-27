import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { initOAuthFromDisk } from "../core/oauth-store.js";
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

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "datasynx-opencrm",
    version: "0.1.0",
  });

  // Register all 12 tools
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
