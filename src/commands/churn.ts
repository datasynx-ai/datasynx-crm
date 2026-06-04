import { Command } from "commander";
import { info, success, warning, error } from "../ui/colors.js";
import type { ChurnLevel } from "../core/churn.js";

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

function paint(level: ChurnLevel, text: string): string {
  if (level === "high") return error(text);
  if (level === "medium") return warning(text);
  return success(text);
}

export const churnCommand = new Command("churn").description(
  "Churn early-warning (relationship-health based)"
);

churnCommand
  .command("assess <slug>")
  .description("Assess churn risk for one customer")
  .action(async (slug: string) => {
    const { assessChurn } = await import("../core/churn.js");
    const r = assessChurn(dataDir(), slug);
    console.log(paint(r.level, `${slug}: ${r.level.toUpperCase()} risk (${r.riskScore}/100)`));
    for (const s of r.signals) console.log(`  • ${s}`);
  });

churnCommand
  .command("scan")
  .description("Rank all customers by churn risk (highest first)")
  .action(async () => {
    const { scanChurn } = await import("../core/churn.js");
    const ranked = scanChurn(dataDir());
    if (ranked.length === 0) {
      console.log(info("No customers to assess."));
      return;
    }
    for (const r of ranked) {
      console.log(
        paint(r.level, `${r.riskScore.toString().padStart(3)}  ${r.level.padEnd(6)}  ${r.slug}`)
      );
    }
  });
