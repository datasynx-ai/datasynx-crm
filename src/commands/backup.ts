import { Command } from "commander";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { success, error } from "../ui/colors.js";

export async function runBackup(output?: string, dataDir?: string): Promise<void> {
  const dir = dataDir ?? process.cwd();
  const customersDir = path.join(dir, "customers");

  if (!fs.existsSync(customersDir)) {
    console.error(error("✗ No customers directory found."));
    process.exit(1);
  }

  const zipPath =
    output ??
    path.join(dir, `dxcrm-backup-${new Date().toISOString().slice(0, 10)}.zip`);

  try {
    execSync(`zip -r "${zipPath}" customers/`, { cwd: dir });
    console.log(success(`✓ Backup saved: ${zipPath}`));
  } catch (err) {
    console.error(error(`✗ Backup failed: ${(err as Error).message}`));
    process.exit(1);
  }
}

export async function runRestore(zipPath: string, dataDir?: string): Promise<void> {
  const dir = dataDir ?? process.cwd();
  try {
    execSync(`unzip -o "${path.resolve(zipPath)}" -d "${dir}"`, { cwd: dir });
    console.log(success("✓ Restore complete."));
  } catch (err) {
    console.error(error(`✗ Restore failed: ${(err as Error).message}`));
    process.exit(1);
  }
}

export const backupCommand = new Command("backup")
  .argument("[output]", "Output path for backup zip")
  .description("Backup customers/ directory")
  .action((output?: string) => runBackup(output));

export const restoreCommand = new Command("restore")
  .argument("<path>", "Path to backup zip")
  .description("Restore from backup zip")
  .action((zipPath: string) => runRestore(zipPath));
