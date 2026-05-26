// src/setup/harness-content.ts
// Single Source of Truth for all harness file content.

/** Claude Code: CLAUDE.md in CRM dataDir */
export function buildClaudeMd(dataDir: string): string {
  return `# DatasynxOpenCRM — Agent Instructions

## MCP Tools Available
This workspace is connected to DatasynxOpenCRM. You have access to 8 MCP tools.

## Mandatory Workflow
1. **Before every customer conversation:** call \`get_customer_context("slug")\`
2. **After every call/meeting/email:** call \`log_interaction()\`
3. **For historical questions:** use \`search_customer_knowledge()\`
4. **Pipeline update:** call \`update_deal()\` after deal discussions

## List Customers
\`list_customers()\` → overview with last touchpoint and deal health

## Do Not Ask — Just Do
- Always load context before discussing a customer
- Always log interactions — even short Slack messages
- Never copy context manually from emails — the CRM handles this automatically

## Available Tools
- \`get_capabilities()\` — full tool reference
- \`get_customer_context(slug?)\` — full briefing, triggers Gmail sync
- \`search_customer_knowledge(slug, query)\` — search emails + transcripts
- \`list_customers()\` — all customers with status and last touchpoint
- \`log_interaction(slug, type, summary)\` — write to CRM after every interaction
- \`update_deal(slug, dealName, fields)\` — update pipeline stage/value/probability
- \`get_active_session()\` — check which customer is currently active
- \`export_customer(slug)\` — export customer data as ZIP

## Data Directory
${dataDir}`.trim();
}

/** OpenClaw / Hermes: SOUL.md */
export function buildSoulMd(framework: "openclaw" | "hermes"): string {
  return `# Identity
I am a CRM-integrated AI assistant. My purpose is to help manage customer relationships
using structured data from DatasynxOpenCRM.

# Values
- Customer context before action. I never discuss a customer without first loading their context.
- Log everything. Every interaction goes into the CRM — calls, emails, meetings, Slack threads.
- Cite sources. When I reference customer information, I cite the source (gmail://, file://).
- Brevity with completeness. Short answers that include all relevant next steps.

# Boundaries
- I do not invent customer information. If I don't know, I say so and suggest syncing.
- I do not discuss customers without their context loaded via get_customer_context().
- I do not skip logging interactions, even if asked to summarize quickly.

# Communication Style
Direct. Action-oriented. I lead with the most important insight, then supporting detail.
I use bullet points for next steps. I end every customer summary with open questions.`.trim();
}

/** Hermes SOUL.md is same as OpenClaw */
export const buildHermesSoulMd = buildSoulMd;

/** Codex / OpenClaw / Antigravity: AGENTS.md in dataDir */
export function buildAgentsMd(dataDir: string): string {
  return `# DatasynxOpenCRM Agent

## Role
You are a CRM assistant with access to structured customer data via MCP tools.

## Available Tools
- \`get_customer_context(slug?)\` — Full briefing for a customer. Call this first.
- \`search_customer_knowledge(slug, query)\` — Search emails + transcripts.
- \`list_customers()\` — All customers with status and last touchpoint.
- \`log_interaction(slug, type, summary)\` — Write back to CRM after every interaction.
- \`update_deal(slug, dealName, fields)\` — Update pipeline stage/value/probability.
- \`get_capabilities()\` — Full tool reference.
- \`get_active_session()\` — Check active customer session.
- \`export_customer(slug)\` — Export customer data.

## Mandatory Workflow
1. Customer mentioned → get_customer_context() immediately
2. Interaction complete → log_interaction() before ending session
3. Deal discussed → update_deal() with new stage/probability

## Data Location
${dataDir}

## Never
- Discuss a customer without loading context first
- Skip logging — every touchpoint matters
- Invent information — sync if data is missing`.trim();
}

