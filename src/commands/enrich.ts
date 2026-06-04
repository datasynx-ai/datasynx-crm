import { Command } from "commander";
import { info, success } from "../ui/colors.js";

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

export const enrichCommand = new Command("enrich")
  .description("Enrich a customer's facts (offline domain-from-email + plugins)")
  .argument("<slug>", "Customer slug")
  .option("--write", "Write newly-derived fields back to main_facts.md")
  .action(async (slug: string, opts: { write?: boolean }) => {
    const { enrichCustomer } = await import("../core/enrichment.js");
    const res = await enrichCustomer(dataDir(), slug, { write: opts.write ?? false });
    const applied = Object.entries(res.applied);
    if (applied.length === 0) {
      console.log(info(`Nothing new to enrich for ${slug}.`));
      return;
    }
    for (const [k, v] of applied) console.log(`  ${k}: ${String(v)}`);
    console.log(
      res.written
        ? success(`Applied ${applied.length} field(s) to ${slug}.`)
        : info(`Found ${applied.length} field(s) — re-run with --write to apply.`)
    );
  });
