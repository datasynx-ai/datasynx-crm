import fs from "fs";
import path from "path";
import { readPipeline } from "../fs/pipeline-writer.js";
import { readHealth, computeCustomerHealth } from "./relationship-health.js";
import { readGraph, getStakeholders } from "./graph.js";
import { getPipelineStages } from "./pipeline-stages.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExternalSignal {
  slug: string;
  type: "funding_round" | "leadership_change" | "news_positive" | "news_negative";
  impact: "positive" | "negative" | "neutral";
  magnitude: number; // 0.0–1.0
  summary: string;
}

export interface DealSnapshot {
  slug: string;
  name: string;
  stage: string;
  value: number;
  probability: number;
  closeDate?: string;
  healthScore: number;
  daysSinceContact: number;
  championPresent: boolean;
}

export interface SimulationInput {
  deals: DealSnapshot[];
  externalSignals: ExternalSignal[];
  iterations: number;
  horizon: "quarter" | "year";
  today: string;
}

export interface MonthForecast {
  p50: number;
  range: [number, number];
}

export interface SimulationResult {
  p10: number;
  p50: number;
  p90: number;
  expected: number;
  stdDev: number;
  atRiskRevenue: number;
  byCloseMonth: Record<string, MonthForecast>;
  topRisks: string[];
  sensitivityMap: Record<string, number>;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx]!;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function stdDevFn(values: number[], m: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function adjustProbability(deal: DealSnapshot, signals: ExternalSignal[] = []): number {
  let prob = deal.probability / 100;

  // Health adjustment: health 60 = neutral, range -0.12 to +0.08
  const healthAdj = (deal.healthScore - 60) / 100 * 0.2;
  prob += healthAdj;

  // Champion bonus
  if (deal.championPresent) prob += 0.05;

  // External signals (D18-ready)
  for (const signal of signals) {
    if (signal.slug === deal.slug) {
      if (signal.impact === "positive") prob += 0.05 * signal.magnitude;
      if (signal.impact === "negative") prob -= 0.10 * signal.magnitude;
    }
  }

  return Math.max(0.02, Math.min(0.98, prob));
}

export function closeVarianceFn(
  deal: DealSnapshot,
  randFn: () => number,
  todayMs: number = Date.now()
): number {
  const daysToClose = deal.closeDate
    ? Math.max(0, Math.floor((new Date(deal.closeDate).getTime() - todayMs) / 86_400_000))
    : 90;
  const variance = daysToClose < 30 ? 0.05 : 0.15;
  return 1 + (randFn() - 0.5) * 2 * variance;
}

export function buildSensitivityMap(
  deals: DealSnapshot[],
  signals: ExternalSignal[]
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const deal of deals) {
    map[deal.name] = Math.round(deal.value * adjustProbability(deal, signals));
  }
  return map;
}

export function buildTopRisks(
  deals: DealSnapshot[],
  signals: ExternalSignal[],
  sensitivityMap: Record<string, number>
): string[] {
  const atRisk = deals.filter((d) => d.healthScore < 60 || d.daysSinceContact > 14);
  return atRisk
    .sort((a, b) => (sensitivityMap[b.name] ?? 0) - (sensitivityMap[a.name] ?? 0))
    .slice(0, 5)
    .map((d) => {
      const reasons: string[] = [];
      if (d.healthScore < 60) reasons.push(`health ${d.healthScore}`);
      if (d.daysSinceContact > 14) reasons.push(`${d.daysSinceContact}d no contact`);
      if (!d.championPresent) reasons.push("no champion");
      return `${d.slug}/${d.name}: ${reasons.join(", ")} — €${d.value} at risk`;
    });
}

// ─── Monte Carlo Core ─────────────────────────────────────────────────────────

const MAX_ITERATIONS = 50_000;

