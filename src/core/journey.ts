import path from "path";
import { readJsonArray, writeJsonArray } from "../fs/json-store.js";

/**
 * Journeys (N4-2 v1): branching marketing automation — a decision graph over
 * steps, in contrast to the linear email sequences. This module is the engine
 * (pure step evaluation) + storage; an enrollment runner/CLI is a follow-up.
 */
export interface JourneyCondition {
  field: string;
  equals: string | number | boolean;
}

export type JourneyStepType = "send" | "wait" | "branch" | "exit";

export interface JourneyStep {
  id: string;
  type: JourneyStepType;
  templateId?: string; // send
  waitDays?: number; // wait
  condition?: JourneyCondition; // branch
  next?: string; // send/wait
  ifTrue?: string; // branch
  ifFalse?: string; // branch
}

export interface Journey {
  id: string;
  name: string;
  entryStepId: string;
  steps: JourneyStep[];
}

export interface AdvanceResult {
  step: JourneyStep;
  nextStepId?: string;
}

export function resolveStep(journey: Journey, stepId: string): JourneyStep | undefined {
  return journey.steps.find((s) => s.id === stepId);
}

/** Evaluate a step against a context and return the next step id (if any). */
export function advance(
  journey: Journey,
  stepId: string,
  context: Record<string, unknown>
): AdvanceResult {
  const step = resolveStep(journey, stepId);
  if (!step) throw new Error(`Journey '${journey.id}' has no step '${stepId}'`);

  if (step.type === "branch" && step.condition) {
    const match = context[step.condition.field] === step.condition.equals;
    const target = match ? step.ifTrue : step.ifFalse;
    return { step, ...(target ? { nextStepId: target } : {}) };
  }
  if (step.type === "exit") {
    return { step };
  }
  return { step, ...(step.next ? { nextStepId: step.next } : {}) };
}

function journeysPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "journeys.json");
}

export function loadJourneys(dataDir: string): Journey[] {
  return readJsonArray<Journey>(journeysPath(dataDir), "journeys");
}

export function defineJourney(dataDir: string, journey: Journey): Journey[] {
  const all = loadJourneys(dataDir);
  const idx = all.findIndex((j) => j.id === journey.id);
  if (idx >= 0) all[idx] = journey;
  else all.push(journey);
  writeJsonArray(journeysPath(dataDir), "journeys", all);
  return all;
}
