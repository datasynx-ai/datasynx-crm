import fs from "fs";
import path from "path";
import { readPipeline } from "../fs/pipeline-writer.js";
import { deriveDealTiming, scoreDealForToday } from "../core/deal-health.js";
import { computeCustomerHealth, readHealth } from "../core/relationship-health.js";
import type { InteractionEntry } from "../schemas/interaction.js";
import { readGraph, getStakeholders } from "../core/graph.js";
import { callLlm } from "../core/llm.js";
import { listPlaybooks, matchPlaybooks, type PlaybookMatch } from "../core/playbooks.js";
import type { PipelineDeal } from "../schemas/pipeline.js";
import type { DealHealthScore } from "../core/deal-health.js";
import type { HealthSnapshot } from "../core/relationship-health.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AutonomyLevel = "observe" | "suggest" | "act";
export type ActionType = "log_interaction" | "update_deal" | "alert" | "schedule_meeting";
export type ActionStatus = "pending" | "approved" | "executed" | "rejected" | "skipped";
export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface DealAgentConfig {
  slug: string;
  dealName: string;
  autonomyLevel: AutonomyLevel;
  instruction?: string;
  valueThreshold: number;
  today: string;
}

export interface DealAgentAction {
  actionId: string;
  type: ActionType;
  payload: Record<string, unknown>;
  confidence: number;
  reasoning: string;
  requiresHumanApproval: boolean;
  status: ActionStatus;
  createdAt: string;
}

export interface DealPlanStep {
  step: number;
  action: string;
  priority: "urgent" | "high" | "medium" | "low";
  reason: string;
}

export interface DealAgentTrace {
  timestamp: string;
  slug: string;
  dealName: string;
  autonomyLevel: AutonomyLevel;
  observation: string;
  plan: string[];
  actionsConsidered: DealAgentAction[];
  actionTaken: DealAgentAction | null;
  outcome: "queued" | "executed" | "observed" | "error";
}

export interface DealAgentResult {
  slug: string;
  dealName: string;
  assessment: string;
  riskLevel: RiskLevel;
  plan: DealPlanStep[];
  actionsQueued: DealAgentAction[];
  actionsExecuted: DealAgentAction[];
  trace: DealAgentTrace;
}

export interface LlmDealAnalysis {
  assessment: string;
  riskLevel: RiskLevel;
  plan: DealPlanStep[];
  actions: Array<{
    type: ActionType;
    payload: Record<string, unknown>;
    confidence: number;
    reasoning: string;
  }>;
}

export interface DealObservation {
  deal: PipelineDeal;
  daysSinceLastActivity: number;
  daysInCurrentStage: number;
  daysToClose?: number;
  dealHealthScore: DealHealthScore;
  overallRelationshipHealth: number;
  atRiskContacts: string[];
  coldContacts: string[];
  missingRoles: Array<{ role: string; urgency: string }>;
  championCount: number;
  recentInteractionsSummary: string;
  contextSummary: string;
  matchingPlaybooks?: PlaybookMatch[]; // D15: procedural memory
}

export interface AgentQueue {
  schemaVersion: "1";
  slug: string;
  pendingActions: DealAgentAction[];
  updatedAt: string;
}

// ─── File paths ───────────────────────────────────────────────────────────────

export function agentQueuePath(dataDir: string, slug: string): string {
  return path.join(dataDir, "customers", slug, "agent-queue.json");
}

// ─── Queue read / write ───────────────────────────────────────────────────────

export function readAgentQueue(dataDir: string, slug: string): AgentQueue {
  const p = agentQueuePath(dataDir, slug);
  if (!fs.existsSync(p)) {
    return { schemaVersion: "1", slug, pendingActions: [], updatedAt: new Date().toISOString() };
  }
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as AgentQueue;
  } catch {
    return { schemaVersion: "1", slug, pendingActions: [], updatedAt: new Date().toISOString() };
  }
}

export function writeAgentQueue(dataDir: string, slug: string, queue: AgentQueue): void {
  const p = agentQueuePath(dataDir, slug);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const updated: AgentQueue = { ...queue, updatedAt: new Date().toISOString() };
  fs.writeFileSync(p, JSON.stringify(updated, null, 2), "utf-8");
}

// ─── Action ID ────────────────────────────────────────────────────────────────

