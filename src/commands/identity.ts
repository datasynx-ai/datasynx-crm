import { Command } from "commander";
import { info } from "../ui/colors.js";

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

export const identityCommand = new Command("identity").description(
  "Identity resolution / deduplication (CDP)"
);

identityCommand
  .command("duplicates")
  .description("Find clusters of likely-duplicate customers (by canonical domain)")
  .action(async () => {
    const { findDuplicateClusters } = await import("../core/identity.js");
    const clusters = await findDuplicateClusters(dataDir());
    if (clusters.length === 0) {
      console.log(info("No duplicate clusters found."));
      return;
    }
    console.log(info(`${clusters.length} duplicate cluster(s):`));
    for (const c of clusters) console.log(`${c.key}: ${c.slugs.join(", ")}`);
  });
