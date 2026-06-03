import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  readMainFacts,
  writeMainFacts,
  ensureCustomerDir,
  customerExists,
} from "../../fs/customer-dir.js";
import { writeAuditEntry, getActor } from "../../fs/audit-log.js";
import { enforceRbac } from "../../core/rbac.js";
import type { MainFacts } from "../../schemas/main-facts.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export async function handleUpdateCustomerFacts(
  input: {
    slug: string;
    name?: string | undefined;
    domain?: string | undefined;
    email?: string | undefined;
    phone?: string | undefined;
    industry?: string | undefined;
    relationshipStage?: "prospect" | "active" | "churned" | "paused" | undefined;
    dealValue?: number | undefined;
    primaryContact?: string | undefined;
    timezone?: string | undefined;
    tags?: string[] | undefined;
    notes?: string | undefined;
  },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const today = new Date().toISOString().slice(0, 10);

  try {
    enforceRbac(dataDir, "update_customer_facts");

    let existing: MainFacts;
    let created = false;
    if (!customerExists(dataDir, input.slug)) {
      await ensureCustomerDir(dataDir, input.slug);
      existing = {
        name: input.name ?? input.slug,
        relationship_stage: "prospect",
        currency: "EUR",
        tags: [],
        created: today,
        updated: today,
      };
      created = true;
    } else {
      existing = await readMainFacts(dataDir, input.slug);
    }

    const updated = {
      ...existing,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.domain !== undefined ? { domain: input.domain } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.industry !== undefined ? { industry: input.industry } : {}),
      ...(input.relationshipStage !== undefined
        ? { relationship_stage: input.relationshipStage }
        : {}),
      ...(input.dealValue !== undefined ? { deal_value: input.dealValue } : {}),
      ...(input.primaryContact !== undefined ? { primary_contact: input.primaryContact } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      updated: today,
    };

    await writeMainFacts(dataDir, input.slug, updated);

    writeAuditEntry(dataDir, {
      timestamp: new Date().toISOString(),
      actor: getActor(),
      tool: "update_customer_facts",
      slug: input.slug,
      summary: Object.keys(input)
        .filter((k) => k !== "slug")
        .join(", "),
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: true, created, facts: updated }, null, 2),
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

export function registerUpdateCustomerFacts(server: McpServer): void {
  server.registerTool(
    "update_customer_facts",
    {
      title: "Update Customer Facts",
      description: `Create or update a customer's main_facts.md profile.
If the customer slug does not exist yet, creates the customer directory and initial profile.
If it exists, merges the provided fields into existing data.

Use to add a new customer ("create acme-corp") or update existing info.

Args:
  slug: Customer ID / slug — e.g. "acme-corp" (kebab-case, no spaces)
  name: Company name (used as display name)
  domain: Primary domain (e.g. "acme.com")
  email: Primary contact email
  phone: Phone number
  industry: Industry vertical
  relationshipStage: "prospect" | "active" | "churned" | "paused"
  dealValue: Expected deal value in EUR
  primaryContact: Primary contact person name
  timezone: Timezone (e.g. "Europe/Berlin")
  tags: Array of tags (replaces existing tags)

Returns: { success: boolean, created: boolean, facts: object }`,
      inputSchema: z.object({
        slug: z.string().describe("Customer slug (e.g. 'acme-corp')"),
        name: z.string().optional().describe("Company name"),
        domain: z.string().optional().describe("Primary domain"),
        email: z.string().optional().describe("Primary contact email"),
        phone: z.string().optional().describe("Phone number"),
        industry: z.string().optional().describe("Industry vertical"),
        relationshipStage: z
          .enum(["prospect", "active", "churned", "paused"])
          .optional()
          .describe("Relationship stage"),
        dealValue: z.number().optional().describe("Expected deal value in EUR"),
        primaryContact: z.string().optional().describe("Primary contact person name"),
        timezone: z.string().optional().describe("Timezone (e.g. Europe/Berlin)"),
        tags: z.array(z.string()).optional().describe("Tags (replaces existing)"),
      }),
    },
    async (input) => handleUpdateCustomerFacts(input)
  );
}