export function makeActionId(): string {
  return `da_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Observation helpers ──────────────────────────────────────────────────────

function buildRecentInteractionsSummary(interactionsPath: string): string {
  if (!fs.existsSync(interactionsPath)) return "(no interactions)";
  const content = fs.readFileSync(interactionsPath, "utf-8") as string;
  const blocks = content
    .split(/(?=^## \d{4}-\d{2}-\d{2})/m)
    .filter((b) => b.trim().length > 0)
    .slice(0, 3);
  return blocks
    .map((b) => {
      const dateMatch = b.match(/^## (\d{4}-\d{2}-\d{2}) · (\w+)/m);
      const summaryMatch = b.match(/^\*\*Summary:\*\*\s*(.+)$/m);
      if (!dateMatch || !summaryMatch) return "";
      return `[${dateMatch[1]!}/${dateMatch[2]!}] ${summaryMatch[1]!.trim()}`;
    })
    .filter(Boolean)
    .join("\n");
}

function buildContextSummary(data: {
  deal: PipelineDeal;
  daysSinceLastActivity: number;
  daysInCurrentStage: number;
  daysToClose: number | undefined;
  dealHealthScore: DealHealthScore;
  health: HealthSnapshot;
  atRiskContacts: string[];
  coldContacts: string[];
  missingRoles: Array<{ role: string; urgency: string }>;
  championCount: number;
  recentInteractionsSummary: string;
}): string {
  const lines: string[] = [
    `Deal: ${data.deal.name} | Stage: ${data.deal.stage} | Value: €${data.deal.value ?? "?"} | Close: ${data.deal.close_date ?? "not set"}`,
    `Days since activity: ${data.daysSinceLastActivity} | Days to close: ${data.daysToClose ?? "?"}`,
    `Deal health: grade ${data.dealHealthScore.grade} (score ${data.dealHealthScore.score})`,
    `Warnings: ${data.dealHealthScore.warnings.join("; ") || "none"}`,
    ``,
    `Relationship health: ${data.health.overallHealth}/100`,
    `At-risk contacts: ${data.atRiskContacts.join(", ") || "none"}`,
    `Cold contacts: ${data.coldContacts.join(", ") || "none"}`,
    `Missing stakeholder roles: ${data.missingRoles.map((r) => r.role).join(", ") || "none"}`,
    `Champions identified: ${data.championCount}`,
    ``,
    `Recent interactions:`,
    data.recentInteractionsSummary || "(none)",
  ];
  return lines.join("\n");
}

// ─── Observation Layer ────────────────────────────────────────────────────────

export async function observeDeal(
  dataDir: string,
  slug: string,
  dealName: string,
  today: string
): Promise<DealObservation | null> {
  const deals = await readPipeline(dataDir, slug).catch(() => [] as PipelineDeal[]);
  const deal = deals.find((d) => d.name.toLowerCase() === dealName.toLowerCase());
  if (!deal) return null;

  const todayDate = new Date(today);
  const { daysSinceLastActivity, daysInCurrentStage, daysToClose } = deriveDealTiming(
    deal,
    todayDate
  );
  const dealHealthScore = scoreDealForToday(deal, todayDate);

  // Prefer the cached health snapshot (written on each interaction); only
  // recompute — re-reading and parsing the full interactions file — when none
  // exists yet. Mirrors proactive-worker's read-then-compute pattern.
  const health = readHealth(dataDir, slug) ?? computeCustomerHealth(dataDir, slug, today);
  const atRiskContacts = health.contacts
    .filter((c) => c.riskFlags.length > 0)
    .map((c) => c.email ?? c.contactId);
  const coldContacts = health.contacts
    .filter((c) => c.trend === "cold")
    .map((c) => c.email ?? c.contactId);

  const graph = readGraph(dataDir, slug);
  const stakeholders = getStakeholders(graph);
  const missingRoles = stakeholders.missingRoles.map((r) => ({
    role: r.role,
    urgency: r.urgency,
  }));
  const championCount = stakeholders.champions.length;

  const interactionsPath = path.join(dataDir, "customers", slug, "interactions.md");
  const recentInteractionsSummary = buildRecentInteractionsSummary(interactionsPath);

  const contextSummary = buildContextSummary({
    deal,
    daysSinceLastActivity,
    daysInCurrentStage,
    daysToClose,
    dealHealthScore,
    health,
    atRiskContacts,
    coldContacts,
    missingRoles,
    championCount,
    recentInteractionsSummary,
  });

  const obs: DealObservation = {
    deal,
    daysSinceLastActivity,
    daysInCurrentStage,
    dealHealthScore,
    overallRelationshipHealth: health.overallHealth,
    atRiskContacts,
    coldContacts,
    missingRoles,
    championCount,
    recentInteractionsSummary,
    contextSummary,
  };
  if (daysToClose !== undefined) obs.daysToClose = daysToClose;

  // D15: load matching playbooks from procedural memory
  const dealSnap = {
    slug,
    name: deal.name,
    stage: deal.stage,
    value: deal.value ?? 0,
    probability: deal.probability ?? 50,
    healthScore: health.overallHealth,
    daysSinceContact: daysSinceLastActivity,
    championPresent: championCount > 0,
  };
  const allPlaybooks = listPlaybooks(dataDir, slug);
  const matchingPlaybooks = matchPlaybooks(allPlaybooks, dealSnap, daysSinceLastActivity);
  if (matchingPlaybooks.length > 0) obs.matchingPlaybooks = matchingPlaybooks;

  return obs;
}

// ─── LLM Prompt ──────────────────────────────────────────────────────────────

export function buildLlmPrompt(obs: DealObservation, config: DealAgentConfig): string {
  const instruction = config.instruction ?? "Analyze this deal and recommend next actions.";

  const playbookSection =
    obs.matchingPlaybooks && obs.matchingPlaybooks.length > 0
      ? `\n## Matching Playbooks (${obs.matchingPlaybooks.length} found — apply these proven tactics)\n` +
        obs.matchingPlaybooks
          .slice(0, 2)
          .map(
            (m) =>
              `### ${m.playbook.name} (${Math.round(m.playbook.frontmatter.successRate * 100)}% success rate, used ${m.playbook.frontmatter.usedCount}x)\n${m.playbook.content.slice(0, 500)}`
          )
          .join("\n\n")
      : "";

  return `You are a CRM deal agent. Analyze the deal situation and return an action plan.
Return ONLY valid JSON — no markdown, no explanation.

${obs.contextSummary}${playbookSection}

Instruction: ${instruction}

Respond with JSON matching exactly:
{
  "assessment": "<2-3 sentence situation assessment>",
  "riskLevel": "low" | "medium" | "high" | "critical",
  "plan": [
    { "step": 1, "action": "<what to do>", "priority": "urgent" | "high" | "medium" | "low", "reason": "<why>" }
  ],
  "actions": [
    {
      "type": "log_interaction" | "update_deal" | "alert" | "schedule_meeting",
      "payload": { /* tool-specific fields */ },
      "confidence": 0.0-1.0,
      "reasoning": "<why this action>"
    }
  ]
}

Payload schema per type:
- log_interaction: { slug, type: "Note"|"Call"|"Meeting", summary, with }
- update_deal: { slug, dealName, stage?, probability?, closeDate?, notes? }
- alert: { slug, message, urgency: "critical"|"high"|"medium" }
- schedule_meeting: { slug, with, notes }`;
}

