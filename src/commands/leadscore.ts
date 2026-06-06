import { Command } from "commander";
import { info, success, warning } from "../ui/colors.js";

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

export const leadscoreCommand = new Command("leadscore").description(
  "Predictive lead scoring (logistic regression on won/lost history)"
);

leadscoreCommand
  .command("train")
  .description("Train the model from won/lost history and persist it")
  .action(async () => {
    const { buildLeadModel, saveLeadModel } = await import("../core/lead-model.js");
    const model = buildLeadModel(dataDir());
    if (!model.sufficient) {
      console.log(
        warning(
          `Not enough closed history to train (${model.trainedOn} deals, need ≥4 with both outcomes).`
        )
      );
      console.log(info("Predictions fall back to the deterministic heuristic until then."));
      return;
    }
    saveLeadModel(dataDir(), model);
    console.log(success(`Trained on ${model.trainedOn} closed deals. Model saved.`));
  });

leadscoreCommand
  .command("predict <slug>")
  .description("Score a customer's open deals with the trained model")
  .action(async (slug: string) => {
    const { loadLeadModel, buildLeadModel, predictWin } = await import("../core/lead-model.js");
    const { readPipelineSync } = await import("../fs/pipeline-writer.js");
    const model = loadLeadModel(dataDir()) ?? buildLeadModel(dataDir());
    const open = readPipelineSync(dataDir(), slug).filter(
      (d) => d.stage !== "won" && d.stage !== "lost"
    );
    if (open.length === 0) {
      console.log(info(`No open deals for ${slug}.`));
      return;
    }
    const source = model.sufficient ? "model" : "heuristic";
    console.log(info(`Win-probability for ${slug} (${source}):`));
    for (const d of open) {
      const p = Math.round(predictWin(model, d) * 100);
      console.log(`  ${String(p).padStart(3)}%  ${d.name} (${d.stage})`);
    }
  });