export function runSimulation(
  input: SimulationInput,
  randFn: () => number = Math.random
): SimulationResult {
  const { deals, externalSignals } = input;
  const iterations = Math.min(input.iterations, MAX_ITERATIONS);

  if (deals.length === 0) {
    return {
      p10: 0, p50: 0, p90: 0, expected: 0, stdDev: 0,
      atRiskRevenue: 0,
      byCloseMonth: {},
      topRisks: [],
      sensitivityMap: {},
    };
  }

  const todayMs = new Date(input.today).getTime();
  const adjustedProbs = deals.map((d) => adjustProbability(d, externalSignals));
  const outcomes: number[] = [];
  const byMonthOutcomes: Record<string, number[]> = {};

  for (let i = 0; i < iterations; i++) {
    let total = 0;
    const monthTotals: Record<string, number> = {};

    for (let j = 0; j < deals.length; j++) {
      const deal = deals[j]!;
      const prob = adjustedProbs[j]!;
      if (randFn() < prob) {
        const closedValue = Math.round(deal.value * closeVarianceFn(deal, randFn, todayMs));
        total += closedValue;
        if (deal.closeDate) {
          const month = deal.closeDate.slice(0, 7);
          monthTotals[month] = (monthTotals[month] ?? 0) + closedValue;
        }
      }
    }

    outcomes.push(total);
    // Winning-only: only record months where at least one deal closed in this iteration
    for (const [month, val] of Object.entries(monthTotals)) {
      if (val > 0) {
        byMonthOutcomes[month] ??= [];
        byMonthOutcomes[month]!.push(val);
      }
    }
  }

  outcomes.sort((a, b) => a - b);
  const exp = Math.round(mean(outcomes));
  const sd = Math.round(stdDevFn(outcomes, exp));

  const byCloseMonth: Record<string, MonthForecast> = {};
  for (const [month, vals] of Object.entries(byMonthOutcomes)) {
    const sorted = [...vals].sort((a, b) => a - b);
    byCloseMonth[month] = {
      p50: Math.round(percentile(sorted, 50)),
      range: [Math.round(percentile(sorted, 10)), Math.round(percentile(sorted, 90))],
    };
  }

  const sensitivityMap = buildSensitivityMap(deals, externalSignals);
  const topRisks = buildTopRisks(deals, externalSignals, sensitivityMap);
  const atRiskRevenue = deals
    .filter((d) => d.healthScore < 60)
    .reduce((s, d) => s + d.value, 0);

  return {
    p10: Math.round(percentile(outcomes, 10)),
    p50: Math.round(percentile(outcomes, 50)),
    p90: Math.round(percentile(outcomes, 90)),
    expected: exp,
    stdDev: sd,
    atRiskRevenue,
    byCloseMonth,
    topRisks,
    sensitivityMap,
  };
}

// ─── Confidence message ───────────────────────────────────────────────────────

export function buildConfidenceMessage(result: SimulationResult, dealCount: number): string {
  const range = result.p90 - result.p10;
  const atRiskPct =
    result.expected > 0 ? Math.round((result.atRiskRevenue / result.expected) * 100) : 0;
  return `P50 forecast: €${(result.p50 / 1000).toFixed(1)}k with ±€${(range / 2 / 1000).toFixed(1)}k uncertainty (P10–P90 range). ${atRiskPct}% of pipeline is at risk. ${dealCount} deals simulated.`;
}

// ─── Quarter helper ───────────────────────────────────────────────────────────

function getQuarterEnd(date: Date): Date {
  const month = date.getMonth();
  const quarterEndMonth = Math.floor(month / 3) * 3 + 2;
  return new Date(date.getFullYear(), quarterEndMonth + 1, 0);
}

// ─── Data aggregation ─────────────────────────────────────────────────────────

export async function buildSimulationInput(
  dataDir: string,
  horizon: "quarter" | "year",
  today: string,
  externalSignals: ExternalSignal[] = []
): Promise<SimulationInput> {
  const customersDir = path.join(dataDir, "customers");
  if (!fs.existsSync(customersDir)) {
    return { deals: [], externalSignals, iterations: 10_000, horizon, today };
  }

  const slugs = fs.readdirSync(customersDir).filter((d) =>
    fs.statSync(path.join(customersDir, d)).isDirectory()
  );

  const stages = getPipelineStages(dataDir);
  const stageProb: Record<string, number> = {};
  for (const s of stages) {
    stageProb[s.id] = s.probability ?? 50;
  }

  const deals: DealSnapshot[] = [];
  const todayDate = new Date(today);
  const horizonEnd =
    horizon === "quarter" ? getQuarterEnd(todayDate) : new Date(todayDate.getFullYear(), 11, 31);

  for (const slug of slugs) {
    const pipelineDeals = await readPipeline(dataDir, slug).catch(() => []);
    if (pipelineDeals.length === 0) continue;

    const health = readHealth(dataDir, slug) ?? computeCustomerHealth(dataDir, slug, today);
    const healthScore = health.overallHealth;

    const graph = readGraph(dataDir, slug);
    const stakeholders = getStakeholders(graph);
    const championPresent = stakeholders.champions.length > 0;

    const lastContact = health.contacts
      .map((c) => c.lastContact)
      .filter((lc): lc is string => !!lc)
      .sort()
      .pop();
    const daysSinceContact = lastContact
      ? Math.floor((todayDate.getTime() - new Date(lastContact).getTime()) / 86_400_000)
      : 999;

    for (const deal of pipelineDeals) {
      if (deal.stage === "won" || deal.stage === "lost") continue;

      if (deal.close_date && deal.close_date.trim() !== "") {
        const closeDate = new Date(deal.close_date);
        if (closeDate > horizonEnd) continue;
      }

      const probability = deal.probability ?? stageProb[deal.stage] ?? 50;
      const snapshot: DealSnapshot = {
        slug,
        name: deal.name,
        stage: deal.stage,
        value: deal.value ?? 0,
        probability,
        healthScore,
        daysSinceContact,
        championPresent,
      };
      if (deal.close_date && deal.close_date.trim() !== "") {
        snapshot.closeDate = deal.close_date;
      }
      deals.push(snapshot);
    }
  }

  return { deals, externalSignals, iterations: 10_000, horizon, today };
}