// ─── LLM Response Parser ──────────────────────────────────────────────────────

export function parseLlmResponse(response: string): LlmDealAnalysis | null {
  try {
    const cleaned = response
      .replace(/^```(?:json)?\n?/m, "")
      .replace(/\n?```$/m, "")
      .trim();
    const parsed = JSON.parse(cleaned) as Partial<LlmDealAnalysis>;
    if (!parsed.assessment || !parsed.riskLevel || !Array.isArray(parsed.plan)) {
      return null;
    }
    return {
      assessment: String(parsed.assessment),
      riskLevel: parsed.riskLevel,
      plan: Array.isArray(parsed.plan) ? parsed.plan : [],
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
    };
  } catch {
    return null;
  }
}

// ─── Rule-Based Fallback ──────────────────────────────────────────────────────

export function buildRuleBasedAnalysis(
  obs: DealObservation,
  config: DealAgentConfig
): LlmDealAnalysis {
  const plan: DealPlanStep[] = [];
  const actions: LlmDealAnalysis["actions"] = [];
  let riskLevel: RiskLevel = "low";

  if (obs.dealHealthScore.grade === "F" || obs.coldContacts.length > 0) riskLevel = "critical";
  else if (obs.dealHealthScore.grade === "D" || obs.atRiskContacts.length > 0) riskLevel = "high";
  else if (obs.dealHealthScore.grade === "C") riskLevel = "medium";

  let step = 1;

  // D15: Playbook alerts as first plan items
  if (obs.matchingPlaybooks && obs.matchingPlaybooks.length > 0) {
    for (const match of obs.matchingPlaybooks.slice(0, 2)) {
      plan.push({
        step: step++,
        action: `Apply playbook: "${match.playbook.name}"`,
        priority: "high",
        reason: `Proven tactic (${Math.round(match.playbook.frontmatter.successRate * 100)}% success, used ${match.playbook.frontmatter.usedCount}x) — trigger: ${match.playbook.frontmatter.trigger}`,
      });
      actions.push({
        type: "alert",
        payload: {
          slug: config.slug,
          message: `Playbook available: "${match.playbook.name}" (${Math.round(match.playbook.frontmatter.successRate * 100)}% success rate)`,
          playbookContent: match.playbook.content.slice(0, 1000),
          urgency: "high",
        },
        confidence: match.playbook.frontmatter.successRate,
        reasoning: `Trigger matched: ${match.playbook.frontmatter.trigger}`,
      });
    }
  }

  if (obs.coldContacts.length > 0) {
    plan.push({
      step: step++,
      action: `Re-engage cold contacts: ${obs.coldContacts.join(", ")}`,
      priority: "urgent",
      reason: "No contact in 30+ days",
    });
    actions.push({
      type: "alert",
      payload: {
        slug: config.slug,
        message: `Cold contacts: ${obs.coldContacts.join(", ")}`,
        urgency: "critical",
      },
      confidence: 0.95,
      reasoning: "No contact in 30+ days",
    });
  }

  if (obs.atRiskContacts.length > 0) {
    plan.push({
      step: step++,
      action: `Schedule call with at-risk contacts`,
      priority: "high",
      reason: "14+ days without contact",
    });
    actions.push({
      type: "schedule_meeting",
      payload: {
        slug: config.slug,
        with: obs.atRiskContacts[0] ?? "",
        notes: "Scheduled by deal agent — relationship at risk",
      },
      confidence: 0.8,
      reasoning: "At-risk contact identified",
    });
  }

  if (obs.missingRoles.some((r) => r.role === "economic_buyer")) {
    plan.push({
      step: step++,
      action: "Identify economic buyer",
      priority: "high",
      reason: "No budget owner identified",
    });
  }

  if (obs.daysToClose !== undefined && obs.daysToClose < 14 && obs.dealHealthScore.grade !== "A") {
    plan.push({
      step: step++,
      action: "Update deal close date or probability",
      priority: "urgent",
      reason: `Close date in ${obs.daysToClose} days, deal at grade ${obs.dealHealthScore.grade}`,
    });
    actions.push({
      type: "update_deal",
      payload: {
        slug: config.slug,
        dealName: config.dealName,
        notes: `Reviewed by deal agent — ${obs.daysToClose}d to close`,
      },
      confidence: 0.75,
      reasoning: "Close date imminent",
    });
  }

  if (plan.length === 0) {
    plan.push({
      step: 1,
      action: "Maintain current cadence",
      priority: "low",
      reason: "Deal healthy",
    });
  }

  const assessment = `Deal "${config.dealName}" in stage "${obs.deal.stage}" — health grade ${obs.dealHealthScore.grade} (${obs.dealHealthScore.score}/100). Risk: ${riskLevel}.`;
  return { assessment, riskLevel, plan, actions };
}

