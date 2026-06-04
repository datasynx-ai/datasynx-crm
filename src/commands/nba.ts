import { Command } from "commander";
import { info } from "../ui/colors.js";

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

export const nbaCommand = new Command("nba")
  .description("Next-best-action recommendations for a customer")
  .argument("<slug>", "Customer slug")
  .action(async (slug: string) => {
    const { nextBestAction } = await import("../core/nba.js");
    const actions = await nextBestAction(dataDir(), slug);
    if (actions.length === 0) {
      console.log(info("No recommendations."));
      return;
    }
    for (const a of actions) console.log(`[${a.priority}] ${a.action} — ${a.reason}`);
  });
