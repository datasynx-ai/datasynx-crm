import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  readHealth,
  computeCustomerHealth,
  writeHealth,
} from "../../core/relationship-health.js";

const DATA_DIR = process.cwd();
const MAX_HEALTH_AGE_MS = 60 * 60 * 1000; // 1 hour

export async function handleGetRelationshipHealth(
  input: { slug: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    let health = readHealth(dataDir, input.slug);
    if (
      health === null ||
      Date.now() - new Date(health.updatedAt).getTime() > MAX_HEALTH_AGE_MS
    ) {
      health = computeCustomerHealth(dataDir, input.slug);
      writeHealth(dataDir, input.slug, health);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              slug: input.slug,
              overallHealth: health.overallHealth,
              updatedAt: health.updatedAt,
              atRiskContacts: health.contacts
                .filter((c) => c.riskFlags.length > 0)
                .map((c) => c.email ?? c.contactId),
              coldContacts: health.contacts
                .filter((c) => c.trend === "cold")
                .map((c) => c.email ?? c.contactId),
              contacts: health.contacts,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: false, error: (err as Error).message }, null, 2),
        },
      ],
    };
  }
}

export function registerGetRelationshipHealth(server: McpServer): void {
  server.registerTool(
    "get_relationship_health",
    {
      title: "Get Relationship Health",
      description: `Returns health scores for all contacts of a customer.
Scores decay automatically when communication cadence breaks — without any manual input.

Each contact gets:
- score (0–100), grade (A–F), trend (rising|stable|declining|cold)
- riskFlags: NO_CONTACT_14D, NO_CONTACT_30D, CHAMPION_SILENT
- recommendation: concrete next action

overallHealth is the average across all contacts.
atRiskContacts + coldContacts are pre-filtered for quick triage.
Health auto-updates after every log_interaction call. Recomputes if stale (>1h).

Args:
  slug: Customer slug

Returns: {
  overallHealth: number,
  atRiskContacts: string[],
  coldContacts: string[],
  contacts: ContactHealth[]
}`,
      inputSchema: z.object({
        slug: z.string().describe("Customer slug (e.g. 'acme-corp')"),
      }),
    },
    async ({ slug }) => handleGetRelationshipHealth({ slug })
  );
}