// ─── Action Selection ─────────────────────────────────────────────────────────

export function selectActions(
  analysis: LlmDealAnalysis,
  obs: DealObservation,
  config: DealAgentConfig
): DealAgentAction[] {
  return analysis.actions.map((a) => {
    const dealValue = obs.deal.value ?? 0;
    const autoExecutable =
      config.autonomyLevel === "act" && a.confidence >= 0.7 && dealValue < config.valueThreshold;

    return {
      actionId: makeActionId(),
      type: a.type,
      payload: a.payload,
      confidence: a.confidence,
      reasoning: a.reasoning,
      requiresHumanApproval: !autoExecutable,
      status: "pending" as ActionStatus,
      createdAt: new Date().toISOString(),
    };
  });
}

// ─── Action Execution ─────────────────────────────────────────────────────────

const VALID_STAGES = ["lead", "qualified", "proposal", "negotiation", "won", "lost"] as const;

export async function executeAction(
  action: DealAgentAction,
  dataDir: string
): Promise<"executed" | "skipped"> {
  const slug = action.payload["slug"] as string | undefined;
  if (!slug) return "skipped";

  switch (action.type) {
    case "log_interaction": {
      const { appendInteraction } = await import("../fs/interactions-writer.js");
      const today = new Date().toISOString().slice(0, 10);
      await appendInteraction(dataDir, slug, {
        date: today,
        type: (action.payload["type"] as InteractionEntry["type"]) ?? "Note",
        with: String(action.payload["with"] ?? "agent"),
        summary: String(action.payload["summary"] ?? ""),
        nextSteps: [],
        sourceRef: `agent://deal-agent/${action.actionId}`,
        synced: new Date().toISOString(),
      });
      return "executed";
    }

    case "schedule_meeting": {
      const { appendInteraction } = await import("../fs/interactions-writer.js");
      const today = new Date().toISOString().slice(0, 10);
      await appendInteraction(dataDir, slug, {
        date: today,
        type: "Note",
        with: String(action.payload["with"] ?? ""),
        summary: `[Agent scheduled] ${String(action.payload["notes"] ?? "Meeting scheduled by deal agent")}`,
        nextSteps: [`Schedule meeting with ${String(action.payload["with"] ?? "contact")}`],
        sourceRef: `agent://deal-agent/${action.actionId}`,
        synced: new Date().toISOString(),
      });
      return "executed";
    }

    case "update_deal": {
      const { handleUpdateDeal } = await import("../mcp/tools/update-deal.js");
      const payload = action.payload as {
        slug: string;
        dealName: string;
        stage?: string;
        value?: number;
        probability?: number;
        closeDate?: string;
        notes?: string;
      };
      const validStage = VALID_STAGES.find((s) => s === payload.stage);
      await handleUpdateDeal(
        {
          slug: payload.slug,
          dealName: payload.dealName,
          ...(validStage !== undefined ? { stage: validStage } : {}),
          ...(payload.value !== undefined ? { value: payload.value } : {}),
          ...(payload.probability !== undefined ? { probability: payload.probability } : {}),
          ...(payload.closeDate !== undefined ? { closeDate: payload.closeDate } : {}),
          ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
        },
        dataDir
      );
      return "executed";
    }

    case "alert": {
      const queue = readAgentQueue(dataDir, slug);
      const alertAction: DealAgentAction = { ...action, status: "pending" };
      if (!queue.pendingActions.find((a) => a.actionId === action.actionId)) {
        queue.pendingActions.push(alertAction);
        writeAgentQueue(dataDir, slug, queue);
      }
      return "executed";
    }
  }
}

