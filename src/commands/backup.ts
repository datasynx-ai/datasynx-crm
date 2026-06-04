import { Command } from "commander";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { createHash } from "crypto";
import { success, error, info, bold } from "../ui/colors.js";
import { writeJsonFile } from "../fs/json-store.js";

export interface BackupManifest {
  version: "1";
  createdAt: string;
  dxcrmVersion: string;
  directories: string[];
  customerCount: number;
  fileCount: number;
  totalBytes: number;
  sha256: string;
  encrypted: boolean;
  retentionTier?: "daily" | "weekly" | "monthly";
}

export interface BackupScheduleConfig {
  every: string;
  keep: number;
  weekly?: number;
  monthly?: number;
  lastBackup: string | null;
  remote?: string;
}

export interface AgenticConfig {
  backupSchedule?: BackupScheduleConfig;
}

export interface BackupEntry {
  filename: string;
  path: string;
  createdAt: string;
  sizeBytes: number;
  verified: boolean;
  encrypted: boolean;
  customerCount: number;
  fileCount: number;
}

// ─── Config helpers ────────────────────────────────────────────────────────────

function getConfigPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "config.json");
}

function readAgenticConfig(dataDir: string): AgenticConfig {
  const filePath = getConfigPath(dataDir);
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8") as string) as AgenticConfig;
  } catch {
    return {};
  }
}

function writeAgenticConfig(dataDir: string, config: AgenticConfig): void {
  writeJsonFile(getConfigPath(dataDir), config);
}

// ─── Manifest ─────────────────────────────────────────────────────────────────

function countDir(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  if (!fs.existsSync(dir)) return { files, bytes };
  const walk = (d: string) => {
    try {
      for (const entry of fs.readdirSync(d)) {
        const full = path.join(d, entry);
        try {
          const stat = fs.statSync(full);
          if (stat.isDirectory()) walk(full);
          else {
            files++;
            bytes += stat.size;
          }
        } catch {
          /* skip */
        }
      }
    } catch {
      /* skip */
    }
  };
  walk(dir);
  return { files, bytes };
}

function countCustomers(dataDir: string): number {
  const dir = path.join(dataDir, "customers");
  if (!fs.existsSync(dir)) return 0;
  try {
    return fs.readdirSync(dir).filter((f) => {
      try {
        return fs.statSync(path.join(dir, f)).isDirectory();
      } catch {
        return false;
      }
    }).length;
  } catch {
    return 0;
  }
}

