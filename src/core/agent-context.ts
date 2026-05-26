/**
 * Machine-readable function scope context for AI agent frameworks.
 * Import AGENT_CONTEXT into CLAUDE.md, AGENTS.md, SOUL.md, GEMINI.md harness files.
 * Also returned by get_capabilities() MCP tool.
 *
 * Format: structured JSON — tool schemas, workflow graph, RBAC matrix, data shapes.
 */

export interface AgentToolParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
  enum?: string[];
}

export interface AgentTool {
  name: string;
  description: string;
  when: string;
  params: AgentToolParam[];
  returns: Record<string, string>;
  rbac: "any" | "rep" | "manager" | "admin";
  audited: boolean;
  example: { input: Record<string, unknown>; output: Record<string, unknown> };
}

export interface AgentContextSchema {
  product: string;
  version: string;
  mcpServerName: string;
  toolPrefix: string;
  tools: AgentTool[];
  workflow: { step: number; trigger: string; tool: string; note?: string }[];
  rbacMatrix: Record<string, string[]>;
  dataDir: string;
  dataStructure: Record<string, string>;
  cliCommands: { command: string; description: string }[];
}

export const AGENT_CONTEXT: AgentContextSchema = {
  product: "DatasynxOpenCRM",
  version: "1.0.0",
  mcpServerName: "datasynx-opencrm",
  toolPrefix: "mcp__datasynx-opencrm__",
  tools: [
    {
      name: "get_capabilities",
      description:
        "Returns full capability description and CRM workflow guide. Call this first in a new session.",
      when: "First call in session, or when unsure which tool to use.",
      params: [],
      returns: { capabilities: "string — full markdown guide" },
      rbac: "any",
      audited: false,
      example: {
        input: {},
        output: { capabilities: "# DatasynxOpenCRM — Agent Guide\n..." },
      },
    },
    {
      name: "get_active_session",
      description:
        "Returns the current active customer session. Use to check if a customer context is already loaded.",
      when: "Before assuming which customer is active. After dxcrm session open.",
      params: [],
      returns: {
        hasSession: "boolean",
        customerSlug: "string | undefined",
        customerName: "string | undefined",
        startedAt: "ISO8601 string | undefined",
      },
      rbac: "any",
      audited: false,
      example: {
        input: {},
        output: {
          hasSession: true,
          customerSlug: "acme-corp",
          customerName: "Acme Corp",
          startedAt: "2026-05-25T10:00:00.000Z",
        },
      },
    },
    {
      name: "get_customer_context",
      description:
        "Returns complete customer brief: profile (main_facts.md), last 10 interactions, pipeline deals. " +
        "Automatically trims to ~3000 tokens. <3 second response time.",
      when: "Before any customer conversation. After the user mentions a company name.",
      params: [{ name: "slug", type: "string", required: true, description: "Customer slug, e.g. acme-corp" }],
      returns: {
        context: "string — structured markdown with all sections",
        slug: "string",
        found: "boolean",
      },
      rbac: "any",
      audited: false,
      example: {
        input: { slug: "acme-corp" },
        output: {
          context: "# Customer Context: acme-corp\n\n## Metadata\nname: Acme Corp\n...",
          slug: "acme-corp",
          found: true,
        },
      },
    },
    {
      name: "search_customer_knowledge",
      description:
        "Hybrid vector + full-text semantic search across all emails and transcripts for a customer. " +
        "Uses LanceDB embeddings (nomic-embed-text-v1.5). Falls back to BM25 if vector store empty.",
      when:
        "When user asks historical questions: 'what did they say about X?', 'any pricing discussions?', 'find mentions of Y'.",
      params: [
        { name: "slug", type: "string", required: true, description: "Customer slug" },
        { name: "query", type: "string", required: true, description: "Natural language search query" },
        {
          name: "limit",
          type: "number",
          required: false,
          description: "Max results (default 5, max 20)",
        },
      ],
      returns: {
        results: "Array<{ content: string; score: number; source: string }>",
      },
      rbac: "any",
      audited: false,
      example: {
        input: { slug: "acme-corp", query: "pricing negotiation", limit: 3 },
        output: {
          results: [
            { content: "Discussed 50k budget...", score: 0.92, source: "gmail://thread/abc123" },
          ],
        },
      },
    },
    {
      name: "list_customers",
      description:
        "List all customers with relationship stage, last interaction date, and pipeline value. " +
        "Optional substring filter on name or slug.",
      when: "Morning pipeline briefing. 'Show me all customers'. 'Who is in negotiation stage?'.",
      params: [
        {
          name: "filter",
          type: "string",
          required: false,
          description: "Optional substring filter on name or slug",
        },
      ],
      returns: {
        customers:
          "Array<{ slug: string; name: string; stage: string; lastInteraction?: string; dealValue?: number }>",
      },
      rbac: "any",
      audited: false,
      example: {
        input: { filter: "acme" },
        output: {
          customers: [
            {
              slug: "acme-corp",
              name: "Acme Corp",
              stage: "active",
              lastInteraction: "2026-05-20",
              dealValue: 50000,
            },
          ],
        },
      },
    },
    {
      name: "log_interaction",
      description:
        "Record a call, email, meeting, demo, proposal, or note in interactions.md. " +
        "Entry is appended at the top (newest first). Updates last_touchpoint in main_facts.md. " +
        "Immediately searchable via search_customer_knowledge.",
      when: "After every call, meeting, email exchange, or demo. Use within minutes of the interaction.",
      params: [
        { name: "slug", type: "string", required: true, description: "Customer slug" },
        {
          name: "type",
          type: "string",
          required: true,
          description: "Interaction type",
          enum: ["Email", "Call", "Meeting", "Note", "Demo", "Proposal", "Contract", "Other"],
        },
        {
          name: "summary",
          type: "string",
          required: true,
          description: "2-5 sentence summary of what happened",
        },
        {
          name: "with",
          type: "string",
          required: true,
          description: "Contact name or email involved",
        },
        {
          name: "nextSteps",
          type: "string[]",
          required: false,
          description: "Action items arising from this interaction",
        },
        {
          name: "direction",
          type: "string",
          required: false,
          description: "Call/email direction",
          enum: ["inbound", "outbound"],
        },
        {
          name: "source",
          type: "string",
          required: false,
          description: "Source reference URI (gmail://..., manual, etc.)",
        },
      ],
      returns: {
        success: "boolean",
        path: "string — path to interactions.md",
        entry: "string — the written markdown entry",
      },
      rbac: "rep",
      audited: true,
      example: {
        input: {
          slug: "acme-corp",
          type: "Call",
          summary: "Discussed Q3 renewal. Budget confirmed at €50k.",
          with: "Max Müller",
          nextSteps: ["Send proposal by Friday"],
          direction: "inbound",
        },
        output: {
          success: true,
          path: "./customers/acme-corp/interactions.md",
          entry: "## 2026-05-26\n**Call** (inbound) with Max Müller\n...",
        },
      },
    },
    {
      name: "update_deal",
      description:
        "Update or create a pipeline deal in pipeline.md. Upserts by dealName (case-insensitive). " +
        "Updates deal table row — stage, value, probability, close date, notes.",
      when: "After any pipeline discussion. When deal stage changes. After pricing agreed.",
      params: [
        { name: "slug", type: "string", required: true, description: "Customer slug" },
        {
          name: "dealName",
          type: "string",
          required: true,
          description: "Deal name used as unique key",
        },
        {
          name: "stage",
          type: "string",
          required: false,
          description: "Deal stage",
          enum: ["lead", "qualified", "proposal", "negotiation", "won", "lost"],
        },
        {
          name: "value",
          type: "number",
          required: false,
          description: "Deal value in euros",
        },
        {
          name: "probability",
          type: "number",
          required: false,
          description: "Win probability 0-100",
        },
        {
          name: "closeDate",
          type: "string",
          required: false,
          description: "Expected close date YYYY-MM-DD",
        },
        { name: "notes", type: "string", required: false, description: "Free-text notes" },
      ],
      returns: {
        success: "boolean",
        deal: "{ name: string; stage: string; value: number; probability: number; closeDate: string; notes: string }",
      },
      rbac: "rep",
      audited: true,
      example: {
        input: {
          slug: "acme-corp",
          dealName: "Q3 Renewal",
          stage: "negotiation",
          value: 50000,
          probability: 75,
          closeDate: "2026-08-31",
        },
        output: {
          success: true,
          deal: { name: "Q3 Renewal", stage: "negotiation", value: 50000, probability: 75 },
        },
      },
    },
    {
      name: "update_customer_facts",
      description:
        "Update fields in a customer's main_facts.md profile. Merges patch into existing data. " +
        "Sets updated = today. Requires admin role. Writes audit log entry.",
      when:
        "After learning new contact info. When company domain changes. After qualifying lead stage. " +
        "When updating tags or industry.",
      params: [
        { name: "slug", type: "string", required: true, description: "Customer slug" },
        { name: "name", type: "string", required: false, description: "Company name" },
        { name: "domain", type: "string", required: false, description: "Company domain" },
        { name: "email", type: "string", required: false, description: "Primary email" },
        { name: "phone", type: "string", required: false, description: "Phone number" },
        { name: "industry", type: "string", required: false, description: "Industry / sector" },
        {
          name: "relationshipStage",
          type: "string",
          required: false,
          description: "Relationship stage",
          enum: ["prospect", "active", "churned", "paused"],
        },
        {
          name: "dealValue",
          type: "number",
          required: false,
          description: "Current deal value in euros",
        },
        {
          name: "primaryContact",
          type: "string",
          required: false,
          description: "Primary contact name",
        },
        { name: "timezone", type: "string", required: false, description: "Customer timezone" },
        {
          name: "tags",
          type: "string[]",
          required: false,
          description: "Tags / labels (replaces existing list)",
        },
        {
          name: "notes",
          type: "string",
          required: false,
          description: "Free-form notes to append to profile",
        },
      ],
      returns: {
        success: "boolean",
        facts: "MainFacts object with all fields",
      },
      rbac: "admin",
      audited: true,
      example: {
        input: {
          slug: "acme-corp",
          domain: "new-acme.io",
          primaryContact: "Carol Brown",
          tags: ["enterprise", "strategic"],
        },
        output: {
          success: true,
          facts: {
            name: "Acme Corp",
            domain: "new-acme.io",
            primary_contact: "Carol Brown",
            tags: ["enterprise", "strategic"],
          },
        },
      },
    },
    {
      name: "export_customer",
      description:
        "Export all customer data as JSON or Markdown. " +
        "JSON includes: slug, mainFacts, interactionsCount, pipeline, exportedAt. " +
        "Markdown produces a human-readable report.",
      when: "Reporting, backup, handoff to another team. 'Give me a full summary of Acme Corp'.",
      params: [
        { name: "slug", type: "string", required: true, description: "Customer slug" },
        {
          name: "format",
          type: "string",
          required: false,
          description: "Output format (default: json)",
          enum: ["json", "markdown"],
        },
      ],
      returns: {
        "format=json":
          "{ slug, mainFacts, interactionsCount, pipeline, exportedAt }",
        "format=markdown": "string — full customer report as markdown",
      },
      rbac: "any",
      audited: false,
      example: {
        input: { slug: "acme-corp", format: "json" },
        output: {
          slug: "acme-corp",
          mainFacts: { name: "Acme Corp", domain: "acme.com" },
          interactionsCount: 12,
          pipeline: [{ name: "Q3 Renewal", stage: "negotiation" }],
          exportedAt: "2026-05-26T09:00:00.000Z",
        },
      },
    },
  ],

  workflow: [
    {
      step: 1,
      trigger: "Session starts / morning briefing",
      tool: "list_customers",
      note: "Overview of all pipeline stages and last interaction dates",
    },
    {
      step: 2,
      trigger: "User mentions a company or switches customer topic",
      tool: "get_customer_context",
      note: "Load full brief before speaking about the customer",
    },
    {
      step: 3,
      trigger: "User asks 'what did they say about X?' or historical question",
      tool: "search_customer_knowledge",
      note: "Semantic search across all emails and transcripts",
    },
    {
      step: 4,
      trigger: "After every call, meeting, email, or demo",
      tool: "log_interaction",
      note: "Record immediately while details are fresh",
    },
    {
      step: 5,
      trigger: "Deal stage changes or new pricing discussed",
      tool: "update_deal",
      note: "Keep pipeline.md accurate for team visibility",
    },
    {
      step: 6,
      trigger: "New contact info or company profile changes",
      tool: "update_customer_facts",
      note: "Requires admin role — writes audit entry",
    },
    {
      step: 7,
      trigger: "Reporting, handoff, backup",
      tool: "export_customer",
      note: "Full data export as JSON or Markdown",
    },
    {
      step: 8,
      trigger: "Unsure which tool to call",
      tool: "get_capabilities",
      note: "Returns this guide — always safe to call",
    },
  ],

  rbacMatrix: {
    admin: [
      "get_capabilities",
      "get_active_session",
      "get_customer_context",
      "search_customer_knowledge",
      "list_customers",
      "log_interaction",
      "update_deal",
      "update_customer_facts",
      "export_customer",
    ],
    manager: [
      "get_capabilities",
      "get_active_session",
      "get_customer_context",
      "search_customer_knowledge",
      "list_customers",
      "log_interaction",
      "update_deal",
      "export_customer",
    ],
    rep: [
      "get_capabilities",
      "get_active_session",
      "get_customer_context",
      "search_customer_knowledge",
      "list_customers",
      "log_interaction",
      "update_deal",
      "export_customer",
    ],
  },

  dataDir: "~/.dxcrm",
  dataStructure: {
    "customers/<slug>/main_facts.md": "Customer profile — YAML frontmatter + free-text sections",
    "customers/<slug>/interactions.md": "Chronological interaction log (newest first)",
    "customers/<slug>/pipeline.md": "Deal table in Markdown format",
    "customers/<slug>/sources.json": "Gmail/transcript sync config",
    "customers/<slug>/transcripts/": "Raw transcript files",
    "customers/<slug>/attachments/": "Attachment files",
    ".agentic/config.json": "CRM configuration",
    ".agentic/rbac.json": "Role assignments (actor → role)",
    ".agentic/audit.log": "Append-only audit trail",
    ".agentic/agents/": "Per-customer agent configs",
    ".agentic/server.pid": "HTTP server PID (team mode)",
  },

  cliCommands: [
    { command: "dxcrm init", description: "Initialize CRM and configure all AI frameworks" },
    {
      command: "dxcrm create <name>",
      description: "Create new customer (--domain, --email)",
    },
    { command: "dxcrm list", description: "List all customers (--filter <q>)" },
    {
      command: "dxcrm sync <slug>",
      description: "Sync Gmail + transcripts for a customer",
    },
    {
      command: "dxcrm sync --provider microsoft",
      description: "Sync Outlook via Microsoft Graph API",
    },
    {
      command: "dxcrm session open <slug>",
      description: "Set active customer session",
    },
    { command: "dxcrm session close", description: "Clear active session" },
    { command: "dxcrm session status", description: "Show current session" },
    { command: "dxcrm validate", description: "Validate all customer data" },
    { command: "dxcrm guide", description: "Full documentation in terminal" },
    { command: "dxcrm mcp docs", description: "MCP tool reference in terminal" },
    {
      command: "dxcrm mcp start",
      description: "Start MCP server in stdio mode",
    },
    {
      command: "dxcrm mcp start --http [--port 3847]",
      description: "Start MCP server in HTTP mode",
    },
    { command: "dxcrm daemon start", description: "Start background sync daemon" },
    { command: "dxcrm daemon stop", description: "Stop daemon" },
    { command: "dxcrm daemon status", description: "Check daemon status" },
    {
      command: "dxcrm status",
      description: "Show daemon, sync state, customer counts",
    },
    {
      command: "dxcrm agent spawn <slug>",
      description: "Spawn wake-triggered agent (Telegram on new email)",
    },
    { command: "dxcrm agent status", description: "Show all configured agents" },
    {
      command: "dxcrm import <file>",
      description: "Import from HubSpot/CSV (--from hubspot|csv, --dry-run)",
    },
    {
      command: "dxcrm import --from salesforce --mode api",
      description: "Import Salesforce contacts + activities via API",
    },
    {
      command: "dxcrm import --from pipedrive --mode api",
      description: "Import Pipedrive persons + activities via API",
    },
    {
      command: "dxcrm server start",
      description: "Start HTTP MCP server (--data <dir>, --port 3847)",
    },
    { command: "dxcrm audit", description: "Show audit trail (--slug, --actor, --limit)" },
    {
      command: "dxcrm rbac set <actor> <role>",
      description: "Assign role (admin/manager/rep)",
    },
    { command: "dxcrm rbac show", description: "List configured roles" },
    {
      command: "dxcrm rbac check <actor> <tool>",
      description: "Check if actor can call a tool",
    },
    {
      command: "dxcrm gdpr erase <slug> [--confirm]",
      description: "GDPR erasure (dry-run without --confirm)",
    },
    {
      command: "dxcrm gdpr list-erasures",
      description: "Show erasure log",
    },
    {
      command: "dxcrm security-report [--output <file>]",
      description: "Generate Markdown security questionnaire",
    },
    { command: "dxcrm backup [path]", description: "Backup customers/ directory" },
    {
      command: "dxcrm backup schedule --every day --keep 7",
      description: "Schedule automatic backups",
    },
    { command: "dxcrm restore <path>", description: "Restore from backup" },
  ],
};