// ─── Main: runDealAgent ───────────────────────────────────────────────────────

export async function runDealAgent(
  config: DealAgentConfig,
  dataDir: string,
  llmFn: (prompt: string) => Promise<string> = callLlm
): Promise<DealAgentResult> {
  const timestamp = new Date().toISOString();

  const obs = await observeDeal(dataDir, config.slug, config.dealName, config.today);
  if (!obs) {
    throw new Error(`Deal "${config.dealName}" not found for customer "${config.slug}"`);
  }

  let analysis: LlmDealAnalysis;
  try {
    const prompt = buildLlmPrompt(obs, config);
    const rawResponse = await llmFn(prompt);
    analysis = parseLlmResponse(rawResponse) ?? buildRuleBasedAnalysis(obs, config);
  } catch {
    analysis = buildRuleBasedAnalysis(obs, config);
  }

  const allActions = selectActions(analysis, obs, config);

  const actionsQueued: DealAgentAction[] = [];
  const actionsExecuted: DealAgentAction[] = [];

  if (config.autonomyLevel === "observe") {
    // No side effects
  } else if (config.autonomyLevel === "suggest") {
    if (allActions.length > 0) {
      const queue = readAgentQueue(dataDir, config.slug);
      for (const action of allActions) {
        queue.pendingActions.push({ ...action, requiresHumanApproval: true });
        actionsQueued.push(action);
      }
      writeAgentQueue(dataDir, config.slug, queue);
    }
  } else {
    // act mode
    const queue = readAgentQueue(dataDir, config.slug);
    let queueDirty = false;
    for (const action of allActions) {
      if (!action.requiresHumanApproval) {
        const outcome = await executeAction(action, dataDir).catch(() => "skipped" as const);
        actionsExecuted.push({
          ...action,
          status: outcome === "executed" ? "executed" : "skipped",
        });
      } else {
        queue.pendingActions.push(action);
        actionsQueued.push(action);
        queueDirty = true;
      }
    }
    if (queueDirty) writeAgentQueue(dataDir, config.slug, queue);
  }

  const trace: DealAgentTrace = {
    timestamp,
    slug: config.slug,
    dealName: config.dealName,
    autonomyLevel: config.autonomyLevel,
    observation: obs.contextSummary,
    plan: analysis.plan.map((s) => `${s.step}. ${s.action} [${s.priority}]`),
    actionsConsidered: allActions,
    actionTaken: actionsExecuted[0] ?? null,
    outcome:
      actionsExecuted.length > 0 ? "executed" : actionsQueued.length > 0 ? "queued" : "observed",
  };

  return {
    slug: config.slug,
    dealName: config.dealName,
    assessment: analysis.assessment,
    riskLevel: analysis.riskLevel,
    plan: analysis.plan,
    actionsQueued,
    actionsExecuted,
    trace,
  };
}
