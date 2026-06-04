import fs from "fs";
import path from "path";
import { writeFileAtomic } from "../fs/atomic-write.js";
import matter from "gray-matter";
import { callLlm } from "./llm.js";
import { withFileQueue } from "../fs/write-queue.js";
import type { DealSnapshot } from "./revenue-simulation.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlaybookFrontmatter {
  trigger: string;
  successRate: number;
  usedCount: number;
  lastUpdated: string;
}

export interface Playbook {
  slug: string;
  name: string;
  frontmatter: PlaybookFrontmatter;
  content: string;
  path: string;
}

export interface TriggerCondition {
  type:
    | "stage"
    | "value_gt"
    | "value_lt"
    | "days_stalled_gt"
    | "days_stalled_lt"
    | "health_lt"
    | "health_gt"
    | "no_champion"
    | "has_champion";
  value?: number;
  stage?: string;
}

export interface PlaybookMatch {
  playbook: Playbook;
  score: number;
  matchedConditions: TriggerCondition[];
  totalConditions: number;
}

export interface LlmDistillation {
  name: string;
  trigger: string;
  content: string;
  successRate: number;
  reasoning: string;
}

// ─── File paths ───────────────────────────────────────────────────────────────

export function playbooksDir(dataDir: string, slug: string): string {
  return path.join(dataDir, "customers", slug, "playbooks");
}

// ─── File operations ──────────────────────────────────────────────────────────

export function listPlaybooks(dataDir: string, slug: string): Playbook[] {
  const dir = playbooksDir(dataDir, slug);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f): Playbook => {
      const filePath = path.join(dir, f);
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = matter(raw);
      return {
        slug,
        name: f.replace(/\.md$/, ""),
        frontmatter: parsed.data as PlaybookFrontmatter,
        content: parsed.content.trim(),
        path: filePath,
      };
    });
}

