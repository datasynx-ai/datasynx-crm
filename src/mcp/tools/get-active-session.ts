import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getSession } from "../../core/session-store.js";

export interface ActiveSessionResult {
  hasSession: boolean;
  customerSlug?: string;
  customerName?: string;
  startedAt?: string;
  owner?: string;
}

export async function handleGetActiveSession(): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  const session = getSession();

  const result: ActiveSessionResult = session
    ? {
        hasSession: true,
        customerSlug: session.customerSlug,
        customerName: session.customerName,
        startedAt: session.startedAt,
        ...(session.owner !== undefined ? { owner: session.owner } : {}),
      }
    : { hasSession: false };

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}

export function registerGetActiveSession(server: McpServer): void {
  server.registerTool(
    "get_active_session",
    {
      title: "Get Active Session",
      description:
        "Check which customer is currently active in the session store. " +
        "Returns session info if a customer session is open, otherwise returns hasSession: false.",
      inputSchema: z.object({}),
    },
    async () => handleGetActiveSession()
  );
}
