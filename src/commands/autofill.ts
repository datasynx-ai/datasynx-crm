import { Command } from "commander";
import fs from "fs";
import { info, error } from "../ui/colors.js";

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

export const autofillCommand = new Command("autofill")
  .description("Extract structured CRM fields from a transcript file")
  .argument("<file>", "Path to transcript file")
  .option("--slug <slug>", "Customer slug (for usage attribution)")
  .action(async (file: string, opts: { slug?: string }) => {
    if (!fs.existsSync(file)) {
      console.error(error(`File not found: ${file}`));
      process.exitCode = 1;
      return;
    }
    const transcript = fs.readFileSync(file, "utf-8") as string;
    const { extractAutofill } = await import("../core/autofill.js");
    const result = await extractAutofill(transcript, opts.slug ? { slug: opts.slug } : {});
    console.log(info("Extracted fields (review before applying):"));
    console.log(JSON.stringify(result, null, 2));
    void dataDir;
  });
