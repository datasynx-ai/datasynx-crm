# Data Schemas — Datasynx Agentic CRM

All schemas are validated with Zod v3. Source files are in `src/schemas/`.

---

## main_facts.md (Customer Profile)

**File:** `customers/<slug>/main_facts.md`
**Schema source:** `src/schemas/main-facts.ts`

YAML frontmatter validated by `MainFactsSchema`:

```yaml
---
name: "Acme Corp"                       # required, min 1 char
domain: "acme.com"                      # optional — used for Gmail sync query
email: "ceo@acme.com"                   # optional — primary contact email
phone: "+49 89 12345678"                # optional
industry: "SaaS"                        # optional
relationship_stage: "active"            # required — prospect | active | churned | paused
deal_value: 50000                       # optional, number
currency: "EUR"                         # default: "EUR"
primary_contact: "Max Miller"           # optional
timezone: "Europe/Berlin"               # optional — IANA tz identifier
tags: ["enterprise", "strategic"]       # default: []
created: "2026-01-15"                   # required — YYYY-MM-DD
updated: "2026-05-26"                   # required — YYYY-MM-DD (auto-set on update)
---

# Acme Corp

## Quick Reference
Key facts in 2-3 bullet points.

## Contacts
- Max Miller (CEO) — max@acme.com

## Critical Context
Any blocking facts the agent must know before every conversation.

## Open Questions
Outstanding items needing follow-up.
```

**`relationship_stage` values:**
- `prospect` — First contact, not yet qualified
- `active` — Active sales or customer relationship
- `churned` — Lost customer
- `paused` — Relationship on hold

**Validation:** `dxcrm validate` checks all `main_facts.md` files against this schema.

---

## interactions.md (Interaction History)

**File:** `customers/<slug>/interactions.md`
**Schema source:** `src/schemas/interaction.ts`

Each interaction is a fenced Markdown section (newest entry first):

```markdown
## 2026-05-25 · Call · outbound
**With:** Max Miller
**Subject:** Q3 Renewal Follow-up           ← optional
**Summary:** Discussed Q3 renewal. Budget confirmed at €50k. Decision expected by end of June.
**Next Steps:**
- [ ] Send proposal by Friday
- [ ] Schedule follow-up for June 15
**Source:** manual
**Synced:** 2026-05-25T10:30:00.000Z
---

## 2026-05-20 · Email · inbound
**With:** max@acme.com
**Summary:** Max requested an updated pricing sheet for the Q3 renewal.
**Next Steps:**
- [ ] Prepare pricing sheet
**Source:** gmail://thread/abc123def456
**Synced:** 2026-05-20T14:00:00.000Z
---
```

**`InteractionEntrySchema` fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `date` | string | Yes | YYYY-MM-DD |
| `type` | enum | Yes | Email \| Call \| Meeting \| Note \| Demo \| Proposal \| Contract \| Other |
| `direction` | enum | No | inbound \| outbound |
| `with` | string | Yes | Contact name or email |
| `subject` | string | No | Email subject or meeting title |
| `summary` | string | Yes | Free-text summary |
| `nextSteps` | string[] | No | Checkbox list (default: []) |
| `attachments` | string[] | No | Relative links to converted attachment Markdown under `attachments/` |
| `sourceRef` | string | Yes | URI identifying the source record |
| `synced` | string | Yes | ISO 8601 timestamp |

**`sourceRef` format by provider:**

