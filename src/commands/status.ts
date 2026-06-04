import { Command } from "commander";
import fs from "fs";
import path from "path";
import { success, error, info, bold } from "../ui/colors.js";
import { listCustomerSlugs } from "../fs/customer-dir.js";
import { readSyncState } from "../fs/sync-state.js";
import { readUnmatched } from "../fs/unmatched-transcripts.js";
import { getSession } from "../core/session-store.js";
import { readAllSessions } from "../commands/session.js";

export function formatAge(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
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

async function fetchTeamSessions(serverUrl: string): Promise<Array<{
  customerSlug: string;
  customerName: string;
  owner?: string;
  startedAt: string;
}> | null> {
  try {
    const res = await fetch(`${serverUrl.replace(/\/$/, "")}/sessions`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      sessions?: Array<{
        customerSlug: string;
        customerName: string;
        owner?: string;
        startedAt: string;
      }>;
    };
    return data.sessions ?? null;
  } catch {
    return null;
  }
}

export async function runStatus(
  opts: { unmatched?: boolean; team?: string },
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
      console.log(info(" No unmatched transcripts."));
    } else {
      for (const entry of unmatched) {
        console.log(` ${entry.filePath}  ${entry.reason}  ${entry.addedAt}`);
      }
    }
    console.log(sep);
    return;
  }

  const daemon = checkDaemon(dir);
  const slugs = listCustomerSlugs(dir);
  const syncState = readSyncState(dir);
  const unmatched = readUnmatched(dir);

  const sep = "─".repeat(37);
  console.log(sep);
  console.log(bold(" DatasynxOpenCRM Status"));
  console.log(sep);

  // Daemon line
  const daemonLine = daemon.running ? success(`running (PID ${daemon.pid})`) : error("not running");
  console.log(` Daemon:     ${daemonLine}`);

  // Customer count
  console.log(` Customers:  ${slugs.length} active`);

  // Session line
  const session = getSession() ?? readAllSessions(dir)[0] ?? null;
  if (session) {
    const ownerPart = session.owner ? ` [${session.owner}]` : "";
    console.log(` Session:    ${session.customerName} (${session.customerSlug})${ownerPart}`);
  } else {
    console.log(` Session:    none`);
  }

  // Sync lines
  if (slugs.length > 0) {
    console.log(` Syncs:`);
    for (const slug of slugs) {
      const state = syncState[slug];
      const ageStr = state?.lastGmailSync
        ? `Gmail ${formatAge(state.lastGmailSync)}`
        : "no sync yet";
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

  // Team overview via HTTP server
  const serverUrl = opts.team ?? process.env["DXCRM_SERVER_URL"];
  if (serverUrl) {
    const teamSessions = await fetchTeamSessions(serverUrl);
    if (teamSessions && teamSessions.length > 0) {
      console.log(bold("\n Team overview:"));
      for (const s of teamSessions) {
        const ownerPart = s.owner ? `${s.owner}` : "anonymous";
        console.log(info(`   ${ownerPart.padEnd(15)} → ${s.customerName} (${s.customerSlug})`));
      }
    } else if (teamSessions !== null) {
      console.log(info(" Team: no active sessions"));
    } else {
      console.log(info(` Team: server unreachable (${serverUrl})`));
    }
  }

  console.log(sep);
}

export const statusCommand = new Command("status")
  .description("Show CRM status: daemon, sync state, customer counts")
  .option("--unmatched", "Show unmatched transcript queue")
  .option("--team <url>", "Show team sessions from HTTP server (or set DXCRM_SERVER_URL)")
  .action((opts) => runStatus(opts));
