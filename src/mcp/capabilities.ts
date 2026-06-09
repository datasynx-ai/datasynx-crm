// src/mcp/capabilities.ts
// Single Source of Truth for capability documentation.
// Used by get_capabilities() MCP tool AND dxcrm guide CLI command.

export const CAPABILITIES_TEXT = `
# DatasynxOpenCRM — Agent Guide

## Product
DatasynxOpenCRM is a local-first, MCP-native CRM. All customer data lives in markdown
files on your machine. No cloud, no HubSpot, no per-seat pricing.

## Agent Wake (Telegram Notifications)
\`dxcrm agent spawn\` enables a wake-triggered agent for a customer. When new emails arrive,
the agent sends a Telegram notification so you never miss an inbound message.
\`\`\`
dxcrm agent spawn acme-corp --channel telegram
\`\`\`
Requires: \`TELEGRAM_BOT_TOKEN\` + \`TELEGRAM_CHAT_ID\` env vars.

## Golden Path — Agent Session Workflow

The recommended sequence for a productive agent session:

1. \`get_capabilities()\` — understand available tools (this guide)
2. \`get_active_session()\` — check for an active customer session
3. \`get_customer_context({ slug })\` — load full briefing for the customer
4. \`search_customer_knowledge({ slug, query })\` — find specific historical information
5. \`log_interaction()\` / \`update_deal()\` — write back what happened

## RBAC — Role-Based Access Control

Tools enforce the \`DXCRM_ACTOR\` environment variable for identity. Configure roles with \`dxcrm rbac set\`.

| Role | Permissions |
|---|---|
| admin | All tools, all customers |
| manager | log_interaction, update_deal, pursue_goal + all read tools |
| rep | log_interaction, update_deal (own customers only) + all read tools |

Default role: rep (when DXCRM_ACTOR is not set or has no assigned role).

Config: \`.agentic/rbac.json\` | Actor: \`DXCRM_ACTOR\` env var

## Available Tools

| Tool | Purpose | RBAC |
|---|---|---|
| get_capabilities | Returns this guide — understand what the CRM can do | any |
| get_active_session | Check which customer session is currently active | any |
| get_customer_context | Full LLM-ready briefing for a customer (last 10 interactions, pipeline, contacts) | any (rep: own only) |
| search_customer_knowledge | Hybrid vector + full-text search across emails and transcripts for a customer | any |
| list_customers | List all customers with stage, last interaction date, and deal value | any (rep: own only) |
| log_interaction | Write a new interaction entry (call, email, meeting, note) — immediately searchable | rep+ |
| update_deal | Create or update a deal in pipeline.md — upserts by deal name | rep+ |
| update_customer_facts | Update fields in customer profile (domain, contact, stage, tags) | admin |
| export_customer | Export all customer data (incl. attachment contents) as JSON or Markdown | admin |
| get_deal_health | Score deal health 0–100 (A–F): weighted blend of stakeholder coverage, recency, stage dwell, sentiment, probability, close date | any |
| get_pipeline_forecast | Aggregate weighted pipeline revenue, grouped by stage and by owner (RBAC-aware) | any |
| get_pipeline_stages | List all configured pipeline stages (defaults: lead, qualified, proposal, negotiation, won, lost) | any |
| summarize_meeting | LLM-summarize a transcript and log it as a Meeting interaction | rep+ |
| get_market_intelligence | Semantic search across all customers for patterns and common topics | any |
| get_relationship_graph | Stakeholder map: champions, blockers, economic buyers, warm intro paths | any |
| get_relationship_health | Health scores (0–100, A–F, trend) per contact with decay detection and risk flags | any |
| run_deal_agent | Analyze deal and generate prioritized action plan (observe/suggest/act autonomy levels) | rep+ |
| approve_agent_action | Approve or reject a pending action from the deal agent queue | rep+ |
| simulate_revenue | Monte Carlo pipeline forecast — P10/P50/P90, sensitivity map, at-risk revenue | any |
| get_playbook | Retrieve playbooks matching current deal situation (trigger-matched, sorted by success rate) | any |
| create_playbook | Create or update a playbook with trigger DSL encoding proven tactics | rep+ |
| list_playbooks | List all playbooks for a customer (metadata only, no body) | any |
| distill_playbook | LLM-extract a reusable playbook from a won or lost deal's interaction history | rep+ |
| pursue_goal | Set a revenue/pipeline goal and get an AI-decomposed action plan with sub-goals | manager+ |
| get_goal_status | Get all active goals or a specific goal with progress, days remaining, sub-goals | any |
| register_push_subscription | Register real-time push subscription (Gmail Pub/Sub, MS Graph, Slack Events) | admin |
| get_push_status | Show all push subscriptions: expiry, events processed, renewal needs | any |
| get_org_intelligence | Stakeholder map with champions, buyers, blockers, health scores, risk flags, recommendation | any |
| open_deal_room | Multi-agent deal brief: graph + health + deal health + simulation + playbook in one call | any |
| get_proactive_briefing | Daily briefing: urgent alerts, opportunities, P50/P90 forecast, top action | any |
| list_email_templates | List all saved email templates with id, name, category, subject | any |
| get_email_template | Retrieve a single email template with full body and detected variables | any |
| draft_email | Draft a personalized email from a template with auto-filled customer variables | rep+ |
| enroll_in_sequence | Enroll a contact in a multi-step email sequence | rep+ |
| list_sequence_enrollments | List active sequence enrollments filtered by customer or status | any |
| unenroll_from_sequence | Pause (soft-unenroll) a contact from an active sequence | rep+ |
| list_sequences | List all defined email sequences with step count and enrollment count | any |
| generate_quote | Generate a professional HTML quote with line items, VAT, subtotal, total | rep+ |
| get_quote_status | Retrieve a generated quote by number or list all quotes for a customer | any |
| create_product | Create/update a catalog product (upsert by SKU) for reuse in quotes | manager+ |
| list_products | List catalog products (SKU, name, price, tax, recurring) | any |
| update_product | Update fields of a catalog product by SKU | manager+ |
| get_booking_link | Get a Calendly booking link for a customer — optionally pre-fills name/email | rep+ |
| create_ticket | Create a support ticket with auto-calculated SLA due date based on priority | rep+ |
| update_ticket | Update ticket status or assignee (resolved auto-sets resolution date) | rep+ |
| list_tickets | List tickets filtered by customer, status, priority, or assignee | any |
| close_ticket | Close a ticket and optionally log resolution as an interaction | rep+ |
| create_task | Create a first-class task / dated reminder ("remind me Friday about Acme") | rep+ |
| list_tasks | List tasks — "what is due today?" (due: today/overdue, slug, assignee, status), RBAC-aware | any |
| complete_task | Mark a task as done | rep+ |
| snooze_task | Defer a task; it resurfaces on the given date | rep+ |
| get_email_engagement | Outbound email opens/clicks/replies + reply latency per contact (tracking default off) | any |
| send_nps_survey | Generate NPS/CSAT survey token + HTML email draft (does not send automatically) | rep+ |
| get_survey_results | NPS score, promoter/passive/detractor breakdown, all responses for a survey | any |
| search_knowledge_base | Full-text search across KB articles (title, body, tags) with category and public filters | any |
| create_kb_article | Create a new knowledge base article stored as Markdown in .agentic/knowledge-base/ | rep+ |
| backup_now | Trigger immediate backup of customers/ + .agentic/ with SHA-256 integrity check | admin |
| list_backups | List available backups with date, size, verification status, and customer count | any |
| trigger_sync | Force immediate Gmail sync for one or all customers | rep+ |
| get_audit_log | Read audit log — all write operations with actor, tool, customer | admin |
| get_logs | Query/aggregate the structured application log (level, component, errors) | admin |
| get_diagnostics | Self-diagnostic health check (data integrity, temp files, log errors, backups) | admin |
| get_pipeline_changes | Pipeline time-travel: what changed (won/lost/moved/value) since a date | any |
| get_pipeline_velocity | Stage dwell times, sales cycle, and stalled deals from snapshot history | any |
| get_pipeline_funnel | Conversion funnel & win rate: where deals leak out of the pipeline | any |
| get_vault_link | Get a browser link to the local credential-vault GUI — enter/manage secrets without sending them through the LLM | admin |
| define_custom_object | Define a runtime custom object type with typed fields (no migration) | admin |
| create_record | Create a record of a custom object (validated against its schema) | rep+ |
| list_records | List records of a custom object | any |
| list_custom_objects | List all defined custom objects and their schemas | any |

## MCP Resources (read-only)

Besides Tools, the server exposes read-only Resources you can fetch via resources/read:
- crm://customers — list of all customer slugs (JSON)
- crm://customer/{slug} — LLM-ready briefing (main facts, recent interactions, pipeline)
- crm://pipeline/{slug} — deals for a customer (JSON)
- crm://timeline/{slug} — newest-first interaction history (Markdown)

## MCP Prompts (playbooks)

Reusable playbook prompts via prompts/get (argument: slug):
- deal_risk_review — assess deal health and risk, recommend next steps
- draft_follow_up — draft a personalized follow-up email
- account_brief — concise executive account brief
- pipeline_summary — pipeline + forecast summary

## Tool Reference

### get_capabilities()
Returns all available MCP tools, their inputs, and the CRM workflow guide.
- Input: none
- Returns: This guide text

### get_active_session()
Check which customer is currently active in the session store.
- Input: none
- Returns: { hasSession: boolean, customerSlug?, customerName?, startedAt?, owner? }

### get_customer_context({ slug? })
Load complete briefing for a customer. Reads main_facts.md, last 10 interactions,
and pipeline deals. Returns a structured markdown context block.
Automatically triggers a background Gmail sync if last sync was >30 minutes ago.
- Input: { slug?: string } — Customer ID (e.g. "acme-corp"). Leave empty for active session.
- Returns: Formatted markdown with Quick Reference, Contacts, Critical Context,
  Recent Activity, Pipeline, and Open Questions
- Performance: <3 seconds. Token budget: <3000 tokens.

### search_customer_knowledge({ slug, query, limit? })
Hybrid vector + full-text search across all emails and transcripts for a customer.
Searches the LanceDB docs table for the given customer.
- Input: { slug: string, query: string, limit?: number (default 5, max 50) }
- Returns: { results: Array<{ content, score, source }> }

### list_customers({ filter? })
List all customers with their stage, last interaction date, and deal value.
RBAC: rep role only sees owned customers.
- Input: { filter?: string } — Optional substring filter on name or slug (case-insensitive)
- Returns: Array of { slug, name, stage, lastInteraction?, dealValue? }

### log_interaction({ slug, type, summary, with, nextSteps?, direction?, source?, date? })
Write a new interaction entry to interactions.md. Immediately searchable.
Also auto-updates the relationship graph and health scores (fire-and-forget).
Use after every call, meeting, or email.
RBAC: rep+
- Input:
  slug: Customer ID
  type: "Email" | "Call" | "Meeting" | "Note" | "Demo" | "Proposal" | "Contract" | "Other"
  summary: 2-5 sentences describing what happened
  with: Who was involved (name or email)
  nextSteps?: Array of action items
  direction?: "inbound" | "outbound"
  source?: Source reference string (auto-generated if omitted)
  date?: Interaction date YYYY-MM-DD (defaults to today)
- Returns: { success: boolean, path: string, entry: string }

### update_deal({ slug, dealName, stage?, value?, probability?, closeDate?, notes? })
Update or create a deal in pipeline.md. Upserts by deal name.
RBAC: rep+
- Input:
  slug: Customer ID
  dealName: Deal name (used as unique key)
  stage?: "lead" | "qualified" | "proposal" | "negotiation" | "won" | "lost"
  value?: Deal value in euros
  probability?: Win probability (0-100)
  closeDate?: Expected close date (YYYY-MM-DD)
  notes?: Free-text notes
- Returns: { success: boolean, deal: object }

### update_customer_facts({ slug, name?, domain?, email?, phone?, industry?, relationshipStage?, dealValue?, primaryContact?, timezone?, tags? })
Update fields in a customer's main_facts.md profile. Merges patch into existing data. Sets updated = today.
RBAC: admin
- Input: slug (required) + any combination of the optional fields
- Returns: { success: boolean, facts: object }

### export_customer({ slug, format?, includeAttachmentContent? })
Export all customer data (main_facts + interactions + pipeline + attachments).
Set includeAttachmentContent to inline every attachment's converted Markdown —
a single sendable bundle of all conversations and documents for the customer.
RBAC: admin
- Input: { slug: string, format?: "json" | "markdown" (default "json"), includeAttachmentContent?: boolean (default false) }
- Returns (JSON): { slug, exportedAt, mainFacts, interactionsCount, pipeline, attachments[, attachmentContents] }
- Returns (Markdown): Formatted document with all sections (and attachment contents when requested)

### get_deal_health({ slug })
Score the health of all deals for a customer as a weighted blend (not recency alone):
stakeholder coverage (economic buyer/champion, 30%), recency (20%), stage dwell (15%),
last-touch sentiment (15%), probability plausibility (10%), close date (10%). Hard rule:
no A in negotiation without an identified economic buyer. Consistent with open_deal_room.
- Input: { slug: string }
- Returns: { slug, deals: [{ deal, stage, score, grade, signals, warnings }] }

### get_pipeline_forecast({ filter?, owner? })
Aggregate weighted pipeline revenue. Groups open deals by stage AND by owner; excludes
won/lost. RBAC-aware: a rep sees only their own customers' deals, manager/admin the full
team rollup. Pass owner to drill into one rep.
- Input: { filter?: string, owner?: string }
- Returns: { deals: [...], totalWeightedValue, byStage: { stage: { count, weightedValue } }, byOwner: { owner: { count, weightedValue } } }

### get_pipeline_stages()
Returns all configured pipeline stages. Falls back to default stages if no custom stages configured.
- Input: none
- Returns: { stages: [{ id, label, order, probability, color, final }] }

### summarize_meeting({ slug, transcript, with?, date? })
LLM-summarize a meeting transcript and log it as a Meeting interaction.
Falls back to raw text slice if LLM unavailable.
RBAC: rep+
- Input:
  slug: Customer ID
  transcript: Full meeting transcript text
  with?: Participant names
  date?: Meeting date YYYY-MM-DD (defaults to today)
- Returns: { success, summary, nextSteps, sourceRef }

### get_market_intelligence({ query, excludeCurrentCustomer?, slug? })
Search across all customers to find patterns, common topics, or similar issues.
Uses semantic search (LanceDB) across all customer knowledge bases.
Results use slug (not real names) for privacy.
- Input: { query: string, excludeCurrentCustomer?: boolean, slug?: string }
- Returns: { query, results: CrossCustomerResult[], totalCustomersSearched }

### get_relationship_graph({ slug })
Returns the knowledge graph for a customer: contacts, companies, and their relationships.
Auto-populated from every log_interaction call. Shows stakeholder map with champions, blockers,
economic buyers, and warm intro paths.
- Input: { slug: string }
- Returns: { nodeCount, edgeCount, updatedAt, stakeholders: { champions[], blockers[], economicBuyers[], allContacts[], missingRoles[] }, warmIntroPaths[], nodes[], edges[] }

### get_relationship_health({ slug })
Returns health scores (0-100, A-F grade) for all contacts. Scores decay when cadence breaks.
Risk flags: NO_CONTACT_14D, NO_CONTACT_30D, CHAMPION_SILENT.
Recomputes automatically if stale (>1h) or missing.
- Input: { slug: string }
- Returns: { overallHealth, updatedAt, atRiskContacts[], coldContacts[], contacts: ContactHealth[] }

### run_deal_agent({ slug, dealName, autonomyLevel?, instruction?, valueThreshold? })
Analyzes deal situation (health, relationships, stakeholder gaps) via LLM (rule-based fallback).
Returns prioritized action plan with confidence scores and full reasoning trace.
autonomyLevel: "observe" (read-only) | "suggest" (queue for review, default) | "act" (auto-execute if confidence ≥ 0.7 and value < valueThreshold)
RBAC: rep+
- Input: { slug, dealName, autonomyLevel?: "observe"|"suggest"|"act", instruction?, valueThreshold?: number (default 50000) }
- Returns: { assessment, riskLevel, plan[], actionsQueued[], actionsExecuted[], trace }

### approve_agent_action({ slug, actionId, approved })
Execute (approved=true) or reject (approved=false) a pending deal agent action.
Find actionId in run_deal_agent response.actionsQueued[].actionId
RBAC: rep+
- Input: { slug, actionId, approved: boolean }
- Returns: { success, actionId, status }

### simulate_revenue({ horizon?, iterations? })
Monte Carlo simulation over active deals. Adjusts probabilities via health score (D12) and
champion presence (D11). Returns P10/P50/P90 confidence interval + sensitivity map.
horizon: "30d" | "90d" (default, rolling window) | "quarter" (calendar) | "year". The rolling
default avoids silently dropping next-quarter pipeline near quarter-end; deals beyond the horizon
are reported in excludedDeals/excludedValue.
- Returns: { forecast: {...}, confidence, dealCount, includedDeals, excludedDeals, excludedValue, horizon }

### get_playbook({ slug, stage?, value?, healthScore?, daysSinceContact?, championPresent? })
Returns playbooks matching the current deal situation. Without deal context, returns all playbooks.
Playbooks are sorted by success rate (highest first). run_deal_agent uses playbooks automatically.
- Input: slug (required) + optional deal context fields for trigger matching
- Returns: { matches: [{ name, score, matchedConditions, trigger, successRate, usedCount, content }], totalPlaybooks, slug }

### create_playbook({ slug, name, trigger, content, successRate? })
Create or update a playbook encoding proven tactics for a specific deal situation.
Trigger DSL uses AND-only conditions: deal_stage_<s> | value > N | value < N | days_stalled > N | health < N | health > N | no_champion | has_champion
RBAC: rep+
- Input: slug, name, trigger (DSL string), content (markdown), successRate? (0–1, default 0.5)
- Returns: { success: true, playbook: { name, trigger, successRate, usedCount, lastUpdated, path } }

### list_playbooks({ slug })
List all playbooks for a customer (metadata only — no body content for performance).
- Input: { slug: string }
- Returns: { playbooks: [{ name, trigger, successRate, usedCount, lastUpdated }], count, slug }

### distill_playbook({ slug, dealName, outcome })
LLM analyzes a deal's interaction history and extracts a reusable playbook.
Run after every won or lost deal to build procedural memory.
RBAC: rep+
outcome: "won" | "lost"
- Returns: { success: true, playbook: { name, trigger, successRate, path }, reasoning }

### pursue_goal({ goal, deadline, context? })
Set a revenue or pipeline goal and get an AI-decomposed action plan.
Analyzes current pipeline (P50 forecast) and decomposes the gap into prioritized sub-goals per deal.
Persists goal to .agentic/goals.json for tracking.
RBAC: manager+
- Input: { goal: string, deadline: "YYYY-MM-DD", context?: string }
- Returns: { goalId, description, target, deadline, decomposition: { analysis, currentPipeline, gap, subGoals, probabilisticOutcome } }

### get_goal_status({ goalId? })
Get the status of active goals. Without goalId, returns all active goals.
- Input: { goalId?: string } — omit for all active goals
- Returns: { goals: [{ id, description, target, progress, status, deadline, daysRemaining, subGoals }], activeCount, completedCount }

### register_push_subscription({ provider, slug, webhookUrl, ... })
Register a real-time push subscription so providers send events in real-time (no polling).
RBAC: admin only
- Input:
  provider: "gmail" | "microsoft-graph" | "slack"
  slug: Customer slug to receive events for
  webhookUrl: Public HTTPS URL for provider callbacks
  gmailTopicName?: (Gmail) Cloud Pub/Sub topic name
  microsoftClientState?: (MS Graph) Secret for HMAC verification
  microsoftResource?: (MS Graph) Resource path
  slackTeamId?: (Slack) Workspace team ID
  slackChannelId?: (Slack) Optional specific channel
- Returns: { subscriptionId, provider, slug, status, expiresAt, createdAt, warning? }

### get_push_status({ slug?, provider? })
Show all push subscriptions with expiry and event counts.
- Input: { slug?: string, provider?: "gmail" | "microsoft-graph" | "slack" }
- Returns: { subscriptions: [{ id, provider, slug, status, expiresAt, expiresInHours, needsRenewal, lastEventAt, eventsProcessed }], summary: { total, active, expiringSoon, expired } }

### get_org_intelligence({ slug, dealName? })
Build a stakeholder map for a customer: champions, economic buyers, blockers, health scores, risk flags, and a prioritised recommendation.
- Input: { slug: string, dealName?: string }
- Returns: { slug, updatedAt, people: [{ name, email, role, healthScore, daysSinceContact, contactStrength, riskFlags }], missingRoles, riskAssessment, recommendation }

### open_deal_room({ slug, dealName })
Multi-agent deal brief: orchestrates relationship graph, health scores, deal health, Monte Carlo simulation, and playbook matching into a unified brief with executive summary, top priorities, and risk score (0–100).
- Input: { slug: string, dealName: string }
- Returns: { slug, dealName, generatedAt, stakeholders, relationshipHealth, dealHealth, revenueSimulation, recommendedPlaybook, executiveSummary, topPriorities, riskScore }

### get_proactive_briefing({ date? })
Generate a proactive daily briefing: urgent alerts (relationship decay, deal risk, overdue close dates),
pipeline forecast (P50/P90), and a single top-action recommendation.
- Input: { date?: "YYYY-MM-DD" } — defaults to today
- Returns: { date, generatedAt, urgent: string[], opportunities: string[], forecast: string, topAction: string }

### list_email_templates({ category? })
List available email templates. Optionally filter by category.
- Input: { category?: string } — e.g. "outreach", "followup", "support"
- Returns: Array of { id, name, category, subject } (body excluded for performance)

### get_email_template({ id })
Get a specific email template with full body and detected template variables.
- Input: { id: string } — Template ID (e.g. "enterprise-intro")
- Returns: { id, name, category, subject, body, detectedVariables: string[] }

### draft_email({ slug, templateId, overrides?, tone? })
Draft a personalized email for a customer using a stored template.
Variables are auto-filled from the customer's main_facts.md.
Optional tone (e.g. "formal", "friendly", "concise") LLM-polishes the body;
falls back to plain template-fill without an ANTHROPIC_API_KEY.
Does NOT send automatically — returns the draft for review.
RBAC: rep+
- Input: { slug, templateId, overrides?: Record<string, string> }
- Returns: { subject, body, to, slug, templateId, resolvedVariables }

### enroll_in_sequence({ slug, contactEmail, sequenceId })
Enroll a contact in an email sequence. Validates that the sequence and first template exist.
RBAC: rep+
- Input: { slug: string, contactEmail: string, sequenceId: string }
- Returns: { enrollmentId, sequenceName, totalSteps }

### list_sequence_enrollments({ slug?, status? })
List email sequence enrollments. Filter by customer slug or status.
- Input: { slug?: string, status?: "active" | "paused" | "completed" }
- Returns: { enrollments: SequenceEnrollment[] }

### unenroll_from_sequence({ enrollmentId })
Pause (soft-unenroll) a contact from an email sequence. Sets status to "paused".
RBAC: rep+
- Input: { enrollmentId: string }
- Returns: { success: boolean }

### list_sequences()
List all defined email sequences with step count and current enrollment count.
- Input: none
- Returns: { sequences: [{ id, name, stepCount, enrollmentCount }] }

### generate_quote({ slug, dealName, lineItems, vatPercent?, validUntilDays?, currency? })
Generate a professional HTML quote for a customer deal.
Calculates subtotal, VAT, and total. Saves JSON + HTML to .agentic/quotes/.
RBAC: rep+
- Input:
  slug: Customer slug
  dealName: Deal name this quote is for
  lineItems: Array<{ description, quantity, unitPrice }>
  vatPercent?: VAT percentage (default 19)
  validUntilDays?: Quote validity in days (default 30)
  currency?: Currency code (default EUR)
- Returns: { quoteNumber, htmlPath, total, subtotal, vat, vatPercent, currency, validUntil, status }

### get_quote_status({ quoteNumber?, slug? })
Get quote status and details. Filter by quoteNumber (single quote) or slug (all quotes for customer).
- Input: { quoteNumber?: string, slug?: string }
- Returns (single): Full quote object with status: draft | sent | viewed | accepted | declined
- Returns (list): { quotes: [...] }

### create_product({ sku, name, unitPrice, currency?, taxRate?, recurring?, description? })
Create or update a catalog product (upsert by SKU) so quotes can reference items by SKU (#50).
- Returns: { success, product }

### list_products()
List all catalog products.
- Returns: { count, products }

### update_product({ sku, ... })
Update fields of an existing catalog product by SKU.
- Returns: { success, product } or { success:false, error } when unknown

### get_booking_link({ slug, eventType?, prefillName? })
Get a Calendly booking link for a customer. Optionally pre-fills the customer's name/email.
Requires CALENDLY_API_KEY env var or .agentic/integrations/calendly.yaml config.
RBAC: rep+
- Input: { slug, eventType?: string, prefillName?: boolean }
- Returns: { bookingUrl, eventType, duration }

### create_ticket({ slug, title, description?, priority?, assignee? })
Create a support ticket. Auto-calculates SLA due date based on priority.
SLA defaults: urgent=4h, high=24h, normal=72h, low=168h.
RBAC: rep+
- Input:
  slug: Customer slug
  title: Ticket title
  description?: Detailed description
  priority?: "urgent" | "high" | "normal" | "low" (default: normal)
  assignee?: Assignee name or email
- Returns: { ticket } with id T-NNN, status=open, slaDue

### update_ticket({ slug, ticketId, status?, assignee? })
Update a ticket's status or assignee. Setting status=resolved auto-sets resolved date.
RBAC: rep+
- Input: { slug, ticketId, status?: "open"|"in-progress"|"waiting"|"resolved"|"closed", assignee?: string }
- Returns: { ticket }

### list_tickets({ slug?, status?, priority?, assignee? })
List support tickets sorted by priority then date. Filter by any combination of fields.
- Input: { slug?, status?: "open"|"in-progress"|"waiting"|"resolved"|"closed", priority?: "urgent"|"high"|"normal"|"low", assignee? }
- Returns: { tickets: Array<{ slug, ticket }> }

### close_ticket({ slug, ticketId, resolution? })
Close a ticket and optionally log the resolution as an interaction in interactions.md.
RBAC: rep+
- Input: { slug, ticketId, resolution?: string }
- Returns: { ticket } with status=closed

### create_task({ title, dueDate, slug?, priority?, assignee?, linkedDeal? })
Create a first-class task / dated reminder. The daemon pushes due/overdue tasks to
Slack/Telegram daily. Use this instead of a loose recommendation when a follow-up has a date.
- Input: { title, dueDate: "YYYY-MM-DD", slug?, priority?: "high"|"normal"|"low", assignee?, linkedDeal? }
- Returns: { success, task: { id, title, dueDate, status: "open", … } }

### list_tasks({ due?, slug?, assignee?, status? })
The rep's "what is due today?" view. RBAC-aware: customer-bound tasks are only visible when
the customer is; manager/admin see all.
- Input: { due?: "today"|"overdue", slug?, assignee?, status?: "open"|"done"|"snoozed" }
- Returns: { today, count, tasks: [...] }

### complete_task({ taskId })
Mark a task as done (sets completedAt).
- Input: { taskId }
- Returns: { success, task }

### snooze_task({ taskId, until })
Defer a task: it disappears from "due today" and resurfaces (incl. daemon reminders) on the given date.
- Input: { taskId, until: "YYYY-MM-DD" }
- Returns: { success, task }

### get_email_engagement({ slug })
Outbound email engagement per contact (#45): sent/opens/clicks/replies, last open, average reply
latency. Reply tracking works without a pixel (thread correlation); opens/clicks need
DXCRM_EMAIL_TRACKING=opens|clicks|all. Default off, data stays local.
- Input: { slug: string }
- Returns: { slug, trackingMode, totals, contacts: [{ contactEmail, sent, opens, clicks, replies, lastOpenAt?, avgReplyLatencyHours? }] }

### send_nps_survey({ slug, contactEmail, surveyId, serverUrl? })
Generate an NPS/CSAT survey email draft. Returns subject, HTML body, and a token-based response URL.
Does NOT send automatically — returns draft for review.
Requires survey definition in .agentic/surveys/.
RBAC: rep+
- Input: { slug, contactEmail, surveyId, serverUrl?: string }
- Returns: { token, subject, body, surveyUrl, note }

### get_survey_results({ surveyId, slug? })
Calculate NPS score and breakdown for a survey. Optionally filter to a single customer.
- Input: { surveyId: string, slug?: string }
- Returns: { surveyId, totalResponses, npsScore (-100 to 100), promoters, passives, detractors, responses: [{ slug, email, score, comment?, respondedAt }] }

### search_knowledge_base({ query, category?, publicOnly?, limit? })
Full-text search across all KB articles (title, body, tags).
- Input: { query, category?: string, publicOnly?: boolean, limit?: number (default 10) }
- Returns: { query, count, articles: [{ id, title, category, excerpt, public, tags }] }

### create_kb_article({ id, title, body, category?, tags?, public?, sourceTicketId? })
Create a new knowledge base article. Articles are stored as Markdown in .agentic/knowledge-base/.
Returns an error if an article with the same ID already exists.
RBAC: rep+
- Input:
  id: Article slug (e.g. "troubleshoot-api-timeout")
  title: Article title
  body: Article body in Markdown
  category?: Category (default: "general")
  tags?: Array of tags for search
  public?: Make publicly accessible (default: false)
  sourceTicketId?: Ticket this article was created from
- Returns: { id, title, category, path }

### backup_now({ remote?, note? })
Trigger an immediate backup of all CRM data (customers/ + .agentic/).
Creates a timestamped ZIP with SHA-256 manifest. Optionally uploads to S3/rsync/local.
RBAC: admin
- Input: { remote?: string, note?: string }
- Returns: { path, createdAt, customerCount, fileCount, sizeMb, directories, verified, uploadedTo? }

### list_backups({ limit? })
List available CRM backups with metadata. Shows log-tracked backups first, falls back to directory scan.
- Input: { limit?: number (default 10, max 50) }
- Returns: { count, totalAvailable, backups: [{ filename, createdAt, sizeMb, verified, encrypted, customerCount, fileCount }] }

## Data Structure

Customer data lives in \`customers/<slug>/\`:
- \`main_facts.md\` — YAML frontmatter + free-text sections
- \`interactions.md\` — Chronological log (newest first)
- \`pipeline.md\` — Deal table in Markdown
- \`sources.json\` — Gmail/transcript sync config per customer

Agentic data lives in \`.agentic/\`:
- \`goals.json\` — Active goals and decompositions
- \`push-subscriptions.json\` — Real-time push registrations
- \`backup-log.json\` — Backup history
- \`rbac.json\` — Role assignments
- \`audit.log\` — Full audit trail
- \`knowledge-base/\` — KB articles
- \`quotes/\` — Generated quote files

## Response Format

Always cite sources (gmail://thread/... or file://...) when available.

## Framework Integration

| Framework | Tier | Config |
|---|---|---|
| Claude Code | 1 | CLAUDE.md + ~/.claude.json + .claude/settings.json |
| Codex CLI | 1 | AGENTS.md + ~/.codex/config.toml |
| Grok Build (xAI) | 1 | AGENTS.md + ~/.grok/user-settings.json + .grok/settings.json |
| OpenClaw | 1 | SOUL.md + AGENTS.md + TOOLS.md |
| Hermes Agent | 1 | SOUL.md + Skill |
| Antigravity CLI | 1 | GEMINI.md + AGENTS.md + SKILL.md |
| Cursor | 2 | .cursor/rules/datasynx-crm.mdc |
| Windsurf | 2 | MCP config only |
| Cline | 2 | MCP config only |
| Claude Desktop | 2 | MCP config only |

### Manual Grok Build configuration
\`\`\`json
// ~/.grok/user-settings.json  (mcpServers is an ARRAY in Grok, not a map)
{
  "mcpServers": [
    {
      "name": "datasynx-opencrm",
      "transport": {
        "type": "stdio",
        "command": "node",
        "args": ["/path/to/node_modules/datasynx-opencrm/dist/mcp.js"],
        "env": { "DXCRM_DATA_DIR": "~/.dxcrm" }
      }
    }
  ]
}
\`\`\`
Run \`grok inspect\` to verify the server is discovered.

## CLI Reference (Phase 2)

### dxcrm status
Show daemon status, customer count, sync ages, and unmatched transcript queue.
\`\`\`
dxcrm status
dxcrm status --unmatched   # list full unmatched transcript queue
\`\`\`

### dxcrm agent spawn <slug>
Spawn a wake-triggered agent for a customer. Sends Telegram notifications on new email.
\`\`\`
dxcrm agent spawn acme-corp --channel telegram
dxcrm agent spawn acme-corp --channel telegram --chat-id 12345
dxcrm agent status
dxcrm agent remove acme-corp
\`\`\`
Requires: \`TELEGRAM_BOT_TOKEN\` + \`TELEGRAM_CHAT_ID\` env vars.

### dxcrm import <path>
Import customers and interactions from HubSpot or generic CSV export.
\`\`\`
dxcrm import contacts.csv --from csv
dxcrm import hubspot-export.csv --from hubspot
dxcrm import hubspot-export.csv --from hubspot --dry-run
\`\`\`
- Two-pass: creates customers first, then imports activities
- Idempotent: re-running skips already-imported rows
- sourceRef format: \`hubspot://activity/<id>\` or \`csv://row/<hash>\`

## CLI Reference (Phase 3 — Team)

### dxcrm server start
Start a shared HTTP MCP server. Multiple team members connect via URL.
\`\`\`
dxcrm server start --data /mnt/crm-data --port 3847
dxcrm server status
\`\`\`
Set actor identity: \`export DXCRM_ACTOR=alice\`

### dxcrm audit
Show who changed what and when. Audit trail at \`.agentic/audit.log\`.
\`\`\`
dxcrm audit                       # Last 20 entries
dxcrm audit --slug acme-corp      # Filter by customer
dxcrm audit --actor alice         # Filter by actor
\`\`\`
Log format: \`2026-06-01T09:14:00Z | alice | log_interaction | acme-corp | summary\`

### session ownership
\`\`\`
dxcrm session open acme-corp --owner alice
# or: DXCRM_ACTOR=alice dxcrm session open acme-corp
\`\`\`
\`get_active_session()\` returns \`{ owner: "alice", ... }\` when owner is set.

## CLI Reference (Phase 5 — Migration)

### dxcrm import — Pipedrive API
\`\`\`
dxcrm import --from pipedrive --mode api --token <tok> --url https://myco.pipedrive.com
\`\`\`
Two-pass: persons → customers, activities → interactions.
sourceRef: \`pipedrive://activity/<id>\`

### CSV LLM Field Mapping
Generic CSV imports now use LLM-assisted column detection (fallback to heuristics when ANTHROPIC_API_KEY is unset).

## CLI Reference (Enterprise — Sprints R1–R5)

### dxcrm stages
Manage custom pipeline stages.
\`\`\`
dxcrm stages list                                    # List all stages
dxcrm stages set <id> <label> [--order N] [--probability N] [--color #hex] [--final]
dxcrm stages delete <id>                             # Remove a stage
dxcrm stages reset                                   # Reset to defaults
\`\`\`
Default stages: lead → qualified → proposal → negotiation → won → lost

### dxcrm rbac
Role-based access control. Roles: admin > manager > rep.
\`\`\`
dxcrm rbac set alice admin          # Assign role
dxcrm rbac show                     # List all roles
dxcrm rbac check alice update_deal  # Permission check
\`\`\`
Config: \`.agentic/rbac.json\` | Actor: \`DXCRM_ACTOR\` env var
Enforcement: per MCP tool call | Default role: rep

### dxcrm gdpr
GDPR erasure with dry-run safety and audit trail.
\`\`\`
dxcrm gdpr erase acme-corp           # Dry-run (shows plan)
dxcrm gdpr erase acme-corp --confirm # Permanent deletion
dxcrm gdpr list-erasures             # Erasure history
\`\`\`
On confirm: deletes customers/<slug>/, writes audit.log, appends gdpr-erasures.json

### dxcrm security-report
Generate Markdown security questionnaire for procurement/SOC2 review.
\`\`\`
dxcrm security-report
dxcrm security-report --output sec-report.md
\`\`\`

### Microsoft Outlook Sync
\`\`\`
dxcrm sync --provider microsoft
\`\`\`
Prerequisites: write \`.agentic/microsoft-token.json\` with \`{ "accessToken": "..." }\`
sourceRef: \`microsoft://message/<id>\` | API: Microsoft Graph v1.0

### Salesforce Import
\`\`\`
dxcrm import --from salesforce --mode api --token <tok> --url https://myco.salesforce.com
\`\`\`
Two-pass: contacts → customers, tasks → interactions (WhoId attribution)
sourceRef: \`salesforce://task/<id>\` | API: Salesforce REST v58.0

## CLI Reference (D16 — Goal-Based Orchestration)

### dxcrm goal set
Set a goal and get a decomposed action plan based on current pipeline state.
\`\`\`
dxcrm goal set "Close €500k ARR this quarter" --deadline 2026-09-30
\`\`\`

### dxcrm goal status
Show all active goals with progress bars and days remaining.
\`\`\`
dxcrm goal status
\`\`\`

### dxcrm goal update
Manually update goal progress (0–100%).
\`\`\`
dxcrm goal update goal_abc123 --progress 45
\`\`\`

### dxcrm goal cancel
Cancel an active goal.
\`\`\`
dxcrm goal cancel goal_abc123
\`\`\`

## CLI Reference (D17 — Real-Time Push Ingestion)

### dxcrm push register
Register a push subscription so providers send events in real-time (no polling).
\`\`\`
dxcrm push register acme-corp --provider gmail --webhook-url https://myserver.com/webhooks/gmail --topic-name projects/x/topics/gmail-push
dxcrm push register acme-corp --provider microsoft-graph --webhook-url https://myserver.com/webhooks/microsoft --client-state <secret>
dxcrm push register acme-corp --provider slack --webhook-url https://myserver.com/webhooks/slack --team-id T12345
\`\`\`

### dxcrm push status
Show all push subscriptions, expiry and events processed.
\`\`\`
dxcrm push status
dxcrm push status --slug acme-corp
dxcrm push status --provider gmail
\`\`\`

### dxcrm push revoke
Revoke a push subscription by ID.
\`\`\`
dxcrm push revoke psub_1716892800_a1b2c3
\`\`\`

### dxcrm push renew
Renew expiring push subscriptions (also runs automatically daily at 06:00).
\`\`\`
dxcrm push renew --all
\`\`\`

### register_push_subscription (MCP)
Register a real-time push subscription. Admin only.
\`\`\`
register_push_subscription({ provider: "gmail", slug: "acme-corp", webhookUrl: "https://myserver.com/webhooks/gmail", gmailTopicName: "projects/x/topics/y" })
\`\`\`
Returns: { subscriptionId, provider, slug, status, expiresAt, warning? }

### get_push_status (MCP)
Show all push subscriptions with expiry and event counts.
\`\`\`
get_push_status()                           // all subscriptions
get_push_status({ slug: "acme-corp" })     // filter by customer
get_push_status({ provider: "gmail" })     // filter by provider
\`\`\`
Returns: { subscriptions: [...], summary: { total, active, expiringSoon, expired } }

### get_org_intelligence (MCP)
Build a stakeholder map for a customer: champions, economic buyers, blockers, health scores, risk flags, and a prioritised recommendation.
\`\`\`
get_org_intelligence({ slug: "acme-corp" })
get_org_intelligence({ slug: "acme-corp", dealName: "Enterprise License" })
\`\`\`
Returns: { slug, updatedAt, people: [{ name, email, role, healthScore, daysSinceContact, contactStrength, riskFlags }], missingRoles, riskAssessment, recommendation }

### open_deal_room (MCP)
Multi-agent deal brief: orchestrates stakeholder map, relationship health, deal health, Monte Carlo simulation, and playbook matching into a single structured brief.
\`\`\`
open_deal_room({ slug: "acme-corp", dealName: "Enterprise License 2026" })
\`\`\`
Returns: { slug, dealName, generatedAt, stakeholders, relationshipHealth, dealHealth, revenueSimulation, recommendedPlaybook, executiveSummary, topPriorities, riskScore }

### get_proactive_briefing (MCP)
Generate a proactive daily briefing: urgent alerts (relationship decay, imminent close dates), opportunities (high-health customers with active pipeline), P50/P90 forecast, and a single top-action recommendation.
\`\`\`
get_proactive_briefing()                         // today
get_proactive_briefing({ date: "2026-05-28" })   // specific date
\`\`\`
Returns: { date, generatedAt, urgent: string[], opportunities: string[], forecast: string, topAction: string }

## H2 — Email Templates

### list_email_templates (MCP)
List all saved email templates. Returns id, name, category, subject, and body preview.
\`\`\`
list_email_templates()
list_email_templates({ category: "follow-up" })
\`\`\`
Returns: { templates: [{ id, name, category, subject, bodyPreview }] }

### get_email_template (MCP)
Retrieve a single email template with full body and all variables.
\`\`\`
get_email_template({ id: "proposal-follow-up" })
\`\`\`
Returns: { id, name, category, subject, body, variables: string[] }

### draft_email (MCP)
Draft a personalized email from a template, substituting variables from customer context.
\`\`\`
draft_email({ slug: "acme-corp", templateId: "proposal-follow-up", overrides: { subject: "Following up on your proposal" } })
\`\`\`
Returns: { subject, body, suggestedTo, suggestedCc?, variables }

## H1 — Email Sequences

### enroll_in_sequence (MCP)
Enroll a customer contact in a multi-step email sequence. Steps are sent automatically.
\`\`\`
enroll_in_sequence({ slug: "acme-corp", sequenceId: "onboarding-7day", contactEmail: "alice@acme.com" })
\`\`\`
Returns: { enrollmentId, slug, sequenceId, contactEmail, enrolledAt, nextStepDue, totalSteps }

### list_sequence_enrollments (MCP)
List active (and optionally completed) sequence enrollments.
\`\`\`
list_sequence_enrollments()
list_sequence_enrollments({ slug: "acme-corp", status: "active" })
\`\`\`
Returns: { enrollments: [{ enrollmentId, slug, sequenceId, contactEmail, currentStep, nextStepDue, status }] }

### unenroll_from_sequence (MCP)
Remove a contact from an active sequence (marks as cancelled).
\`\`\`
unenroll_from_sequence({ enrollmentId: "enr_abc123" })
\`\`\`
Returns: { success: boolean, enrollmentId }

### list_sequences (MCP)
List all defined email sequences with step count and description.
\`\`\`
list_sequences()
\`\`\`
Returns: { sequences: [{ id, name, description, steps: number, triggerOn? }] }

## H4 — Quotes

### generate_quote (MCP)
Generate a structured quote document for a customer deal.
\`\`\`
generate_quote({ slug: "acme-corp", dealName: "Enterprise License", lineItems: [{ description: "Platform (12 mo)", quantity: 1, unitPrice: 24000 }], validDays: 30 })
\`\`\`
Returns: { quoteId, slug, dealName, total, currency, validUntil, markdownTable, fullText }

### get_quote_status (MCP)
Retrieve a generated quote with full line items and total.
\`\`\`
get_quote_status({ quoteId: "Q-2026-001" })
\`\`\`
Returns: { quoteId, slug, dealName, lineItems, subtotal, total, validUntil, status }

## H3 — Meeting Scheduler

### get_booking_link (MCP)
Get a scheduling link for a meeting with a customer. Configure via DXCRM_CALENDLY_URL or per-customer sources.json.
\`\`\`
get_booking_link({ slug: "acme-corp", meetingType: "demo" })
\`\`\`
Returns: { url, meetingType, calendarProvider, prefillEmail?, note? }

## H6 — Ticket Management

### create_ticket (MCP)
Create a support ticket. Auto-sets SLA due date: critical=4h, high=24h, medium=72h, low=168h.
\`\`\`
create_ticket({ slug: "acme-corp", title: "Login broken", priority: "high", description: "Cannot login since yesterday", assignee: "alice" })
\`\`\`
Returns: { ticketId, slug, title, priority, status, slaDue, assignee?, createdAt }

### update_ticket (MCP)
Update ticket status or assignee.
\`\`\`
update_ticket({ slug: "acme-corp", ticketId: "T-001", status: "in-progress", assignee: "bob" })
\`\`\`
Returns: { ticketId, status, updatedAt }

### list_tickets (MCP)
List tickets sorted by priority. Filter by customer, status, priority, or assignee.
\`\`\`
list_tickets()
list_tickets({ slug: "acme-corp", status: "open" })
list_tickets({ priority: "high", assignee: "alice" })
\`\`\`
Returns: { tickets: [{ ticketId, slug, title, priority, status, slaDue, assignee?, createdAt }] }

### close_ticket (MCP)
Close a ticket and optionally log a resolution note to interactions.md.
\`\`\`
close_ticket({ slug: "acme-corp", ticketId: "T-001", resolution: "Fixed by updating oauth token" })
\`\`\`
Returns: { ticketId, status: "closed", closedAt, resolution? }

## H7 — NPS/CSAT Survey Engine

### send_nps_survey (MCP)
Generate a survey token and HTML email body. Customers click a score button (0–10) which
posts to your server's /survey/respond endpoint. Set DXCRM_SERVER_URL or pass serverUrl.
\`\`\`
send_nps_survey({ slug: "acme-corp", contactEmail: "alice@acme.com", surveyId: "q1-nps" })
send_nps_survey({ slug: "acme-corp", contactEmail: "alice@acme.com", surveyId: "q1-nps", serverUrl: "https://crm.myco.com" })
\`\`\`
Returns: { token, emailSubject, emailBody (HTML), surveyId, expiresAt }

### get_survey_results (MCP)
Calculate NPS score and breakdown by promoter/passive/detractor.
\`\`\`
get_survey_results({ surveyId: "q1-nps" })
get_survey_results({ surveyId: "q1-nps", slug: "acme-corp" })
\`\`\`
Returns: { surveyId, npsScore (-100 to 100), responseCount, promoters, passives, detractors, responses: [{ slug, contactEmail, score, comment?, respondedAt }] }

## H8 — Knowledge Base

### search_knowledge_base (MCP)
Full-text search across all KB articles (title, body, tags).
\`\`\`
search_knowledge_base({ query: "password reset" })
search_knowledge_base({ query: "billing", publicOnly: true })
\`\`\`
Returns: { results: [{ id, title, category, excerpt, public, tags }] }

### create_kb_article (MCP)
Create or update a knowledge base article (upserts by ID).
\`\`\`
create_kb_article({ id: "password-reset", title: "How to reset your password", body: "## Steps\\n1. Go to login...", category: "account", tags: ["password", "auth"], public: true })
\`\`\`
Returns: { id, title, createdAt, updatedAt, public }

## Enterprise Backup

### backup_now (MCP)
Trigger an immediate backup of customers/ + .agentic/. Creates a timestamped ZIP with
SHA-256 manifest. Optionally encrypts (AES-256-GCM) and uploads to S3/rsync/local.
\`\`\`
backup_now({})
backup_now({ remote: "s3://my-bucket/crm-backups/", note: "Pre-migration backup" })
\`\`\`
Returns: { path, createdAt, customerCount, fileCount, sizeMb, directories, verified, uploadedTo? }

### list_backups (MCP)
List available CRM backups with metadata from .agentic/backup-log.json.
Falls back to directory scan if log unavailable.
\`\`\`
list_backups({ limit: 10 })
\`\`\`
Returns: { count, totalAvailable, backups: [{ filename, createdAt, sizeMb, verified, encrypted, customerCount, fileCount }] }

### trigger_sync (MCP)
Force an immediate Gmail sync without waiting for the 30-minute daemon cycle.
\`\`\`
trigger_sync({ slug: "acme-corp" })        // sync one customer
trigger_sync({})                           // sync all customers
trigger_sync({ since: "2026-06-01" })      // sync from specific date
\`\`\`
Returns: { success, synced, skipped, customers: [...], errors: [...] }

### get_audit_log (MCP)
Read the append-only CRM audit log of all write operations.
\`\`\`
get_audit_log({})                              // last 50 entries
get_audit_log({ slug: "acme-corp" })           // filtered by customer
get_audit_log({ actor: "alice", limit: 20 })   // filtered by actor
\`\`\`
Returns: { total, returned, entries: [{ timestamp, actor, tool, slug, summary }] }

## Credential Vault GUI (issue #21)

### get_vault_link (MCP)
Get a one-time browser link to the local, encrypted credential vault. Use this
instead of asking the user to paste an API key / password into the chat — the
operator enters secrets directly in the browser, where they are encrypted with
AES-256-GCM into \`.agentic/vault.enc\` and **never pass through the LLM**.
\`\`\`
get_vault_link({})                 // 15-minute link to the vault GUI
get_vault_link({ ttlMinutes: 60 }) // longer-lived link (max 240)
\`\`\`
Returns: { url, expiresAt, expiresInMinutes, serverRunning, vaultKeyConfigured, instructions }

The link is served by the HTTP MCP server (\`dxcrm server start\`) at \`/vault\`,
gated by a short-lived session token, and needs \`DXCRM_VAULT_KEY\` set in the
server's environment. The \`/vault\` routes are localhost-only by default
(set \`DXCRM_VAULT_GUI_ALLOW_REMOTE=1\` to allow remote access). The same store
is reachable from the terminal via \`dxcrm vault set|get|list|rm\` and
\`dxcrm vault link\`.
`.trim();
