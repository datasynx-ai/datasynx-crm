import fs from "fs";
import path from "path";

export interface PipelineStage {
  id: string;
  label: string;
  color?: string;
  order: number;
  isFinal?: boolean;
  probability?: number;
}

export const DEFAULT_STAGES: PipelineStage[] = [
  { id: "lead",        label: "Lead",        order: 1, probability: 10 },
  { id: "qualified",   label: "Qualified",   order: 2, probability: 30 },
  { id: "proposal",    label: "Proposal",    order: 3, probability: 50 },
  { id: "negotiation", label: "Negotiation", order: 4, probability: 75 },
  { id: "won",         label: "Won",         order: 5, isFinal: true, probability: 100 },
  { id: "lost",        label: "Lost",        order: 6, isFinal: true, probability: 0 },
];

function stagesPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "pipeline-stages.json");
}

export function getPipelineStages(dataDir: string): PipelineStage[] {
  const p = stagesPath(dataDir);
  if (!fs.existsSync(p)) return DEFAULT_STAGES;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8") as string) as PipelineStage[];
  } catch {
    return DEFAULT_STAGES;
  }
}

export function setPipelineStage(dataDir: string, stage: PipelineStage): void {
  const stages = getPipelineStages(dataDir);
  const idx = stages.findIndex((s) => s.id === stage.id);
  if (idx >= 0) stages[idx] = stage;
  else stages.push(stage);
  stages.sort((a, b) => a.order - b.order);
  fs.mkdirSync(path.dirname(stagesPath(dataDir)), { recursive: true });
  fs.writeFileSync(stagesPath(dataDir), JSON.stringify(stages, null, 2));
}

export function deletePipelineStage(dataDir: string, id: string): void {
  const stages = getPipelineStages(dataDir).filter((s) => s.id !== id);
  fs.mkdirSync(path.dirname(stagesPath(dataDir)), { recursive: true });
  fs.writeFileSync(stagesPath(dataDir), JSON.stringify(stages, null, 2));
}

export function resetToDefaults(dataDir: string): void {
  fs.mkdirSync(path.dirname(stagesPath(dataDir)), { recursive: true });
  fs.writeFileSync(stagesPath(dataDir), JSON.stringify(DEFAULT_STAGES, null, 2));
}