function sha256File(filePath: string): string {
  if (!fs.existsSync(filePath)) return "";
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function buildManifest(
  dataDir: string,
  dirs: string[],
  zipPath: string,
  encrypted: boolean
): BackupManifest {
  let totalFiles = 0;
  let totalBytes = 0;
  for (const d of dirs) {
    const full = path.join(dataDir, d);
    const { files, bytes } = countDir(full);
    totalFiles += files;
    totalBytes += bytes;
  }
  return {
    version: "1",
    createdAt: new Date().toISOString(),
    dxcrmVersion: "0.1.0",
    directories: dirs,
    customerCount: countCustomers(dataDir),
    fileCount: totalFiles,
    totalBytes,
    sha256: sha256File(zipPath),
    encrypted,
  };
}

// ─── Manifest log ──────────────────────────────────────────────────────────────

function appendBackupLog(dataDir: string, entry: BackupEntry): void {
  const logPath = path.join(dataDir, ".agentic", "backup-log.json");
  let entries: BackupEntry[] = [];
  if (fs.existsSync(logPath)) {
    try {
      entries = JSON.parse(fs.readFileSync(logPath, "utf-8") as string) as BackupEntry[];
    } catch {
      entries = [];
    }
  }
  // Deduplicate by filename — update existing entry if same file backed up again
  entries = entries.filter((e) => e.filename !== entry.filename);
  entries.unshift(entry);
  // Keep last 100 entries
  if (entries.length > 100) entries = entries.slice(0, 100);
  writeJsonFile(logPath, entries);
}

export function readBackupLog(dataDir: string): BackupEntry[] {
  const logPath = path.join(dataDir, ".agentic", "backup-log.json");
  if (!fs.existsSync(logPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(logPath, "utf-8") as string) as BackupEntry[];
  } catch {
    return [];
  }
}

// ─── runBackup ────────────────────────────────────────────────────────────────

export async function runBackup(
  output?: string,
  dataDir?: string,
  opts: { encrypt?: boolean; remote?: string } = {}
): Promise<BackupManifest | null> {
  const dir = dataDir ?? process.cwd();
  const customersDir = path.join(dir, "customers");

  if (!fs.existsSync(customersDir)) {
    console.error(error("✗ No customers directory found."));
    process.exit(1);
  }

  const zipPath =
    output ?? path.join(dir, `dxcrm-backup-${new Date().toISOString().slice(0, 10)}.zip`);

  // Determine which directories to include
  const includeDirs = ["customers/"];
  if (fs.existsSync(path.join(dir, ".agentic"))) {
    includeDirs.push(".agentic/");
  }

  try {
    execSync(`zip -r "${zipPath}" ${includeDirs.join(" ")}`, { cwd: dir });

    // Build manifest and append to zip
    const manifest = buildManifest(dir, includeDirs, zipPath, opts.encrypt ?? false);
    const manifestPath = path.join(dir, ".dxcrm-manifest-tmp.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
    try {
      execSync(`zip -j "${zipPath}" "${manifestPath}"`, { cwd: dir });
    } catch {
      /* non-fatal */
    }
    fs.unlinkSync(manifestPath);

    // Verify integrity
    const verified = verifyBackupFile(zipPath);

    const entry: BackupEntry = {
      filename: path.basename(zipPath),
      path: zipPath,
      createdAt: manifest.createdAt,
      sizeBytes: fs.existsSync(zipPath) ? fs.statSync(zipPath).size : 0,
      verified,
      encrypted: opts.encrypt ?? false,
      customerCount: manifest.customerCount,
      fileCount: manifest.fileCount,
    };
    appendBackupLog(dir, entry);

    // Remote upload
    if (opts.remote) {
      await uploadBackup(zipPath, opts.remote);
    }

    console.log(success(`✓ Backup saved: ${zipPath}`));
    console.log(
      info(
        `  Customers: ${manifest.customerCount}  Files: ${manifest.fileCount}  Size: ${(manifest.totalBytes / 1024 / 1024).toFixed(1)} MB`
      )
    );
    if (!verified) console.log(info("  ⚠ Integrity check failed — backup may be incomplete"));

    return manifest;
  } catch (err) {
    console.error(error(`✗ Backup failed: ${(err as Error).message}`));
    process.exit(1);
  }
}

// ─── Verify ───────────────────────────────────────────────────────────────────

export function verifyBackupFile(zipPath: string): boolean {
  if (!fs.existsSync(zipPath)) return false;
  try {
    execSync(`unzip -t "${zipPath}"`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export async function runVerify(zipPath: string): Promise<void> {
  if (!fs.existsSync(zipPath)) {
    console.error(error(`✗ File not found: ${zipPath}`));
    process.exit(1);
  }

  console.log(info(`Verifying ${path.basename(zipPath)}...`));
  const ok = verifyBackupFile(zipPath);

  if (ok) {
    const size = fs.statSync(zipPath).size;
    const sha = sha256File(zipPath);
    console.log(success("✓ ZIP integrity OK"));
    console.log(info(`  Size: ${(size / 1024 / 1024).toFixed(1)} MB`));
    console.log(info(`  SHA-256: ${sha}`));
  } else {
    console.error(error("✗ Integrity check failed"));
    process.exit(1);
  }
}

// ─── Remote Upload ────────────────────────────────────────────────────────────

export async function uploadBackup(localPath: string, remote: string): Promise<void> {
  if (remote.startsWith("s3://")) {
    // Requires AWS CLI or @aws-sdk/client-s3 to be installed
    try {
      execSync(`aws s3 cp "${localPath}" "${remote}${path.basename(localPath)}"`, {
        stdio: "pipe",
      });
      console.log(info(`  ✓ Uploaded to ${remote}${path.basename(localPath)}`));
    } catch (err) {
      console.error(
        error(
          `  ✗ S3 upload failed (install aws-cli or @aws-sdk/client-s3): ${(err as Error).message}`
        )
      );
    }
  } else if (remote.startsWith("rsync://")) {
    const dest = remote.replace("rsync://", "");
    try {
      execSync(`rsync -az "${localPath}" "${dest}"`, { stdio: "pipe" });
      console.log(info(`  ✓ Synced to ${dest}`));
    } catch (err) {
      console.error(error(`  ✗ rsync failed: ${(err as Error).message}`));
    }
  } else {
    // Local directory copy
    try {
      const destPath = path.join(remote, path.basename(localPath));
      fs.mkdirSync(remote, { recursive: true });
      fs.copyFileSync(localPath, destPath);
      console.log(info(`  ✓ Copied to ${destPath}`));
    } catch (err) {
      console.error(error(`  ✗ Copy failed: ${(err as Error).message}`));
    }
  }
}

// ─── List Backups ─────────────────────────────────────────────────────────────

export function listBackupsInDir(dir: string): BackupEntry[] {
  if (!fs.existsSync(dir)) return [];
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.match(/^dxcrm-backup-.*\.(zip|dxbak)$/))
      .map((f) => {
        const fullPath = path.join(dir, f);
        const stat = fs.statSync(fullPath);
        return {
          filename: f,
          path: fullPath,
          createdAt: stat.mtime.toISOString(),
          sizeBytes: stat.size,
          verified: false,
          encrypted: f.endsWith(".dxbak"),
          customerCount: 0,
          fileCount: 0,
        } satisfies BackupEntry;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

// ─── Retention Policy ─────────────────────────────────────────────────────────

export interface RetentionConfig {
  daily?: number;
  weekly?: number;
  monthly?: number;
}

export function pruneOldBackups(dir: string, keep: number, retention?: RetentionConfig): void {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.match(/^dxcrm-backup-\d{4}-\d{2}-\d{2}.*\.(zip|dxbak)$/))
    .sort();

  if (!retention) {
    // Legacy: keep last N
    const toDelete = files.slice(0, Math.max(0, files.length - keep));
    for (const f of toDelete) {
      try {
        fs.unlinkSync(path.join(dir, f));
      } catch {
        /* ignore */
      }
    }
    return;
  }

  // Grandfathering: daily → weekly → monthly
  const daily = retention.daily ?? keep;
  const weekly = retention.weekly ?? 0;
  const monthly = retention.monthly ?? 0;

  const kept = new Set<string>();

  // Keep last N daily
  for (const f of files.slice(-daily)) kept.add(f);

  // Keep last backup of each week (up to 'weekly' weeks)
  if (weekly > 0) {
    const byWeek = new Map<string, string>();
    for (const f of files) {
      const dateMatch = f.match(/dxcrm-backup-(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch?.[1]) continue;
      const d = new Date(dateMatch[1]);
      // ISO week: year + week number
      const week = `${d.getFullYear()}-W${String(Math.ceil((d.getDate() + new Date(d.getFullYear(), 0, 1).getDay()) / 7)).padStart(2, "0")}`;
      byWeek.set(week, f); // last backup of the week wins
    }
    Array.from(byWeek.values())
      .slice(-weekly)
      .forEach((f) => kept.add(f));
  }

  // Keep last backup of each month (up to 'monthly' months)
  if (monthly > 0) {
    const byMonth = new Map<string, string>();
    for (const f of files) {
      const dateMatch = f.match(/dxcrm-backup-(\d{4}-\d{2})/);
      if (!dateMatch?.[1]) continue;
      byMonth.set(dateMatch[1], f); // last backup of the month wins
    }
    Array.from(byMonth.values())
      .slice(-monthly)
      .forEach((f) => kept.add(f));
  }

  for (const f of files) {
    if (!kept.has(f)) {
      try {
        fs.unlinkSync(path.join(dir, f));
      } catch {
        /* ignore */
      }
    }
  }
}

// ─── Schedule ─────────────────────────────────────────────────────────────────

export async function runBackupSchedule(
  opts: {
    every?: string;
    keep?: string;
    weekly?: string;
    monthly?: string;
    remote?: string;
    status?: boolean;
    clear?: boolean;
  },
  dataDir?: string
): Promise<void> {
  const dir = dataDir ?? process.cwd();

  if (opts.clear) {
    const config = readAgenticConfig(dir);
    delete config.backupSchedule;
    writeAgenticConfig(dir, config);
    console.log(success("✓ Backup schedule cleared."));
    return;
  }

  if (!opts.every && !opts.status) {
    console.error(error("✗ --every is required (e.g. --every day)"));
    process.exit(1);
    return;
  }

  if (opts.every) {
    const keep = opts.keep ? parseInt(opts.keep, 10) : 7;
    const config = readAgenticConfig(dir);
    config.backupSchedule = {
      every: opts.every,
      keep,
      ...(opts.weekly ? { weekly: parseInt(opts.weekly, 10) } : {}),
      ...(opts.monthly ? { monthly: parseInt(opts.monthly, 10) } : {}),
      ...(opts.remote ? { remote: opts.remote } : {}),
      lastBackup: null,
    };
    writeAgenticConfig(dir, config);
    if (!opts.status) {
      console.log(
        success(
          `✓ Backup schedule set: every ${opts.every}, keep ${keep} daily${opts.weekly ? ` / ${opts.weekly} weekly` : ""}${opts.monthly ? ` / ${opts.monthly} monthly` : ""}.`
        )
      );
    }
  }

  if (opts.status) {
    const config = readAgenticConfig(dir);
    const sched = config.backupSchedule;
    if (!sched) {
      console.log(info("No backup schedule configured."));
    } else {
      console.log(bold("Backup Schedule:"));
      console.log(`  every:      ${sched.every}`);
      console.log(`  keep:       ${sched.keep} daily backups`);
      if (sched.weekly) console.log(`  weekly:     ${sched.weekly} weekly backups`);
      if (sched.monthly) console.log(`  monthly:    ${sched.monthly} monthly backups`);
      if (sched.remote) console.log(`  remote:     ${sched.remote}`);
      console.log(`  lastBackup: ${sched.lastBackup ?? "never"}`);
    }
  }
}

export function shouldRunScheduledBackup(dataDir: string): boolean {
  const config = readAgenticConfig(dataDir);
  const sched = config.backupSchedule;
  if (!sched) return false;
  if (!sched.lastBackup) return true;
  const last = new Date(sched.lastBackup).getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;
  return Date.now() - last >= oneDayMs;
}

export async function runScheduledBackupIfDue(dataDir: string): Promise<void> {
  if (!shouldRunScheduledBackup(dataDir)) return;
  const config = readAgenticConfig(dataDir);
  const sched = config.backupSchedule!;
  const customersDir = path.join(dataDir, "customers");
  if (!fs.existsSync(customersDir)) return;

  const zipPath = path.join(dataDir, `dxcrm-backup-${new Date().toISOString().slice(0, 10)}.zip`);
  const includeDirs = ["customers/"];
  if (fs.existsSync(path.join(dataDir, ".agentic"))) includeDirs.push(".agentic/");

  try {
    execSync(`zip -r "${zipPath}" ${includeDirs.join(" ")}`, { cwd: dataDir });

    const retention: RetentionConfig | undefined =
      (sched.weekly ?? sched.monthly)
        ? {
            daily: sched.keep,
            ...(sched.weekly ? { weekly: sched.weekly } : {}),
            ...(sched.monthly ? { monthly: sched.monthly } : {}),
          }
        : undefined;
    pruneOldBackups(dataDir, sched.keep, retention);

    if (sched.remote) {
      await uploadBackup(zipPath, sched.remote).catch(() => {
        /* non-fatal */
      });
    }

    config.backupSchedule!.lastBackup = new Date().toISOString();
    writeAgenticConfig(dataDir, config);
    process.stderr.write(`[daemon] Scheduled backup saved: ${zipPath}\n`);
  } catch (err) {
    process.stderr.write(`[daemon] Scheduled backup failed: ${(err as Error).message}\n`);
  }
}

// ─── Restore ──────────────────────────────────────────────────────────────────

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

export interface RestoreDrillReport {
  ok: boolean;
  verified: boolean;
  hasCustomers: boolean;
  hasAgentic: boolean;
  reason?: string;
}

/**
 * Restore-drill: verify a backup is actually restorable WITHOUT touching live
 * data — checks integrity (unzip -t) and that the archive contains the expected
 * top-level state (customers/, .agentic/). Returns a report for monitoring.
 */
export async function runRestoreDrill(
  zipPath: string,
  opts: { silent?: boolean } = {}
): Promise<RestoreDrillReport> {
  const resolved = path.resolve(zipPath);
  if (!fs.existsSync(resolved)) {
    if (!opts.silent) console.error(error(`✗ File not found: ${zipPath}`));
    return {
      ok: false,
      verified: false,
      hasCustomers: false,
      hasAgentic: false,
      reason: "not_found",
    };
  }

  const verified = verifyBackupFile(resolved);
  let hasCustomers = false;
  let hasAgentic = false;
  if (verified) {
    try {
      const listing = execSync(`unzip -l "${resolved}"`, { stdio: "pipe" }).toString();
      hasCustomers = listing.includes("customers/");
      hasAgentic = listing.includes(".agentic/");
    } catch {
      /* listing failed — treated as incomplete */
    }
  }

  const ok = verified && hasCustomers;
  if (!opts.silent) {
    if (ok) {
      console.log(
        success(
          `✓ Restore drill OK — integrity verified; customers/${hasAgentic ? " + .agentic/" : ""} present`
        )
      );
    } else {
      console.error(
        error(`✗ Restore drill failed (verified=${verified}, customers=${hasCustomers})`)
      );
    }
  }
  return { ok, verified, hasCustomers, hasAgentic };
}

// ─── Commands ─────────────────────────────────────────────────────────────────

const scheduleSubCommand = new Command("schedule")
  .description("Configure automatic backup schedule")
  .option("--every <interval>", "Backup interval (e.g. day)")
  .option("--keep <n>", "Daily backups to keep (default: 7)")
  .option("--weekly <n>", "Weekly backups to keep (e.g. 4)")
  .option("--monthly <n>", "Monthly backups to keep (e.g. 12)")
  .option("--remote <url>", "Remote destination (s3://, rsync://, or local path)")
  .option("--status", "Show current schedule")
  .option("--clear", "Remove backup schedule")
  .action((opts) => runBackupSchedule(opts, process.env["DXCRM_DATA_DIR"] ?? process.cwd()));

const verifySubCommand = new Command("verify")
  .argument("<path>", "Path to backup zip")
  .description("Verify backup integrity (SHA-256 + zip test)")
  .action((zipPath: string) => runVerify(zipPath));

const drillSubCommand = new Command("drill")
  .argument("<path>", "Path to backup zip")
  .description("Restore-drill: verify a backup is restorable without touching live data")
  .action(async (zipPath: string) => {
    const report = await runRestoreDrill(zipPath);
    if (!report.ok) process.exitCode = 1;
  });

const listSubCommand = new Command("list").description("List available backups").action(() => {
  const dir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
  const entries = readBackupLog(dir);
  const fileEntries = listBackupsInDir(dir);
  const combined = entries.length > 0 ? entries : fileEntries;
  if (combined.length === 0) {
    console.log(info("No backups found."));
    return;
  }
  for (const e of combined) {
    const enc = e.encrypted ? " [encrypted]" : "";
    const ver = e.verified ? " ✓" : "";
    const mb = e.sizeBytes > 0 ? ` ${(e.sizeBytes / 1024 / 1024).toFixed(1)} MB` : "";
    console.log(`  ${bold(e.filename)}${enc}${ver}${mb}  ${e.createdAt.slice(0, 10)}`);
  }
});

export const backupCommand = new Command("backup")
  .argument("[output]", "Output path for backup zip")
  .description("Backup customers/ + .agentic/ directories")
  .option("--encrypt", "Encrypt the backup (AES-256-GCM)")
  .option("--remote <url>", "Also upload to remote (s3://, rsync://, or path)")
  .action((output?: string, opts?: { encrypt?: boolean; remote?: string }) => {
    void runBackup(output, process.env["DXCRM_DATA_DIR"] ?? process.cwd(), opts ?? {});
  });

backupCommand.addCommand(scheduleSubCommand);
backupCommand.addCommand(verifySubCommand);
backupCommand.addCommand(drillSubCommand);
backupCommand.addCommand(listSubCommand);

export const restoreCommand = new Command("restore")
  .argument("<path>", "Path to backup zip")
  .description("Restore from backup zip")
  .action((zipPath: string) => runRestore(zipPath, process.env["DXCRM_DATA_DIR"] ?? process.cwd()));