export function readPlaybook(dataDir: string, slug: string, name: string): Playbook | null {
  const filePath = path.join(playbooksDir(dataDir, slug), `${name}.md`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = matter(raw);
  return {
    slug,
    name,
    frontmatter: parsed.data as PlaybookFrontmatter,
    content: parsed.content.trim(),
    path: filePath,
  };
}

export async function writePlaybook(
  dataDir: string,
  slug: string,
  playbook: Playbook
): Promise<void> {
  const dir = playbooksDir(dataDir, slug);
  const filePath = path.join(dir, `${playbook.name}.md`);
  await withFileQueue(filePath, async () => {
    fs.mkdirSync(dir, { recursive: true });
    const raw = matter.stringify(playbook.content, playbook.frontmatter);
    writeFileAtomic(filePath, raw);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function toKebabCase(name: string): string {
  return name
    .replace(/[^a-z0-9-]/gi, "-")
    .toLowerCase()
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Trigger DSL ──────────────────────────────────────────────────────────────

export interface ParsedTrigger {
  conditions: TriggerCondition[];
  operator: "AND" | "OR";
}

function parseTokens(tokens: string[]): TriggerCondition[] {
  return tokens.flatMap((token): TriggerCondition[] => {
    if (token.startsWith("deal_stage_")) {
      return [{ type: "stage", stage: token.slice("deal_stage_".length) }];
    }
    const valueGt = token.match(/^value\s*>\s*(\d+)$/);
    if (valueGt) return [{ type: "value_gt", value: Number(valueGt[1]) }];

    const valueLt = token.match(/^value\s*<\s*(\d+)$/);
    if (valueLt) return [{ type: "value_lt", value: Number(valueLt[1]) }];

    const stalledGt = token.match(/^days_stalled\s*>\s*(\d+)$/);
    if (stalledGt) return [{ type: "days_stalled_gt", value: Number(stalledGt[1]) }];

    const stalledLt = token.match(/^days_stalled\s*<\s*(\d+)$/);
    if (stalledLt) return [{ type: "days_stalled_lt", value: Number(stalledLt[1]) }];

    const healthLt = token.match(/^health\s*<\s*(\d+)$/);
    if (healthLt) return [{ type: "health_lt", value: Number(healthLt[1]) }];

    const healthGt = token.match(/^health\s*>\s*(\d+)$/);
    if (healthGt) return [{ type: "health_gt", value: Number(healthGt[1]) }];

    if (token === "no_champion") return [{ type: "no_champion" }];
    if (token === "has_champion") return [{ type: "has_champion" }];

    return []; // unknown token — silently dropped
  });
}

export function parseTrigger(triggerStr: string | null | undefined): TriggerCondition[] {
  if (!triggerStr?.trim()) return [];
  const tokens = triggerStr
    .split(/\s+AND\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  return parseTokens(tokens);
}

export function parseTriggerFull(triggerStr: string | null | undefined): ParsedTrigger {
  if (!triggerStr?.trim()) return { conditions: [], operator: "AND" };
  const orTokens = triggerStr
    .split(/\s+OR\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (orTokens.length > 1) {
    return { conditions: parseTokens(orTokens), operator: "OR" };
  }
  const andTokens = triggerStr
    .split(/\s+AND\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  return { conditions: parseTokens(andTokens), operator: "AND" };
}

export function evaluateCondition(
  cond: TriggerCondition,
  deal: DealSnapshot,
  daysSinceContact: number
): boolean {
  switch (cond.type) {
    case "stage":
      return deal.stage === cond.stage;
    case "value_gt":
      return deal.value > (cond.value ?? 0);
    case "value_lt":
      return deal.value < (cond.value ?? Infinity);
    // v1: days_stalled uses daysSinceContact as proxy (stage-change timestamps not tracked)
    case "days_stalled_gt":
      return daysSinceContact > (cond.value ?? 0);
    case "days_stalled_lt":
      return daysSinceContact < (cond.value ?? Infinity);
    case "health_lt":
      return deal.healthScore < (cond.value ?? 100);
    case "health_gt":
      return deal.healthScore > (cond.value ?? 0);
    case "no_champion":
      return !deal.championPresent;
    case "has_champion":
      return deal.championPresent;
    default:
      return false;
  }
}

export function evaluateTrigger(
  conditions: TriggerCondition[],
  deal: DealSnapshot,
  daysSinceContact: number = 0,
  operator: "AND" | "OR" = "AND"
): boolean {
  if (operator === "OR") {
    return conditions.some((c) => evaluateCondition(c, deal, daysSinceContact));
  }
  return conditions.every((c) => evaluateCondition(c, deal, daysSinceContact));
}

// ─── Matching ─────────────────────────────────────────────────────────────────

export function matchPlaybooks(
  playbooks: Playbook[],
  deal: DealSnapshot,
  daysSinceContact: number = 0
): PlaybookMatch[] {
  const results: PlaybookMatch[] = [];
  for (const pb of playbooks) {
    const { conditions, operator } = parseTriggerFull(pb.frontmatter.trigger);
    if (conditions.length === 0) continue;
    const matched = conditions.filter((c) => evaluateCondition(c, deal, daysSinceContact));
    const isMatch = operator === "OR" ? matched.length > 0 : matched.length === conditions.length;
    if (isMatch) {
      results.push({
        playbook: pb,
        score: 1.0,
        matchedConditions: matched,
        totalConditions: conditions.length,
      });
    }
  }
  return results.sort((a, b) => {
    const rateDiff =
      (b.playbook.frontmatter.successRate ?? 0) - (a.playbook.frontmatter.successRate ?? 0);
    return rateDiff !== 0
      ? rateDiff
      : (b.playbook.frontmatter.usedCount ?? 0) - (a.playbook.frontmatter.usedCount ?? 0);
  });
}

export function getBestPlaybook(
  dataDir: string,
  slug: string,
  deal: DealSnapshot,
  daysSinceContact: number = 0
): PlaybookMatch | null {
  return matchPlaybooks(listPlaybooks(dataDir, slug), deal, daysSinceContact)[0] ?? null;
}

// ─── Distillation ─────────────────────────────────────────────────────────────

export function buildDistillPrompt(
  slug: string,
  dealName: string,
  outcome: "won" | "lost",
  interactions: string
): string {
  return `You are analyzing a sales deal to extract a reusable playbook.

Customer: ${slug}
Deal: ${dealName}
Outcome: ${outcome}
Interactions (chronological):
${interactions.slice(0, 4000)}

Extract a reusable playbook from this deal's journey.

Allowed trigger tokens (combine with " AND "):
- deal_stage_<stage>    (e.g. deal_stage_negotiation)
- value > <n>           (e.g. value > 50000)
- value < <n>
- days_stalled > <n>    (e.g. days_stalled > 7)
- days_stalled < <n>
- health < <n>          (e.g. health < 60)
- health > <n>
- no_champion
- has_champion

Return JSON only (no markdown wrapper):
{
  "name": "<kebab-case-playbook-name>",
  "trigger": "<DSL string using allowed tokens>",
  "content": "<markdown with ## Situation, ## Steps, ## Warnings sections>",
  "successRate": <0.0-1.0>,
  "reasoning": "<why these trigger conditions>"
}`;
}

export function parseLlmDistillation(
  response: string,
  outcomeFallback: number = 0.5
): LlmDistillation | null {
  try {
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Partial<LlmDistillation>;
    if (!parsed.name || !parsed.trigger || !parsed.content) return null;
    return {
      name: parsed.name,
      trigger: parsed.trigger,
      content: parsed.content,
      successRate: typeof parsed.successRate === "number" ? parsed.successRate : outcomeFallback,
      reasoning: parsed.reasoning ?? "",
    };
  } catch {
    return null;
  }
}

export type DistillPlaybookResult =
  | { ok: true; playbook: Playbook; reasoning: string }
  | { ok: false; errorKind: "no_interactions" | "parse_failed" };

export async function distillPlaybook(
  dataDir: string,
  slug: string,
  dealName: string,
  outcome: "won" | "lost",
  llmFn: (prompt: string) => Promise<string> = callLlm
): Promise<DistillPlaybookResult> {
  const interactionsPath = path.join(dataDir, "customers", slug, "interactions.md");
  if (!fs.existsSync(interactionsPath)) return { ok: false, errorKind: "no_interactions" };

  const interactions = fs.readFileSync(interactionsPath, "utf-8");
  const prompt = buildDistillPrompt(slug, dealName, outcome, interactions);
  const response = await llmFn(prompt);

  const outcomeFallback = outcome === "won" ? 1.0 : 0.0;
  const distillation = parseLlmDistillation(response, outcomeFallback);
  if (!distillation) return { ok: false, errorKind: "parse_failed" };

  const today = new Date().toISOString().slice(0, 10);
  const name = toKebabCase(distillation.name);

  const playbook: Playbook = {
    slug,
    name,
    frontmatter: {
      trigger: distillation.trigger,
      successRate: distillation.successRate,
      usedCount: 1,
      lastUpdated: today,
    },
    content: distillation.content,
    path: path.join(playbooksDir(dataDir, slug), `${name}.md`),
  };

  await writePlaybook(dataDir, slug, playbook);
  return { ok: true, playbook, reasoning: distillation.reasoning };
}
