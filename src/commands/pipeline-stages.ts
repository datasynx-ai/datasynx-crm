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

export const stagesCommand = new Command("stages").description("Manage custom pipeline stages");

stagesCommand
  .command("list")
  .description("List configured pipeline stages")
  .option("--pipeline <id>", "Named pipeline (default: 'default')")
  .action(async (opts: { pipeline?: string }) => {
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
    if (opts.pipeline && opts.pipeline !== "default") {
      const { getPipelineDef } = await import("../core/pipelines.js");
      const def = getPipelineDef(dataDir, opts.pipeline);
      if (!def) {
        console.log(error(`Pipeline '${opts.pipeline}' not found`));
        process.exitCode = 1;
        return;
      }
      printStagesTable(def.stages);
      return;
    }
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
  .option("--pipeline <pipelineId>", "Named pipeline to modify (default: 'default')")
  .action(
    async (
      id: string,
      label: string,
      opts: {
        order: string;
        probability?: string;
        color?: string;
        final?: boolean;
        pipeline?: string;
      }
    ) => {
      const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
      const stage: PipelineStage = {
        id,
        label,
        order: parseInt(opts.order, 10),
        ...(opts.probability !== undefined ? { probability: parseInt(opts.probability, 10) } : {}),
        ...(opts.color ? { color: opts.color } : {}),
        ...(opts.final ? { isFinal: true } : {}),
      };
      if (opts.pipeline && opts.pipeline !== "default") {
        const { setStageForPipeline } = await import("../core/pipelines.js");
        try {
          setStageForPipeline(dataDir, opts.pipeline, stage);
          console.log(success(`✓ Stage '${id}' saved in pipeline '${opts.pipeline}'`));
        } catch (err) {
          console.error(error((err as Error).message));
          process.exit(1);
        }
        return;
      }
      setPipelineStage(dataDir, stage);
      console.log(success(`✓ Stage '${id}' saved`));
    }
  );

stagesCommand
  .command("delete <id>")
  .description("Delete a pipeline stage by ID")
  .action((id: string) => {
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
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
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
    resetToDefaults(dataDir);
    console.log(success("✓ Pipeline stages reset to defaults"));
  });
