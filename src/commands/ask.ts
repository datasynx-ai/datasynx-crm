import { Command } from "commander";
import { info, bold } from "../ui/colors.js";

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

export const askCommand = new Command("ask")
  .description("Ask your CRM a natural-language question")
  .argument("<question>", "The question")
  .option("--slug <slug>", "Scope to a customer")
  .action(async (question: string, opts: { slug?: string }) => {
    const { askCrm } = await import("../core/ask.js");
    const res = await askCrm(dataDir(), question, opts.slug);
    if (res.answer) {
      console.log(bold("Answer:"));
      console.log(res.answer);
    }
    if (res.sources.length === 0) {
      console.log(info("No relevant data found."));
      return;
    }
    console.log(info("Sources:"));
    res.sources.forEach((s, i) => console.log(`  [${i + 1}] ${s.text.slice(0, 120)}`));
  });
