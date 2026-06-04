import fs from "fs";
import path from "path";
import { runSimulation } from "./revenue-simulation.js";
import { callLlm } from "./llm.js";
import { getActor } from "../fs/audit-log.js";
import { withJsonFile } from "./file-lock.js";
import { guardIsoDate } from "./input-guard.js";
import type { DealSnapshot, SimulationInput } from "./revenue-simulation.js";
import { readPipeline } from "../fs/pipeline-writer.js";
import { listCustomerSlugs } from "../fs/customer-dir.js";
import { writeJsonFile } from "../fs/json-store.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GoalMetric = "revenue" | "deals_closed" | "meetings_booked" | "pipeline_created";
export type GoalType = "revenue" | "pipeline" | "relationship" | "churn_prevention";
export type GoalStatus = "active" | "completed" | "cancelled" | "blocked";

export interface GoalSubGoal {
  priority: number;
  action: string;
  slug: string;
  dealName?: string;
  why: string;
  nextStep: string;
  targetDelta: number;
  playbookName?: string;
}

export interface GoalDecomposition {
  analysis: string;
  currentPipeline: number;
  gap: number;
  subGoals: GoalSubGoal[];
  probabilisticOutcome: string;
  decomposedAt: string;
}

export interface Goal {
  id: string;
  description: string;
  type: GoalType;
  target: number;
  metric: GoalMetric;
  deadline: string;
  decomposition: GoalDecomposition;
  progress: number;
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
  actor: string;
}

export type BuildInputFn = (
  dataDir: string,
  horizon: "quarter" | "year",
  today: string
) => Promise<SimulationInput>;

// ─── Persistence ──────────────────────────────────────────────────────────────

export function goalsPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "goals.json");
}

export function readGoals(dataDir: string): Goal[] {
  const p = goalsPath(dataDir);
  if (!fs.existsSync(p)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8") as string) as unknown;
    if (Array.isArray(raw)) return raw as Goal[];
    return (raw as { goals?: Goal[] }).goals ?? [];
  } catch {
    return [];
  }
}

export function writeGoals(dataDir: string, goals: Goal[]): void {
  writeJsonFile(goalsPath(dataDir), { goals, updatedAt: new Date().toISOString() });
}

