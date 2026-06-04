import path from "path";
import { readPipelineSync } from "../fs/pipeline-writer.js";
import { listCustomerSlugs } from "../fs/customer-dir.js";
import { readJsonFile, writeJsonFile } from "../fs/json-store.js";
import { scoreOpportunity } from "./opportunity-score.js";
import type { PipelineDeal } from "../schemas/pipeline.js";

/**
 * Predictive lead/opportunity scoring (domino D14 / C8): a dependency-free
 * logistic-regression model learned from the workspace's own won/lost history.
 * Features are deliberately simple and always available at prediction time —
 * deal value (log-scaled) and stated probability — so the model stays explainable
 * and needs no external ML runtime (that lives in the agent framework, not here).
 * Falls back to the deterministic heuristic when there isn't enough history.
 */
export interface LeadModel {
  weights: number[];
  bias: number;
  mean: number[];
  std: number[];
  trainedOn: number;
  sufficient: boolean;
}

const MODEL_FILE = ".agentic/lead-model.json";
const FEATURES = 2; // [log10(value+1), probability/100]

function modelPath(dataDir: string): string {
  return path.join(dataDir, MODEL_FILE);
}

function features(deal: PipelineDeal): number[] {
  return [Math.log10((deal.value ?? 0) + 1), (deal.probability ?? 0) / 100];
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/** Read every customer's closed (won/lost) deals as labelled training rows. */
export function gatherTrainingDeals(dataDir: string): Array<{ x: number[]; y: number }> {
  const rows: Array<{ x: number[]; y: number }> = [];
  for (const slug of listCustomerSlugs(dataDir)) {
    let deals: PipelineDeal[] = [];
    try {
      deals = readPipelineSync(dataDir, slug);
    } catch {
      deals = [];
    }
    for (const d of deals) {
      if (d.stage === "won") rows.push({ x: features(d), y: 1 });
      else if (d.stage === "lost") rows.push({ x: features(d), y: 0 });
    }
  }
  return rows;
}

/** Train a logistic-regression model from the workspace's won/lost history. */
export function buildLeadModel(dataDir: string): LeadModel {
  const rows = gatherTrainingDeals(dataDir);
  const classes = new Set(rows.map((r) => r.y));
  const sufficient = rows.length >= 4 && classes.size === 2;

  const empty: LeadModel = {
    weights: new Array(FEATURES).fill(0),
    bias: 0,
    mean: new Array(FEATURES).fill(0),
    std: new Array(FEATURES).fill(1),
    trainedOn: rows.length,
    sufficient,
  };
  if (!sufficient) return empty;

  // Standardize features for stable gradient descent.
  const mean = new Array(FEATURES).fill(0);
  for (const r of rows) for (let j = 0; j < FEATURES; j++) mean[j] += r.x[j]! / rows.length;
  const std = new Array(FEATURES).fill(0);
  for (const r of rows)
    for (let j = 0; j < FEATURES; j++) std[j] += (r.x[j]! - mean[j]) ** 2 / rows.length;
  for (let j = 0; j < FEATURES; j++) std[j] = Math.sqrt(std[j]) || 1;

  const norm = rows.map((r) => ({
    x: r.x.map((v, j) => (v - mean[j]) / std[j]),
    y: r.y,
  }));

  const weights = new Array(FEATURES).fill(0);
  let bias = 0;
  const lr = 0.1;
  const iterations = 2000;
  for (let it = 0; it < iterations; it++) {
    const gradW = new Array(FEATURES).fill(0);
    let gradB = 0;
    for (const r of norm) {
      const z = bias + weights.reduce((acc, w, j) => acc + w * r.x[j]!, 0);
      const err = sigmoid(z) - r.y;
      for (let j = 0; j < FEATURES; j++) gradW[j] += (err * r.x[j]!) / norm.length;
      gradB += err / norm.length;
    }
    for (let j = 0; j < FEATURES; j++) weights[j] -= lr * gradW[j];
    bias -= lr * gradB;
  }

  return { weights, bias, mean, std, trainedOn: rows.length, sufficient: true };
}

/** Predict win probability (0–1). Falls back to the heuristic when untrained. */
export function predictWin(model: LeadModel, deal: PipelineDeal): number {
  if (!model.sufficient) return scoreOpportunity(deal).score / 100;
  const x = features(deal).map((v, j) => (v - model.mean[j]!) / model.std[j]!);
  const z = model.bias + model.weights.reduce((acc, w, j) => acc + w * x[j]!, 0);
  return sigmoid(z);
}

export function saveLeadModel(dataDir: string, model: LeadModel): void {
  writeJsonFile(modelPath(dataDir), model);
}

export function loadLeadModel(dataDir: string): LeadModel | null {
  return readJsonFile<LeadModel | null>(modelPath(dataDir), null);
}
