import fs from "fs";
import { Command } from "commander";
import { info, success, error } from "../ui/colors.js";
import type { EvalFixtures } from "../core/embedding-eval.js";

export const evalEmbeddingsCommand = new Command("eval-embeddings")
  .description("Measure retrieval quality (recall@k, MRR) of the configured embedding model")
  .argument("<fixtures>", "JSON file: { documents:[{id,text}], queries:[{query,relevantIds}] }")
  .option("--k <n>", "Cutoff k for recall@k", (v) => parseInt(v, 10), 5)
  .action(async (fixturesPath: string, opts: { k: number }) => {
    if (!fs.existsSync(fixturesPath)) {
      console.error(error(`Fixtures file not found: ${fixturesPath}`));
      process.exitCode = 1;
      return;
    }

    let fixtures: EvalFixtures;
    try {
      fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf-8") as string) as EvalFixtures;
    } catch (e) {
      console.error(error(`Invalid fixtures JSON: ${(e as Error).message}`));
      process.exitCode = 1;
      return;
    }

    const { embedText, embeddingModel } = await import("../core/embedder.js");
    const { evaluateEmbeddings } = await import("../core/embedding-eval.js");

    console.log(
      info(`Evaluating model '${embeddingModel()}' over ${fixtures.queries.length} queries...`)
    );
    const report = await evaluateEmbeddings(fixtures, embedText, opts.k, embeddingModel());

    console.log(success(`recall@${report.k}: ${(report.meanRecallAtK * 100).toFixed(1)}%`));
    console.log(success(`MRR:        ${report.mrr.toFixed(3)}`));
    console.log(
      info(
        "Tip: set DXCRM_EMBED_MODEL to another model and re-run to compare, then `dxcrm reindex`."
      )
    );
  });
