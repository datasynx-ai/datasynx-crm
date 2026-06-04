import { Command } from "commander";
import { info, success } from "../ui/colors.js";

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

export const hygieneCommand = new Command("hygiene").description("Data-quality scanning");

hygieneCommand
  .command("scan")
  .description("Scan customers for data-quality issues (missing/malformed/duplicate)")
  .action(async () => {
    const { scanHygiene } = await import("../core/hygiene.js");
    const issues = await scanHygiene(dataDir());
    if (issues.length === 0) {
      console.log(success("✓ No data-quality issues found."));
      return;
    }
    console.log(info(`${issues.length} issue(s):`));
    for (const i of issues) {
      const fix = i.suggestedFix ? `  → fix: ${i.suggestedFix}` : "";
      console.log(`  [${i.type}] ${i.slug}: ${i.detail}${fix}`);
    }
  });
