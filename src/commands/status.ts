import { Command } from "commander";
import fs from "fs";
import path from "path";
import { success, error, info, bold } from "../ui/colors.js";
import { readSyncState } from "../fs/sync-state.js";
import { readUnmatched } from "../fs/unmatched-transcripts.js";
import { getSession } from "../core/session-store.js";

export function formatAge(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `vor ${mins} Min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours} Std`;
  return `vor ${Math.floor(hours / 24)} Tagen`;
}

function checkDaemon(dataDir: string): { running: boolean; pid?: number } {
  const pidFile = path.join(dataDir, ".agentic", "daemon.pid");
  if (!fs.existsSync(pidFile)) return { running: false };
  try {
    const pid = parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
    if (isNaN(pid)) return { running: false };
    process.kill(pid, 0);
    return { running: true, pid };
  } catch {
    return { running: false };
  }
}

function getCustomerSlugs(dataDir: string): string[] {
  const customersDir = path.join(dataDir, "customers");
  if (!fs.existsSync(customersDir)) return [];
  try {
    return fs.readdirSync(customersDir).filter((s) => {
      try {
        return fs.statSync(path.join(customersDir, s)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

export async function runStatus(
  opts: { unmatched?: boolean },
  dataDir?: string
): Promise<void> {
  const dir = dataDir ?? process.cwd();

  if (opts.unmatched) {
    const unmatched = readUnmatched(dir);
    const sep = "─".repeat(37);
    console.log(sep);
    console.log(bold(" Unmatched Transcripts"));
    console.log(sep);
    if (unmatched.length === 0) {
      console.log(info(" Keine unmatched Transcripts (leer)."));
    } else {
      for (const entry of unmatched) {
        console.log(
          ` ${entry.filePath}  ${entry.reason}  ${entry.addedAt}`
        );
      }
    }
    console.log(sep);
    return;
  }

  const daemon = checkDaemon(dir);
  const slugs = getCustomerSlugs(dir);
  const syncState = readSyncState(dir);
  const unmatched = readUnmatched(dir);

  const sep = "─".repeat(37);
  console.log(sep);
  console.log(bold(" DatasynxOpenCRM Status"));
  console.log(sep);

  // Daemon line
  const daemonLine = daemon.running
    ? success(`running (PID ${daemon.pid})`)
    : error("not running");
  console.log(` Daemon:     ${daemonLine}`);

  // Customer count
  console.log(` Kunden:     ${slugs.length} aktiv`);

  // Session line
  const session = getSession();
  if (session) {
    const ownerPart = session.owner ? ` [${session.owner}]` : "";
    console.log(` Session:    ${session.customerName} (${session.customerSlug})${ownerPart}`);
  } else {
    console.log(` Session:    keine`);
  }

  // Sync lines
  if (slugs.length > 0) {
    console.log(` Syncs:`);
    for (const slug of slugs) {
      const state = syncState[slug];
      const ageStr = state?.lastGmailSync
        ? `Gmail ${formatAge(state.lastGmailSync)}`
        : "noch kein Sync";
      console.log(`   ${slug}:   ${ageStr}`);
    }
  }

  // Unmatched line
  const unmatchedCount = unmatched.length;
  if (unmatchedCount > 0) {
    console.log(
      ` Unmatched:   ${unmatchedCount} Transcript${unmatchedCount !== 1 ? "s" : ""} (dxcrm status --unmatched)`
    );
  } else {
    console.log(` Unmatched:   0 Transcripts`);
  }

  console.log(sep);
}

export const statusCommand = new Command("status")
  .description("Show CRM status: daemon, sync state, customer counts")
  .option("--unmatched", "Show unmatched transcript queue")
  .action((opts) => runStatus(opts));