| Provider | Format | Example |
|---|---|---|
| Gmail | `gmail://thread/<thread-id>` | `gmail://thread/18f1a2b3c4d5e6f7` |
| Microsoft | `microsoft://message/<message-id>` | `microsoft://message/AAQkAGVm...` |
| HubSpot note | `hubspot://note/<engagement-id>` | `hubspot://note/12345` |
| HubSpot call | `hubspot://call/<engagement-id>` | `hubspot://call/67890` |
| HubSpot email | `hubspot://email/<engagement-id>` | `hubspot://email/11111` |
| HubSpot meeting | `hubspot://meeting/<engagement-id>` | `hubspot://meeting/22222` |
| HubSpot contact | `hubspot://contact/<contact-id>` | `hubspot://contact/99999` |
| Salesforce task | `salesforce://task/<task-id>` | `salesforce://task/00T...` |
| Pipedrive activity | `pipedrive://activity/<activity-id>` | `pipedrive://activity/42` |
| CSV | `csv://row/<sha256-of-row>` | `csv://row/a1b2c3...` |
| Manual | `manual` | `manual` |

---

## pipeline.md (Deal Tracking)

**File:** `customers/<slug>/pipeline.md`
**Schema source:** `src/schemas/pipeline.ts`

Markdown table with one row per deal:

```markdown
# Pipeline — Acme Corp

| Deal | Stage | Value | Currency | Probability | Close Date | Updated | Notes |
|---|---|---|---|---|---|---|---|
| Q3 Renewal | negotiation | 50000 | EUR | 75 | 2026-08-31 | 2026-05-25 | Budget confirmed |
| Upsell Module X | proposal | 15000 | EUR | 40 | 2026-10-01 | 2026-05-20 | Evaluating |
```

**`PipelineDealSchema` fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | Yes | Deal name |
| `stage` | enum | Yes | lead \| qualified \| proposal \| negotiation \| won \| lost |
| `value` | number | No | Deal value in `currency` |
| `currency` | string | No | Default: "EUR" |
| `probability` | number | No | 0–100 win probability % |
| `close_date` | string | No | YYYY-MM-DD target close date |
| `notes` | string | No | Free-text notes |
| `updated` | string | Yes | YYYY-MM-DD (auto-set by `update_deal`) |

**Default stages:**

| ID | Label | Order | Default Probability |
|---|---|---|---|
| `lead` | Lead | 1 | 10% |
| `qualified` | Qualified | 2 | 30% |
| `proposal` | Proposal | 3 | 50% |
| `negotiation` | Negotiation | 4 | 75% |
| `won` | Won | 5 | 100% |
| `lost` | Lost | 6 | 0% |

Custom stages are managed with `dxcrm stages set|delete|reset` and stored in `.agentic/pipeline-stages.json`.

---

## sources.json (Sync Configuration)

**File:** `customers/<slug>/sources.json` (per-customer) or `.agentic/sources.json` (global)
**Schema source:** `src/schemas/sources.ts`

```json
{
  "gmail": {
    "type": "gmail",
    "query": "from:acme.com OR to:acme.com",
    "enabled": true
  },
  "transcripts": {
    "type": "transcript",
    "paths": ["/Users/user/Downloads/Fireflies"],
    "extensions": [".txt", ".vtt"],
    "enabled": true
  }
}
```

**`GmailSourceSchema` fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `"gmail"` | Yes | Literal |
| `query` | string | Yes | Gmail search query (e.g. `from:acme.com`) |
| `enabled` | boolean | No | Default: true |

**`TranscriptSourceSchema` fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `"transcript"` | Yes | Literal |
| `paths` | string[] | Yes | Local directories to scan |
| `extensions` | string[] | No | Default: `[".txt", ".vtt"]` |
| `enabled` | boolean | No | Default: true |

**`GlobalSourcesSchema` (`.agentic/sources.json`) adds:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `calendar` | object | No | `{ enabled: boolean }` |
| `version` | number | No | Default: 1 |
| `created` | string | Yes | ISO 8601 timestamp |

---

## email-template (Email Template)

**File:** `.agentic/templates/<category>/<id>.md`
**Schema source:** `src/schemas/email-template.ts`

YAML frontmatter + Markdown body:

```markdown
---
id: "outreach-cold"
subject: "Quick question about {{customerName}}"
category: "outreach"
variables: ["customerName", "contactEmail", "ownerName"]
language: "en"
createdAt: "2026-01-10T09:00:00.000Z"
updatedAt: "2026-05-01T14:00:00.000Z"
---

Hi {{customerName}},

I noticed you're exploring CRM options and wanted to reach out.

Best,
{{ownerName}}
```