/** Hermes skills file (agentskills.io standard) */
export function buildHermesSkillMd(): string {
  return `---
name: datasynx-crm
version: 1.0.0
description: CRM workflow skill for DatasynxOpenCRM
triggers:
  - "customer"
  - "client"
  - "deal"
  - "pipeline"
  - "sync"
---

# DatasynxOpenCRM Skill

## When a customer is mentioned
Always call \`get_customer_context(slug)\` first.
Never assume you know the current state — always load fresh context.

## After every interaction
Call \`log_interaction()\` with:
- type: Call | Meeting | Email | Note | Demo | Proposal
- summary: 2-5 sentences on what happened
- nextSteps: concrete actions as array

## For historical research
Use \`search_customer_knowledge(slug, query)\` — searches emails AND transcripts.

## Pipeline updates
After any deal discussion: \`update_deal(slug, dealName, { stage, probability, value })\`

## Quick reference
\`list_customers()\` for morning briefing or pipeline overview.
\`get_capabilities()\` if unsure which tool to use.`.trim();
}

/** Antigravity SKILL.md (directory-based: ~/.gemini/antigravity-cli/skills/datasynx-crm/SKILL.md) */
export function buildAgySkillMd(): string {
  return `---
name: datasynx-crm
version: 1.0.0
description: CRM workflow for DatasynxOpenCRM
triggers:
  - customer
  - client
  - deal
  - pipeline
---

# DatasynxOpenCRM Skill

## When a customer is mentioned
Call \`get_customer_context(slug)\` before discussing anything.

## After every interaction
Call \`log_interaction(slug, type, summary, nextSteps)\`.

## For research
\`search_customer_knowledge(slug, query)\` — searches emails + transcripts.

## Pipeline
\`update_deal(slug, dealName, { stage, value, probability })\` after deal talk.

## Overview
\`list_customers()\` for morning briefing.
\`get_capabilities()\` for full tool reference.`.trim();
}

/** Antigravity: global GEMINI.md (~/.gemini/GEMINI.md) — keep under 50 lines for token budget */
export function buildAgyGeminiMd(dataDir: string): string {
  return `# DatasynxOpenCRM — Agent Context

You have access to a local CRM via MCP tools (server: datasynx-opencrm).

## Workflow
- Before any customer conversation: call \`get_customer_context(slug)\`
- After calls/meetings/emails: call \`log_interaction()\`
- For historical research: call \`search_customer_knowledge(slug, query)\`
- Pipeline update: call \`update_deal()\`

## Available Tools
get_customer_context · search_customer_knowledge · list_customers
log_interaction · update_deal · get_capabilities · get_active_session · export_customer

## Data: ${dataDir}`.trim();
}

/** Grok Build: .grok/settings.json — project-level MCP config (array format) */
export function buildGrokSettingsJson(config: { serverName: string; mcpServerPath: string; dataDir: string }): string {
  const entry = {
    mcpServers: [
      {
        name: config.serverName,
        transport: {
          type: "stdio",
          command: "node",
          args: [config.mcpServerPath],
          env: { DXCRM_DATA_DIR: config.dataDir },
        },
      },
    ],
  };
  return JSON.stringify(entry, null, 2);
}

/** Cursor: .cursor/rules/datasynx-crm.mdc (MDC format with frontmatter) */
export function buildCursorRulesMdc(dataDir: string): string {
  return `---
description: DatasynxOpenCRM — CRM workflow rules
globs: ["**/*"]
alwaysApply: true
---

# DatasynxOpenCRM Rules

You have access to a local CRM via MCP tools (datasynx-opencrm).

## Mandatory Workflow
- Customer mentioned → call \`get_customer_context(slug)\` immediately
- After any call/meeting/email → call \`log_interaction()\`
- Historical question → call \`search_customer_knowledge(slug, query)\`
- Deal discussed → call \`update_deal()\`

## Available Tools
get_customer_context · search_customer_knowledge · list_customers
log_interaction · update_deal · get_capabilities · get_active_session · export_customer

## Data: ${dataDir}`.trim();
}
