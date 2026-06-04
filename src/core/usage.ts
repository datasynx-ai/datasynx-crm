import fs from "fs";
import path from "path";

/**
 * LLM token-cost observability (domino D3 / F7). Every LLM call can record its
 * token usage + computed cost, attributed per customer/tool, into an append-only
 * NDJSON ledger. Basis for cost transparency and outcome/consumption pricing.
 */
export interface UsageEntry {
  timestamp: string;
  slug?: string;
  tool?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface PricePerMillion {
  input: number;
  output: number;
}

// USD per 1M tokens. Override via .agentic/llm-pricing.json. Defaults are
// conservative Haiku-class estimates — verify against current provider pricing.
const DEFAULT_PRICING: Record<string, PricePerMillion> = {
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  default: { input: 1.0, output: 5.0 },
};

function ledgerPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "usage.ndjson");
}

function loadPricing(dataDir: string): Record<string, PricePerMillion> {
  const p = path.join(dataDir, ".agentic", "llm-pricing.json");
  if (!fs.existsSync(p)) return DEFAULT_PRICING;
  try {
    const custom = JSON.parse(fs.readFileSync(p, "utf-8") as string) as Record<
      string,
      PricePerMillion
    >;
    return { ...DEFAULT_PRICING, ...custom };
  } catch {
    return DEFAULT_PRICING;
  }
}

export function computeCost(
  pricing: Record<string, PricePerMillion>,
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const price = pricing[model] ?? pricing["default"]!;
  const cost = (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function recordUsage(
  dataDir: string,
  u: { slug?: string; tool?: string; model: string; inputTokens: number; outputTokens: number }
): void {
  const entry: UsageEntry = {
    timestamp: new Date().toISOString(),
    ...(u.slug ? { slug: u.slug } : {}),
    ...(u.tool ? { tool: u.tool } : {}),
    model: u.model,
    inputTokens: u.inputTokens,
    outputTokens: u.outputTokens,
    costUsd: computeCost(loadPricing(dataDir), u.model, u.inputTokens, u.outputTokens),
  };
  const p = ledgerPath(dataDir);
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    /* non-fatal: usage logging must never break an LLM call */
  }
}

export function loadUsage(dataDir: string): UsageEntry[] {
  const p = ledgerPath(dataDir);
  if (!fs.existsSync(p)) return [];
  try {
    return (fs.readFileSync(p, "utf-8") as string)
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as UsageEntry);
  } catch {
    return [];
  }
}

export interface UsageAggregate {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  calls: number;
  bySlug: Record<
    string,
    { inputTokens: number; outputTokens: number; costUsd: number; calls: number }
  >;
}

export function aggregateUsage(dataDir: string, opts: { slug?: string } = {}): UsageAggregate {
  const agg: UsageAggregate = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUsd: 0,
    calls: 0,
    bySlug: {},
  };
  for (const e of loadUsage(dataDir)) {
    if (opts.slug && e.slug !== opts.slug) continue;
    agg.totalInputTokens += e.inputTokens;
    agg.totalOutputTokens += e.outputTokens;
    agg.totalCostUsd += e.costUsd;
    agg.calls++;
    const key = e.slug ?? "(unattributed)";
    const b = agg.bySlug[key] ?? { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 };
    b.inputTokens += e.inputTokens;
    b.outputTokens += e.outputTokens;
    b.costUsd += e.costUsd;
    b.calls++;
    agg.bySlug[key] = b;
  }
  agg.totalCostUsd = Math.round(agg.totalCostUsd * 1_000_000) / 1_000_000;
  return agg;
}
