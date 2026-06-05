import { Command } from "commander";
import { info, success, warning } from "../ui/colors.js";

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

export const reindexCommand = new Command("reindex")
  .description(
    "Rebuild a customer's vector index from stored text (after an embedding-model switch)"
  )
  .argument("<slug>", "Customer slug")
  .action(async (slug: string) => {
    const { reindexCustomer } = await import("../core/lancedb.js");
    const { embeddingModel } = await import("../core/embedder.js");
    console.log(info(`Reindexing '${slug}' with model '${embeddingModel()}'...`));
    const count = await reindexCustomer(dataDir(), slug);
    if (count === 0) {
      console.log(warning(`Nothing reindexed for '${slug}' (no indexed knowledge yet).`));
      return;
    }
    console.log(success(`Reindexed ${count} document(s) for '${slug}'.`));
  });