export function makeGoalId(): string {
  return `goal_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

export function parseTargetFromDescription(desc: string): number {
  // Try millions first: "1.5M", "1.5 million", "$1.5M"
  const millionMatch = desc.match(/[\$€£]?\s*(\d+(?:\.\d+)?)\s*(?:M\b|million)/i);
  if (millionMatch) return Math.round(parseFloat(millionMatch[1]!) * 1_000_000);

  // Then thousands: "500k", "€500k"
  const kMatch = desc.match(/[\$€£]?\s*(\d+(?:\.\d+)?)\s*k\b/i);
  if (kMatch) return Math.round(parseFloat(kMatch[1]!) * 1_000);

  // Then raw numbers with optional currency: "€75000"
  const rawMatch = desc.match(/[\$€£]\s*(\d{4,}(?:[,.\d]*\d)?)/);
  if (rawMatch) return parseInt(rawMatch[1]!.replace(/[,. ]/g, ""), 10);

  return 0;
}

export function inferGoalType(desc: string): GoalType {
  const lower = desc.toLowerCase();
  if (/churn|retain|renewal|renew/.test(lower)) return "churn_prevention";
  if (/meeting|call|book|relationship|contact/.test(lower)) return "relationship";
  if (/pipeline|prospect|lead|qualify/.test(lower)) return "pipeline";
  return "revenue";
}

export function inferMetric(type: GoalType): GoalMetric {
  switch (type) {
    case "pipeline":
      return "pipeline_created";
    case "relationship":
      return "meetings_booked";
    case "revenue":
      return "revenue";
    case "churn_prevention":
      return "revenue";
  }
}

// ─── Rule-based decomposition ─────────────────────────────────────────────────

export function rankDealsByLeverage(deals: DealSnapshot[]): DealSnapshot[] {
  return deals
    .filter((d) => d.stage !== "won" && d.stage !== "lost")
    .sort((a, b) => {
      const leverageA = a.value * (a.probability / 100) * (a.healthScore / 100);
      const leverageB = b.value * (b.probability / 100) * (b.healthScore / 100);
      return leverageB - leverageA;
    });
}

function generateNextStep(deal: DealSnapshot): string {
  if (deal.healthScore < 40 && !deal.championPresent)
    return "Re-engage urgently and identify a champion";
  if (deal.healthScore < 60) return "Schedule an urgent check-in call";
  if (deal.daysSinceContact > 14) return "Reach out — contact is overdue";
  if (!deal.championPresent) return "Identify a champion or economic buyer";
  return "Push to next pipeline stage";
}

export function decomposeGoalRuleBased(
  deals: DealSnapshot[],
  target: number,
  currentP50: number,
  today: string,
  playbookLookup?: (slug: string, deal: DealSnapshot) => string | undefined
): GoalDecomposition {
  const gap = Math.max(0, target - currentP50);
  const decomposedAt = new Date(today + "T00:00:00Z").toISOString();

  if (gap === 0) {
    return {
      analysis: `Current pipeline (P50: €${currentP50.toLocaleString()}) already meets or exceeds the target of €${target.toLocaleString()}.`,
      currentPipeline: currentP50,
      gap: 0,
      subGoals: [],
      probabilisticOutcome: `Pipeline P50 (€${currentP50.toLocaleString()}) ≥ target (€${target.toLocaleString()}).`,
      decomposedAt,
    };
  }

  const ranked = rankDealsByLeverage(deals);

  if (ranked.length === 0) {
    return {
      analysis: `No active deals found. Gap to close: €${gap.toLocaleString()}. Focus on building pipeline.`,
      currentPipeline: currentP50,
      gap,
      subGoals: [
        {
          priority: 1,
          action: "Build pipeline from scratch",
          slug: "_all",
          why: `No active deals. Need €${gap.toLocaleString()} to reach target.`,
          nextStep:
            "Use list_customers() to find prospects and log_interaction to initiate outreach",
          targetDelta: target,
        },
      ],
      probabilisticOutcome: `Insufficient pipeline. Need €${gap.toLocaleString()} in new deals.`,
      decomposedAt,
    };
  }

  const subGoals: GoalSubGoal[] = [];
  let cumulative = 0;

  for (const deal of ranked.slice(0, 5)) {
    if (subGoals.length >= 5) break;
    const playbookName = playbookLookup?.(deal.slug, deal);
    const subGoal: GoalSubGoal = {
      priority: subGoals.length + 1,
      action: `Accelerate ${deal.slug}/${deal.name}`,
      slug: deal.slug,
      ...(deal.name ? { dealName: deal.name } : {}),
      why: `€${deal.value.toLocaleString()} deal in ${deal.stage} — health ${deal.healthScore}/100`,
      nextStep: generateNextStep(deal),
      targetDelta: deal.value,
      ...(playbookName ? { playbookName } : {}),
    };
    subGoals.push(subGoal);
    cumulative += deal.value;
    if (cumulative >= gap) break;
  }

  const projectedTotal = currentP50 + cumulative;
  return {
    analysis: `Current pipeline P50: €${currentP50.toLocaleString()}. Gap to target: €${gap.toLocaleString()}. Top ${subGoals.length} deal(s) identified.`,
    currentPipeline: currentP50,
    gap,
    subGoals,
    probabilisticOutcome: `If all recommended deals close: ~€${projectedTotal.toLocaleString()} (target: €${target.toLocaleString()}).`,
    decomposedAt,
  };
}

// ─── LLM path ─────────────────────────────────────────────────────────────────

export function buildDecompositionPrompt(
  description: string,
  target: number,
  deadline: string,
  currentP50: number,
  deals: DealSnapshot[],
  today: string
): string {
  const gap = Math.max(0, target - currentP50);
  const dealLines = deals
    .filter((d) => d.stage !== "won" && d.stage !== "lost")
    .slice(0, 8)
    .map(
      (d, i) =>
        `${i + 1}. ${d.slug}/${d.name} — €${d.value.toLocaleString()}, stage: ${d.stage}, health: ${d.healthScore}/100, probability: ${d.probability}%${d.championPresent ? ", champion ✓" : ""}`
    )
    .join("\n");

  return `You are a sales strategy AI helping decompose a revenue goal into actionable sub-goals.

Goal: ${description}
Target: €${target.toLocaleString()}
Deadline: ${deadline}
Current date: ${today}
Current weighted pipeline (P50): €${currentP50.toLocaleString()}
Gap to close: €${gap.toLocaleString()}

Active deals (sorted by weighted value):
${dealLines || "(no active deals)"}

Return JSON only (no markdown wrapper):
{
  "analysis": "<1-2 sentence summary of the situation>",
  "subGoals": [
    {
      "priority": 1,
      "action": "<what to do>",
      "slug": "<customer-slug>",
      "dealName": "<deal name>",
      "why": "<why this deal matters for the goal>",
      "nextStep": "<concrete next action with deadline>",
      "targetDelta": <expected revenue contribution in euros>
    }
  ],
  "probabilisticOutcome": "<P50 forecast summary after actions>"
}`;
}

export function parseLlmDecomposition(
  response: string,
  fallback: GoalDecomposition
): GoalDecomposition {
  try {
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]) as Partial<{
      analysis: string;
      subGoals: unknown[];
      probabilisticOutcome: string;
    }>;
    if (!parsed.analysis || !Array.isArray(parsed.subGoals)) return fallback;
    return {
      analysis: parsed.analysis,
      currentPipeline: fallback.currentPipeline,
      gap: fallback.gap,
      subGoals: (parsed.subGoals as Partial<GoalSubGoal>[]).map((s, i) => ({
        priority: s.priority ?? i + 1,
        action: s.action ?? "",
        slug: s.slug ?? "_all",
        ...(s.dealName ? { dealName: s.dealName } : {}),
        why: s.why ?? "",
        nextStep: s.nextStep ?? "",
        targetDelta: s.targetDelta ?? 0,
        ...(s.playbookName ? { playbookName: s.playbookName } : {}),
      })),
      probabilisticOutcome: parsed.probabilisticOutcome ?? fallback.probabilisticOutcome,
      decomposedAt: fallback.decomposedAt,
    };
  } catch {
    return fallback;
  }
}

// ─── pursueGoal ───────────────────────────────────────────────────────────────

export async function pursueGoal(
  dataDir: string,
  input: { description: string; deadline: string; context?: string },
  options: {
    llmFn?: (prompt: string) => Promise<string>;
    buildInputFn?: BuildInputFn;
    today?: string;
    actor?: string;
  } = {}
): Promise<Goal> {
  guardIsoDate(input.deadline, "deadline");
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const actor = options.actor ?? getActor();

  const buildFn =
    options.buildInputFn ??
    ((async (dir, horizon, t) => {
      const { buildSimulationInput } = await import("./revenue-simulation.js");
      return buildSimulationInput(dir, horizon, t);
    }) as BuildInputFn);

  const simInput = await buildFn(dataDir, "quarter", today);
  const simResult = runSimulation(simInput);
  const currentP50 = simResult.p50;
  const deals = simInput.deals;

  const target = parseTargetFromDescription(input.description);
  const type = inferGoalType(input.description);
  const metric = inferMetric(type);

  const ruleBasedDecomp = decomposeGoalRuleBased(deals, target, currentP50, today);

  let decomposition = ruleBasedDecomp;
  const llmFn = options.llmFn ?? callLlm;
  if (options.llmFn !== undefined) {
    const prompt = buildDecompositionPrompt(
      input.description,
      target,
      input.deadline,
      currentP50,
      deals,
      today
    );
    const response = await llmFn(prompt);
    decomposition = parseLlmDecomposition(response, ruleBasedDecomp);
  }

  const now = new Date().toISOString();
  const goal: Goal = {
    id: makeGoalId(),
    description: input.description,
    type,
    target,
    metric,
    deadline: input.deadline,
    decomposition,
    progress: 0,
    status: "active",
    createdAt: now,
    updatedAt: now,
    actor,
  };

  await withJsonFile<{ goals: Goal[]; updatedAt: string }>(goalsPath(dataDir), (current) => {
    const existing: Goal[] = Array.isArray(current?.goals) ? current.goals : [];
    return { goals: [...existing, goal], updatedAt: new Date().toISOString() };
  });
  return goal;
}

// ─── Goal management ──────────────────────────────────────────────────────────

export function getActiveGoals(dataDir: string): Goal[] {
  return readGoals(dataDir).filter((g) => g.status === "active");
}

export async function updateGoalProgress(
  dataDir: string,
  goalId: string,
  progress: number
): Promise<Goal | null> {
  let updated: Goal | null = null;
  await withJsonFile<{ goals: Goal[]; updatedAt: string }>(goalsPath(dataDir), (current) => {
    const goals: Goal[] = Array.isArray(current?.goals) ? [...current.goals] : [];
    const idx = goals.findIndex((g) => g.id === goalId);
    if (idx >= 0) {
      updated = { ...goals[idx]!, progress, updatedAt: new Date().toISOString() };
      goals[idx] = updated;
    }
    return { goals, updatedAt: new Date().toISOString() };
  });
  return updated;
}

export async function cancelGoal(dataDir: string, goalId: string): Promise<Goal | null> {
  let cancelled: Goal | null = null;
  await withJsonFile<{ goals: Goal[]; updatedAt: string }>(goalsPath(dataDir), (current) => {
    const goals: Goal[] = Array.isArray(current?.goals) ? [...current.goals] : [];
    const idx = goals.findIndex((g) => g.id === goalId);
    if (idx >= 0) {
      cancelled = {
        ...goals[idx]!,
        status: "cancelled" as const,
        updatedAt: new Date().toISOString(),
      };
      goals[idx] = cancelled;
    }
    return { goals, updatedAt: new Date().toISOString() };
  });
  return cancelled;
}

// ─── Pipeline-driven progress sync ────────────────────────────────────────────

export interface SyncResult {
  updated: string[];
  skipped: number;
}

export async function syncGoalProgressFromPipeline(
  dataDir: string,
  _today?: string
): Promise<SyncResult> {
  const activeGoals = getActiveGoals(dataDir);
  const revenueGoals = activeGoals.filter((g) => g.metric === "revenue" && g.target > 0);

  if (revenueGoals.length === 0) return { updated: [], skipped: activeGoals.length };

  let totalWon = 0;
  for (const slug of listCustomerSlugs(dataDir)) {
    const deals = await readPipeline(dataDir, slug).catch(() => []);
    for (const deal of deals) {
      if (deal.stage === "won") totalWon += deal.value ?? 0;
    }
  }

  const updated: string[] = [];
  for (const goal of revenueGoals) {
    const progress = Math.min(100, Math.round((totalWon / goal.target) * 100));
    const result = await updateGoalProgress(dataDir, goal.id, progress);
    if (result) updated.push(goal.id);
  }

  return { updated, skipped: activeGoals.length - revenueGoals.length };
}
