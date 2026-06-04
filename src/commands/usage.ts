import { Command } from "commander";
import { info, bold } from "../ui/colors.js";

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

export const usageCommand = new Command("usage")
  .description("LLM token usage & cost (per customer)")
  .option("--slug <slug>", "Filter by customer")
  .action(async (opts: { slug?: string }) => {
    const { aggregateUsage } = await import("../core/usage.js");
    const agg = aggregateUsage(dataDir(), opts.slug ? { slug: opts.slug } : {});
    console.log(bold("LLM Usage"));
    console.log(`Calls:          ${agg.calls}`);
    console.log(`Input tokens:   ${agg.totalInputTokens}`);
    console.log(`Output tokens:  ${agg.totalOutputTokens}`);
    console.log(`Cost (USD):     $${agg.totalCostUsd.toFixed(4)}`);
    if (!opts.slug) {
      console.log(info("By customer:"));
      for (const [slug, b] of Object.entries(agg.bySlug).sort(
        (a, b) => b[1].costUsd - a[1].costUsd
      )) {
        console.log(`  ${slug}: $${b.costUsd.toFixed(4)} (${b.calls} calls)`);
      }
    }
  });
