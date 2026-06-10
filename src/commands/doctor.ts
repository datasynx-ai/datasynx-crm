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

/** `dxcrm doctor --integrations [--live]` — per-provider readiness (#64). */
export async function runDoctorIntegrations(opts: { live?: boolean }): Promise<void> {
  const { runIntegrationChecks } = await import("../core/doctor-integrations.js");
  const checks = await runIntegrationChecks(dataDir(), { live: opts.live ?? false });

  console.log(bold(`dxcrm doctor --integrations${opts.live ? " --live" : ""}`));
  for (const c of checks) {
    const mark = c.status === "off" ? "○" : icon(c.status);
    console.log(`  ${mark} ${c.provider.padEnd(20)} ${c.detail}`);
    if (c.hint && c.status !== "ok") console.log(`      ↳ ${c.hint}`);
  }
  const warns = checks.filter((c) => c.status === "warn");
  const okCount = checks.filter((c) => c.status === "ok").length;
  if (warns.length > 0) {
    console.log(warning(`\n${okCount} ready, ${warns.length} need attention (⚠ above).`));
    process.exitCode = 1;
  } else {
    console.log(success(`\n${okCount} integration(s) ready; unconfigured ones (○) are optional.`));
  }
  if (!opts.live) {
    console.log("Run with --live to verify tokens against the real APIs.");
  }
}

export const doctorCommand = new Command("doctor")
  .description(
    "Run self-diagnostics: data integrity, temp files, log errors, backups — or per-provider integration readiness"
  )
  .option("--fix", "Clean up safely-fixable issues (orphaned temp files)")
  .option("--integrations", "Check per-provider integration readiness (#64)")
  .option("--live", "With --integrations: probe the real APIs to verify tokens")
  .action(async (opts: { fix?: boolean; integrations?: boolean; live?: boolean }) => {
    if (opts.integrations) {
      await runDoctorIntegrations({ live: opts.live ?? false });
      return;
    }
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
    console.log("Integration readiness: dxcrm doctor --integrations [--live]");
  });
