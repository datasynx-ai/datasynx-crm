import { Command } from "commander";
import { success, error, warning, bold } from "../ui/colors.js";
import type { CheckStatus } from "../core/doctor.js";

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

function icon(status: CheckStatus): string {
  if (status === "ok") return success("✓");
  if (status === "warn") return warning("⚠");
  return error("✗");
}

export const doctorCommand = new Command("doctor")
  .description("Run self-diagnostics: data integrity, temp files, log errors, backup freshness")
  .action(async () => {
    const { runDiagnostics } = await import("../core/doctor.js");
    const report = await runDiagnostics(dataDir());

    console.log(bold("dxcrm doctor"));
    for (const c of report.checks) {
      console.log(`  ${icon(c.status)} ${c.name.padEnd(16)} ${c.detail}`);
    }

    if (report.ok) {
      const warns = report.checks.filter((c) => c.status === "warn").length;
      console.log(
        warns > 0 ? warning(`\nHealthy, with ${warns} warning(s).`) : success("\nAll healthy.")
      );
    } else {
      console.log(error("\nProblems found — see the ✗ checks above."));
      process.exitCode = 1;
    }
  });