**`EmailTemplateSchema` (frontmatter) fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | Yes | Unique template ID |
| `subject` | string | Yes | Email subject with `{{variable}}` placeholders |
| `category` | string | No | Default: "general". Suggested: outreach \| followup \| support \| proposal \| renewal |
| `variables` | string[] | No | Auto-detected from body; explicit list optional. Default: [] |
| `language` | string | No | BCP 47 language tag. Default: "de" |
| `createdAt` | string | Yes | ISO 8601 timestamp |
| `updatedAt` | string | No | ISO 8601 timestamp |

**Standard template variables:**

| Variable | Description |
|---|---|
| `{{customerName}}` | Customer company name |
| `{{contactEmail}}` | Primary contact email |
| `{{dealValue}}` | Current deal value |
| `{{stage}}` | Current pipeline stage |
| `{{ownerName}}` | Account owner (from `DXCRM_ACTOR`) |

Managed with `dxcrm template list|get|create|delete|render`.

---

## survey (NPS/CSAT/CES Survey)

**Files:**
- Survey definitions: `.agentic/surveys/<id>.json`
- Survey responses: `.agentic/survey-responses/<surveyId>/<token>.json`

**Schema source:** `src/schemas/survey.ts`

### SurveyDefinitionSchema

```json
{
  "id": "nps-q2-2026",
  "type": "nps",
  "question": "How likely are you to recommend us to a friend or colleague?",
  "scale": { "min": 0, "max": 10 },
  "includeComment": true,
  "commentPrompt": "What's the primary reason for your score?",
  "createdAt": "2026-04-01T09:00:00.000Z"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | Yes | Unique survey ID |
| `type` | enum | No | nps \| csat \| ces. Default: "nps" |
| `question` | string | Yes | The survey question |
| `scale.min` | number | No | Minimum score. Default: 0 |
| `scale.max` | number | No | Maximum score. Default: 10 |
| `includeComment` | boolean | No | Collect open-text comment. Default: true |
| `commentPrompt` | string | No | Label for comment field |
| `createdAt` | string | Yes | ISO 8601 timestamp |

### SurveyResponseSchema

```json
{
  "surveyId": "nps-q2-2026",
  "slug": "acme-corp",
  "contactEmail": "alice@acme.com",
  "score": 9,
  "comment": "Very helpful team, but onboarding could be faster.",
  "respondedAt": "2026-04-15T11:23:00.000Z",
  "token": "a1b2c3d4e5f6a7b8",
  "sentAt": "2026-04-10T09:00:00.000Z"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `surveyId` | string | Yes | References `SurveyDefinition.id` |
| `slug` | string | Yes | Customer slug |
| `contactEmail` | email | Yes | Respondent email |
| `score` | integer | Yes | Survey score |
| `comment` | string | No | Optional open-text response |
| `respondedAt` | string | Yes | ISO 8601 timestamp |
| `token` | string | Yes | HMAC-signed token (secret: `DXCRM_SURVEY_SECRET`) |
| `sentAt` | string | Yes | ISO 8601 timestamp when survey was sent |

**NPS scoring:** Promoters (9–10), Passives (7–8), Detractors (0–6). NPS = % Promoters − % Detractors.

---

## sequence (Email Sequence)

**Files:**
- Sequence definitions: `.agentic/sequences/<id>.json`
- Enrollments: `.agentic/sequence-enrollments.json` (array of `SequenceEnrollment`)

**Schema source:** `src/schemas/sequence.ts`

### SequenceSchema

```json
{
  "id": "onboarding-7day",
  "name": "7-Day Onboarding",
  "steps": [
    { "day": 0, "templateId": "welcome-day0",    "skipIfReplied": true },
    { "day": 3, "templateId": "check-in-day3",   "skipIfReplied": true },
    { "day": 7, "templateId": "feedback-day7",   "skipIfReplied": true }
  ],
  "createdAt": "2026-03-01T00:00:00.000Z"
}
```

**`SequenceSchema` fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | Yes | Unique sequence ID |
| `name` | string | Yes | Human-readable name |
| `steps` | SequenceStep[] | Yes | Min 1 step |
| `createdAt` | string | Yes | ISO 8601 timestamp |

**`SequenceStepSchema` fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `day` | integer | Yes | Day offset from enrollment (0 = immediately) |
| `templateId` | string | Yes | References email template ID |
| `skipIfReplied` | boolean | No | Skip step if contact has replied. Default: true |

### SequenceEnrollmentSchema

```json
{
  "id": "enr_1748500000_abc123",
  "sequenceId": "onboarding-7day",
  "slug": "acme-corp",
  "contactEmail": "alice@acme.com",
  "enrolledAt": "2026-05-01T09:00:00.000Z",
  "status": "active",
  "currentStep": 1,
  "stepsCompleted": [0],
  "lastSentAt": "2026-05-01T09:05:00.000Z",
  "lastRepliedAt": null
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | Yes | Unique enrollment ID |
| `sequenceId` | string | Yes | References `Sequence.id` |
| `slug` | string | Yes | Customer slug |
| `contactEmail` | email | Yes | Enrolled contact email |
| `enrolledAt` | string | Yes | ISO 8601 timestamp |
| `status` | enum | Yes | active \| paused \| completed \| bounced |
| `currentStep` | integer | Yes | Index of next step to execute (0-based) |
| `stepsCompleted` | integer[] | Yes | Indices of completed steps |
| `lastSentAt` | string | No | ISO 8601 timestamp of last email sent |
| `lastRepliedAt` | string | No | ISO 8601 timestamp of last reply detected |

---

## ticket (Support Ticket)

**File:** `customers/<slug>/tickets/<ticket-id>.json`
**Schema source:** `src/schemas/ticket.ts`

```json
{
  "id": "T-001",
  "title": "API rate limits too low",
  "status": "in-progress",
  "priority": "high",
  "assignee": "alice@support.com",
  "description": "Customer hitting 429s on /v2/data endpoint at peak hours.",
  "created": "2026-05-29",
  "slaDue": "2026-05-31",
  "resolved": null
}
```

**`TicketSchema` fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | Yes | Format: `T-NNN` (auto-incremented) |
| `title` | string | Yes | Short ticket title |
| `status` | enum | Yes | open \| in-progress \| waiting \| resolved \| closed |
| `priority` | enum | No | urgent \| high \| normal \| low. Default: "normal" |
| `assignee` | string | No | Assignee email |
| `description` | string | No | Detailed description |
| `created` | string | Yes | YYYY-MM-DD (auto-set on creation) |
| `slaDue` | string | No | YYYY-MM-DD SLA deadline (auto-calculated from priority) |
| `resolved` | string | No | YYYY-MM-DD when resolved/closed |

**SLA due dates by priority:**

| Priority | SLA Hours | Example |
|---|---|---|
| urgent | 4 hours | Same day |
| high | 24 hours | Next business day |
| normal | 72 hours | 3 business days |
| low | 168 hours | 7 days |

**Status flow:** `open` → `in-progress` → `waiting` → `resolved` → `closed`

---

## quote (Customer Quote)

**Files:**
- Quote metadata: `.agentic/quotes/<Q-YYYY-NNN>.json`
- Quote HTML: `.agentic/quotes/<Q-YYYY-NNN>.html`

**Schema source:** `src/schemas/quote.ts`

```json
{
  "quoteNumber": "Q-2026-001",
  "slug": "acme-corp",
  "dealName": "Enterprise License",
  "lineItems": [
    {
      "description": "CRM Platform License (10 seats)",
      "quantity": 10,
      "unitPrice": 200,
      "total": 2000
    },
    {
      "description": "Implementation & Setup",
      "quantity": 1,
      "unitPrice": 500,
      "total": 500
    }
  ],
  "subtotal": 2500,
  "vatPercent": 19,
  "vat": 475,
  "total": 2975,
  "currency": "EUR",
  "createdAt": "2026-05-29T10:00:00.000Z",
  "validUntilDays": 30,
  "validUntil": "2026-06-28",
  "status": "draft",
  "viewedAt": null,
  "acceptedAt": null,
  "htmlPath": ".agentic/quotes/Q-2026-001.html"
}
```

**`QuoteSchema` fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `quoteNumber` | string | Yes | Format: `Q-YYYY-NNN` (auto-incremented per year) |
| `slug` | string | Yes | Customer slug |
| `dealName` | string | Yes | Associated deal name |
| `lineItems` | QuoteLineItem[] | Yes | Min 1 item |
| `subtotal` | number | Yes | Sum of all line item totals |
| `vatPercent` | number | Yes | VAT rate 0–100 |
| `vat` | number | Yes | Calculated VAT amount |
| `total` | number | Yes | subtotal + vat |
| `currency` | string | No | Default: "EUR" |
| `createdAt` | string | Yes | ISO 8601 timestamp |
| `validUntilDays` | integer | No | Default: 30 |
| `validUntil` | string | Yes | YYYY-MM-DD (calculated from createdAt + validUntilDays) |
| `status` | enum | No | draft \| sent \| viewed \| accepted \| declined. Default: "draft" |
| `viewedAt` | string | No | ISO 8601 timestamp |
| `acceptedAt` | string | No | ISO 8601 timestamp |
| `htmlPath` | string | No | Path to generated HTML file |

**`QuoteLineItemSchema` fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `description` | string | Yes | Line item description |
| `quantity` | number | Yes | Must be positive |
| `unitPrice` | number | Yes | Price per unit (min 0) |
| `total` | number | Yes | quantity × unitPrice |

---

## kb-article (Knowledge Base Article)

**File:** `.agentic/knowledge-base/<category>/<id>.md`
**Schema source:** `src/schemas/kb-article.ts`

YAML frontmatter + Markdown body:

```markdown
---
id: "api-rate-limits"
title: "API Rate Limits FAQ"
category: "technical"
tags: ["api", "limits", "429"]
public: true
createdAt: "2026-05-29T10:00:00.000Z"
updatedAt: "2026-05-30T08:00:00.000Z"
sourceTicketId: "T-042"
---

## Overview

Our API allows 1,000 requests per minute per API key.

## What to do when you hit a 429

Implement exponential backoff starting at 1 second...
```

**`KbArticleSchema` (frontmatter) fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | Yes | URL-safe identifier |
| `title` | string | Yes | Article title |
| `category` | string | No | Default: "general" |
| `tags` | string[] | No | Default: [] |
| `public` | boolean | No | Visible to customers via survey links. Default: false |
| `createdAt` | string | Yes | ISO 8601 timestamp |
| `updatedAt` | string | Yes | ISO 8601 timestamp |
| `sourceTicketId` | string | No | Ticket that prompted this article (e.g. `T-042`) |

---

## agent-config (Wake Agent Configuration)

**File:** `.agentic/agents/<slug>.agent.json`
**Schema source:** `src/schemas/agent-config.ts`

```json
{
  "slug": "acme-corp",
  "channel": "telegram",
  "wakeOn": ["email"],
  "createdAt": "2026-05-01T09:00:00.000Z",
  "lastWake": "2026-06-01T14:23:00.000Z",
  "telegramChatId": "987654321"
}
```

**`AgentConfigSchema` fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `slug` | string | Yes | Customer slug this agent monitors |
| `channel` | enum | Yes | `telegram` (only channel supported currently) |
| `wakeOn` | enum[] | No | Events that trigger the agent. Default: `["email"]`. Also supports `"calendar"` |
| `createdAt` | string | Yes | ISO 8601 timestamp |
| `lastWake` | string \| null | No | ISO 8601 timestamp of last wake notification. Default: null |
| `telegramChatId` | string | No | Override `TELEGRAM_CHAT_ID` env var for this customer |

Managed with `dxcrm agent spawn|status|remove`.

---

## .agentic/ Directory Structure

```
.agentic/
├── config.json                        # CRM configuration (version, init date, features)
├── sources.json                       # Global sync sources (GlobalSourcesSchema)
├── rbac.json                          # Role assignments { actors: {...}, default: "rep" }
├── audit.log                          # Append-only audit trail (one JSON line per entry)
├── gdpr-erasures.json                 # GDPR erasure log
├── backup-log.json                    # Backup history with SHA-256 manifests
├── import-progress.json               # HubSpot import resume state
├── pipeline-stages.json               # Custom pipeline stages (array)
├── goals.json                         # Active goals (pursue_goal output)
├── push-subscriptions.json            # Real-time push subscriptions
├── agent-queue/                       # Deal agent action queues per customer
│   └── <slug>.agent-queue.json
├── agents/                            # Wake agent configs
│   └── <slug>.agent.json              # AgentConfigSchema
├── knowledge-base/                    # KB articles
│   └── <category>/
│       └── <id>.md                    # KbArticleSchema frontmatter + body
├── quotes/                            # Generated quotes
│   ├── Q-2026-001.json                # QuoteSchema
│   └── Q-2026-001.html                # Generated HTML
├── sequences/                         # Email sequence definitions
│   └── <id>.json                      # SequenceSchema
├── sequence-enrollments.json          # All enrollments (SequenceEnrollmentSchema[])
├── surveys/                           # Survey definitions
│   └── <id>.json                      # SurveyDefinitionSchema
├── survey-responses/                  # Survey responses
│   └── <surveyId>/
│       └── <token>.json               # SurveyResponseSchema
├── templates/                         # Email templates
│   └── <category>/
│       └── <id>.md                    # EmailTemplateSchema frontmatter + body
└── server.pid                         # HTTP server PID (team mode)
```

---

## audit.log (Audit Trail)

**File:** `.agentic/audit.log`

Append-only, one JSON line per entry:

```json
{"timestamp":"2026-06-01T09:14:00Z","actor":"alice","tool":"log_interaction","slug":"acme-corp","summary":"Called about Q3 renewal"}
{"timestamp":"2026-06-01T09:30:00Z","actor":"bob","tool":"update_deal","slug":"acme-corp","summary":"Stage → negotiation, value €50k"}
{"timestamp":"2026-06-01T10:00:00Z","actor":"system","tool":"gdpr_erase","slug":"old-customer","summary":"GDPR erasure confirmed"}
```

| Field | Type | Notes |
|---|---|---|
| `timestamp` | string | ISO 8601 |
| `actor` | string | From `DXCRM_ACTOR` env var, or `"system"` |
| `tool` | string | MCP tool name or CLI command |
| `slug` | string | Customer slug (if applicable) |
| `summary` | string | Human-readable description of the action |

---

## rbac.json (Role Assignments)

**File:** `.agentic/rbac.json`

```json
{
  "actors": {
    "alice": "admin",
    "bob": "rep",
    "carol": "manager"
  },
  "default": "rep"
}
```

**Roles:**
- `admin` — Full access to all tools including `update_customer_facts`, `export_customer`, `backup_now`, `register_push_subscription`
- `manager` — `log_interaction`, `update_deal`, `pursue_goal`, all read tools
- `rep` — `log_interaction`, `update_deal`, `run_deal_agent`, `approve_agent_action`, `draft_email`, `enroll_in_sequence`, `create_ticket`, `update_ticket`, `close_ticket`, `send_nps_survey`, `create_kb_article`, `create_playbook`, `distill_playbook`, `summarize_meeting`, `generate_quote`, `get_booking_link`, all read tools

**`default`** applies when an actor has no explicit assignment.

Managed with `dxcrm rbac set|show|check`.
