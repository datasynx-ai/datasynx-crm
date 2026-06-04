import { Command } from "commander";
import { info, bold } from "../ui/colors.js";

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

export const metricsCommand = new Command("metrics")
  .description("Command-center metrics from the audit trail")
  .action(async () => {
    const { computeAuditMetrics } = await import("../core/metrics.js");
    const m = computeAuditMetrics(dataDir());
    console.log(bold("Command Center"));
    console.log(`Total operations:   ${m.totalOperations}`);
    console.log(`Customers touched:  ${m.customersTouched}`);
    console.log(`Automation rate:    ${(m.automationRate * 100).toFixed(0)}%`);
    console.log(info("By tool:"));
    for (const [tool, n] of Object.entries(m.byTool).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${tool}: ${n}`);
    }
    console.log(info("By actor:"));
    for (const [actor, n] of Object.entries(m.byActor).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${actor}: ${n}`);
    }
  });