/**
 * Compact text representation for injection into CLAUDE.md / AGENTS.md / SOUL.md.
 * Includes all tool names, signatures, RBAC requirements, and the recommended workflow.
 */
export const AGENT_CONTEXT_TEXT: string = (() => {
  const { tools, workflow, rbacMatrix } = AGENT_CONTEXT;

  const toolLines = tools
    .map((t) => {
      const params = t.params
        .map((p) => `${p.required ? "" : "?"}${p.name}: ${p.type}`)
        .join(", ");
      const rbacNote = t.rbac === "any" ? "" : ` [requires ${t.rbac}]`;
      const auditNote = t.audited ? " [audited]" : "";
      return `- ${t.name}(${params})${rbacNote}${auditNote}\n  → ${t.description}`;
    })
    .join("\n");

  const workflowLines = workflow
    .map((w) => `  ${w.step}. ${w.trigger} → ${w.tool}${w.note ? ` (${w.note})` : ""}`)
    .join("\n");

  const rbacLines = Object.entries(rbacMatrix)
    .map(([role, allowed]) => `  ${role}: ${allowed.join(", ")}`)
    .join("\n");

  return `## DatasynxOpenCRM — MCP Tool Scope

MCP server: datasynx-opencrm
Tool prefix: mcp__datasynx-opencrm__

### Available Tools

${toolLines}

### Recommended Workflow

${workflowLines}

### RBAC Matrix

${rbacLines}

### Data Location

Default: ~/.dxcrm/customers/<slug>/
Files: main_facts.md | interactions.md | pipeline.md | sources.json
`.trim();
})();
