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
  .option("--fix", "Clean up safely-fixable issues (orphaned temp files)")
  .action(async (opts: { fix?: boolean }) => {
    const { runDiagnostics, cleanupTempFiles } = await import("../core/doctor.js");

    if (opts.fix) {
      const removed = cleanupTempFiles(dataDir());
      console.log(
        removed.length > 0
          ? success(`Removed ${removed.length} orphaned temp file(s).`)
          : warning("Nothing to fix.")
      );
    }

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
