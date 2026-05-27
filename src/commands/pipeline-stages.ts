import { Command } from "commander";
import {
  getPipelineStages,
  setPipelineStage,
  deletePipelineStage,
  resetToDefaults,
  type PipelineStage,
} from "../core/pipeline-stages.js";
import { success, error, info, bold } from "../ui/colors.js";

function printStagesTable(stages: PipelineStage[]): void {
  console.log(bold("\n Pipeline Stages\n"));
  console.log(
    info(
      `  ${"ID".padEnd(20)} ${"Label".padEnd(20)} ${"Order".padEnd(8)} ${"Prob%".padEnd(8)} ${"Final".padEnd(6)} Color`
    )
  );
  console.log(info(`  ${"─".repeat(72)}`));
  for (const s of stages) {
    const prob = s.probability !== undefined ? String(s.probability) : "-";
    const isFinal = s.isFinal ? "yes" : "no";
    const color = s.color ?? "-";
    console.log(
      info(
        `  ${s.id.padEnd(20)} ${s.label.padEnd(20)} ${String(s.order).padEnd(8)} ${prob.padEnd(8)} ${isFinal.padEnd(6)} ${color}`
      )
    );
  }
  console.log("");
}

export const stagesCommand = new Command("stages").description(
  "Manage custom pipeline stages"
);

stagesCommand
  .command("list")
  .description("List all configured pipeline stages")
  .action(() => {
    const dataDir = process.cwd();
    const stages = getPipelineStages(dataDir);
    printStagesTable(stages);
  });

stagesCommand
  .command("set <id> <label>")
  .description("Create or update a pipeline stage")
  .option("--order <n>", "Sort order (number)", "1")
  .option("--probability <n>", "Default win probability 0-100")
  .option("--color <hex>", "Hex color code (e.g. #3B82F6)")
  .option("--final", "Mark as final stage (won/lost)")
  .action((id: string, label: string, opts: { order: string; probability?: string; color?: string; final?: boolean }) => {
    const dataDir = process.cwd();
    const stage: PipelineStage = {
      id,
      label,
      order: parseInt(opts.order, 10),
      ...(opts.probability !== undefined ? { probability: parseInt(opts.probability, 10) } : {}),
      ...(opts.color ? { color: opts.color } : {}),
      ...(opts.final ? { isFinal: true } : {}),
    };
    setPipelineStage(dataDir, stage);
    console.log(success(`✓ Stage '${id}' saved`));
  });

stagesCommand
  .command("delete <id>")
  .description("Delete a pipeline stage by ID")
  .action((id: string) => {
    const dataDir = process.cwd();
    const existing = getPipelineStages(dataDir);
    if (!existing.find((s) => s.id === id)) {
      console.error(error(`✗ Stage '${id}' not found`));
      process.exit(1);
    }
    deletePipelineStage(dataDir, id);
    console.log(success(`✓ Stage '${id}' deleted`));
  });

stagesCommand
  .command("reset")
  .description("Reset pipeline stages to defaults")
  .action(() => {
    const dataDir = process.cwd();
    resetToDefaults(dataDir);
    console.log(success("✓ Pipeline stages reset to defaults"));
  });
