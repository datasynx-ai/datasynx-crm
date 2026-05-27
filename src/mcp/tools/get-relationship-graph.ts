import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readGraph, getStakeholders } from "../../core/graph.js";
import type { GraphNode } from "../../core/graph.js";

const DATA_DIR = process.cwd();

function summarizeNode(n: GraphNode) {
  return { id: n.id, name: n.label, email: n.properties["email"] };
}

export async function handleGetRelationshipGraph(
  input: { slug: string },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const graph = readGraph(dataDir, input.slug);
    const stakeholders = getStakeholders(graph);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              slug: input.slug,
              nodeCount: graph.nodes.length,
              edgeCount: graph.edges.length,
              updatedAt: graph.updatedAt,
              stakeholders: {
                champions: stakeholders.champions.map(summarizeNode),
                blockers: stakeholders.blockers.map(summarizeNode),
                economicBuyers: stakeholders.economicBuyers.map(summarizeNode),
                allContacts: stakeholders.allContacts.map(summarizeNode),
                missingRoles: stakeholders.missingRoles,
              },
              nodes: graph.nodes,
              edges: graph.edges,
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

export function registerGetRelationshipGraph(server: McpServer): void {
  server.registerTool(
    "get_relationship_graph",
    {
      title: "Get Relationship Graph",
      description: `Returns the knowledge graph for a customer: all known contacts, companies,
and the relationships between them (KNOWS, WORKS_AT, IS_CHAMPION, IS_BLOCKER, IS_ECONOMIC_BUYER).

The graph auto-populates from every log_interaction call.
Use this before a complex deal conversation to understand the stakeholder map.

Args:
  slug: Customer slug

Returns: {
  stakeholders: { champions[], blockers[], economicBuyers[], allContacts[], missingRoles[] },
  nodes: GraphNode[],
  edges: GraphEdge[]
}`,
      inputSchema: z.object({
        slug: z.string().describe("Customer slug (e.g. 'acme-corp')"),
      }),
    },
    async ({ slug }) => handleGetRelationshipGraph({ slug })
  );
}
