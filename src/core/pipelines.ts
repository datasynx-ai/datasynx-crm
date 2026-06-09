import fs from "fs";
import path from "path";
import { readJsonFile, writeJsonFile } from "../fs/json-store.js";
import {
  getPipelineStages,
  setPipelineStage,
  DEFAULT_STAGES,
  type PipelineStage,
} from "./pipeline-stages.js";

/**
 * Multiple parallel pipelines (#47): each pipeline carries its own stage set
 * (e.g. new-business vs. renewals). The `default` pipeline maps onto the
 * existing global stage list (`.agentic/pipeline-stages.json`), so existing
 * data keeps working unchanged. Named pipelines live in
 * `.agentic/pipelines/<id>.json`.
 *
 * Convention: every pipeline keeps `won` and `lost` as its final stage ids —
 * all analytics (forecast, funnel, velocity, snapshots) rely on it.
 */
export const DEFAULT_PIPELINE_ID = "default";

export interface PipelineDef {
  id: string;
  label: string;
  stages: PipelineStage[];
}

function pipelinesDir(dataDir: string): string {
  return path.join(dataDir, ".agentic", "pipelines");
}
function pipelinePath(dataDir: string, id: string): string {
  return path.join(pipelinesDir(dataDir), `${id}.json`);
}

/** All pipeline ids, `default` always first. */
export function listPipelines(dataDir: string): PipelineDef[] {
  const named: PipelineDef[] = [];
  const dir = pipelinesDir(dataDir);
  if (fs.existsSync(dir)) {
    for (const f of fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort()) {
      const def = readJsonFile<PipelineDef | null>(path.join(dir, f), null);
      if (def?.id && Array.isArray(def.stages)) named.push(def);
    }
  }
  return [
    { id: DEFAULT_PIPELINE_ID, label: "Default", stages: getPipelineStages(dataDir) },
    ...named,
  ];
}

export function getPipelineDef(dataDir: string, id: string): PipelineDef | null {
  if (id === DEFAULT_PIPELINE_ID) {
    return { id, label: "Default", stages: getPipelineStages(dataDir) };
  }
  return readJsonFile<PipelineDef | null>(pipelinePath(dataDir, id), null);
}

/** Create a named pipeline; starts from the default stage set unless given. */
export function createPipeline(
  dataDir: string,
  def: { id: string; label?: string; stages?: PipelineStage[] }
): PipelineDef {
  if (def.id === DEFAULT_PIPELINE_ID) {
    throw new Error(`'${DEFAULT_PIPELINE_ID}' already exists (the built-in pipeline).`);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(def.id)) {
    throw new Error("Pipeline id must be lowercase alphanumeric/hyphens.");
  }
  const pipeline: PipelineDef = {
    id: def.id,
    label: def.label ?? def.id,
    stages: def.stages ?? DEFAULT_STAGES,
  };
  writeJsonFile(pipelinePath(dataDir, def.id), pipeline);
  return pipeline;
}

/** Upsert a stage inside a pipeline (default → global stage list). */
export function setStageForPipeline(
  dataDir: string,
  pipelineId: string,
  stage: PipelineStage
): void {
  if (pipelineId === DEFAULT_PIPELINE_ID) {
    setPipelineStage(dataDir, stage);
    return;
  }
  const def = getPipelineDef(dataDir, pipelineId);
  if (!def) throw new Error(`Pipeline '${pipelineId}' not found.`);
  const idx = def.stages.findIndex((s) => s.id === stage.id);
  if (idx >= 0) def.stages[idx] = stage;
  else def.stages.push(stage);
  def.stages.sort((a, b) => a.order - b.order);
  writeJsonFile(pipelinePath(dataDir, pipelineId), def);
}

/** Valid stage ids for a pipeline; null when the pipeline doesn't exist. */
export function validStageIds(dataDir: string, pipelineId: string): Set<string> | null {
  const def = getPipelineDef(dataDir, pipelineId);
  if (!def) return null;
  return new Set(def.stages.map((s) => s.id));
}

/** Stage → default probability map for a pipeline (forecast/simulation). */
export function stageProbabilities(dataDir: string, pipelineId: string): Record<string, number> {
  const def = getPipelineDef(dataDir, pipelineId);
  const out: Record<string, number> = {};
  for (const s of def?.stages ?? []) out[s.id] = s.probability ?? 50;
  return out;
}

/** A deal's pipeline id, treating missing/blank as the default pipeline. */
export function dealPipelineId(deal: { pipeline?: string | undefined }): string {
  const p = deal.pipeline?.trim();
  return p && p.length > 0 ? p : DEFAULT_PIPELINE_ID;
}
