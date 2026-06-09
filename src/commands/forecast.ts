import { Command } from "commander";
import { bold, info, error } from "../ui/colors.js";

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

interface Bucket {
  count: number;
  weightedValue: number;
}

function printBuckets(buckets: Record<string, Bucket>, pad: number): void {
  const entries = Object.entries(buckets).sort((a, b) => b[1].weightedValue - a[1].weightedValue);
  if (entries.length === 0) {
    console.log(info("  (no open deals)"));
    return;
  }
  for (const [label, b] of entries) {
    console.log(
      `  ${label.padEnd(pad)} ${String(b.count).padStart(3)} deals  €${b.weightedValue.toLocaleString()}`
    );
  }
}

export const forecastCommand = new Command("forecast")
  .description("Weighted pipeline forecast — total, by stage, and per owner (RBAC-aware)")
  .option("--by-owner", "Break the forecast down per owner/rep")
  .option("--owner <id>", "Limit the forecast to a single owner/rep")
  .option("--filter <slug>", "Filter by customer slug substring")
  .action(async (opts: { byOwner?: boolean; owner?: string; filter?: string }) => {
    const { handleGetPipelineForecast } = await import("../mcp/tools/get-pipeline-forecast.js");
    const res = await handleGetPipelineForecast(
      {
        ...(opts.filter ? { filter: opts.filter } : {}),
        ...(opts.owner ? { owner: opts.owner } : {}),
      },
      dataDir()
    );
    const parsed = JSON.parse(res.content[0]!.text) as {
      totalWeightedValue: number;
      byStage: Record<string, Bucket>;
      byOwner: Record<string, Bucket>;
      success?: boolean;
      error?: string;
    };
    if (parsed.success === false) {
      console.error(error(parsed.error ?? "forecast failed"));
      process.exit(1);
    }

    console.log(bold(`Weighted pipeline forecast: €${parsed.totalWeightedValue.toLocaleString()}`));
    if (opts.byOwner || opts.owner) {
      console.log(bold("\nBy owner:"));
      printBuckets(parsed.byOwner, 20);
    } else {
      console.log(bold("\nBy stage:"));
      printBuckets(parsed.byStage, 14);
    }
  });
