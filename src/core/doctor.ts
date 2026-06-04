import fs from "fs";
import path from "path";
import { listCustomerSlugs, readMainFacts } from "../fs/customer-dir.js";
import { summarizeLogs } from "./logger.js";

/**
 * Self-diagnostic (`dxcrm doctor`). Ties together the integrity, observability
 * and validation work into a single operator-facing health check: is the data
 * directory sound, is customer data valid, are there orphaned atomic-write temp
 * files (a crash signature), recent log errors, or a stale backup?
 */
export type CheckStatus = "ok" | "warn" | "fail";

export interface DiagnosticCheck {
  name: string;
  status: CheckStatus;
  detail: string;
}

export interface DiagnosticReport {
  ok: boolean; // false if any check failed
  checks: DiagnosticCheck[];
}

/** Recursively collect files whose name matches the atomic-write temp pattern. */
function findOrphanedTempFiles(dir: string, depth = 0): string[] {
  if (depth > 3 || !fs.existsSync(dir)) return [];
  const out: string[] = [];
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    let isDir = false;
    try {
      isDir = fs.statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (isDir) {
      out.push(...findOrphanedTempFiles(full, depth + 1));
    } else if (/\.\d+\.[0-9a-f]+\.tmp$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Delete orphaned atomic-write temp files; returns the paths removed. */
export function cleanupTempFiles(dataDir: string): string[] {
  const temps = [
    ...findOrphanedTempFiles(path.join(dataDir, ".agentic")),
    ...findOrphanedTempFiles(path.join(dataDir, "customers")),
  ];
  const removed: string[] = [];
  for (const f of temps) {
    try {
      fs.rmSync(f, { force: true });
      removed.push(f);
    } catch {
      /* leave it; reported but not removable */
    }
  }
  return removed;
}

export async function runDiagnostics(dataDir: string): Promise<DiagnosticReport> {
  const checks: DiagnosticCheck[] = [];

  // 1. Data directory structure
  const agenticDir = path.join(dataDir, ".agentic");
  const customersDir = path.join(dataDir, "customers");
  if (!fs.existsSync(agenticDir) && !fs.existsSync(customersDir)) {
    checks.push({
      name: "data directory",
      status: "fail",
      detail: `Neither .agentic/ nor customers/ found under ${dataDir} — run 'dxcrm init'`,
    });
  } else {
    checks.push({
      name: "data directory",
      status: "ok",
      detail: dataDir,
    });
  }

  // 2. Customer data validity
  const slugs = listCustomerSlugs(dataDir);
  const invalid: string[] = [];
  for (const slug of slugs) {
    try {
      await readMainFacts(dataDir, slug);
    } catch {
      invalid.push(slug);
    }
  }
  checks.push({
    name: "customer data",
    status: invalid.length > 0 ? "fail" : "ok",
    detail:
      invalid.length > 0
        ? `${invalid.length} of ${slugs.length} invalid: ${invalid.slice(0, 5).join(", ")}`
        : `${slugs.length} customer(s) valid`,
  });

  // 3. Orphaned atomic-write temp files (crash signature)
  const temps = [...findOrphanedTempFiles(agenticDir), ...findOrphanedTempFiles(customersDir)];
  checks.push({
    name: "temp files",
    status: temps.length > 0 ? "warn" : "ok",
    detail:
      temps.length > 0
        ? `${temps.length} orphaned temp file(s) from interrupted writes — safe to delete`
        : "no orphaned temp files",
  });

  // 4. Recent log errors
  const summary = summarizeLogs(dataDir);
  const errorCount = summary.byLevel.error;
  checks.push({
    name: "logs",
    status: errorCount > 0 ? "warn" : "ok",
    detail:
      errorCount > 0
        ? `${errorCount} error entr${errorCount === 1 ? "y" : "ies"} in the log (dxcrm logs --level error)`
        : `${summary.total} log entr${summary.total === 1 ? "y" : "ies"}, no errors`,
  });

  // 5. Backup freshness
  const backupLogPath = path.join(agenticDir, "backup-log.json");
  if (fs.existsSync(backupLogPath)) {
    try {
      const entries = JSON.parse(fs.readFileSync(backupLogPath, "utf-8") as string) as Array<{
        createdAt?: string;
      }>;
      const last = entries[entries.length - 1]?.createdAt;
      const ageDays = last
        ? Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000)
        : Infinity;
      checks.push({
        name: "backups",
        status: ageDays > 7 ? "warn" : "ok",
        detail: last ? `last backup ${ageDays}d ago` : "no backups recorded",
      });
    } catch {
      checks.push({ name: "backups", status: "warn", detail: "backup log unreadable" });
    }
  }

  return { ok: !checks.some((c) => c.status === "fail"), checks };
}
