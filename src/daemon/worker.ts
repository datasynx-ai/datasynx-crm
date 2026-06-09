// src/daemon/worker.ts
// Standalone detached process — started by `dxcrm daemon start`
// Handles background Gmail sync + transcript watching via cron
import { CronJob } from "cron";
import fs from "fs";
import path from "path";
import { logger } from "../core/logger.js";
import { writeJsonFile } from "../fs/json-store.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

const MAX_CUSTOMERS_PER_CYCLE = 50;

async function syncWithBackoff(fn: () => Promise<void>, maxRetries = 3): Promise<void> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await fn();
      return;
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("429") || msg.includes("rateLimitExceeded")) {
        const delay = Math.pow(2, attempt) * 2000; // 2s, 4s, 8s
        logger.warn("daemon", "rate limit, retrying", { delayMs: delay });
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
}

async function syncAllCustomers(): Promise<void> {
  const customersDir = path.join(DATA_DIR, "customers");
  if (!fs.existsSync(customersDir)) return;

  const slugs = fs.readdirSync(customersDir).filter((s) => {
    try {
      return fs.statSync(path.join(customersDir, s)).isDirectory();
    } catch {
      return false;
    }
  });

  const slugsToSync = slugs.slice(0, MAX_CUSTOMERS_PER_CYCLE);

  for (const slug of slugsToSync) {
    const sourcesPath = path.join(customersDir, slug, "sources.json");
    if (!fs.existsSync(sourcesPath)) continue;

    try {
      const sources = JSON.parse(fs.readFileSync(sourcesPath, "utf-8")) as {
        gmail?: { query?: string; enabled?: boolean };
      };

      if (sources.gmail?.enabled && sources.gmail.query) {
        // Gmail sync requires auth — skip if token not configured
        const tokenPath = path.join(DATA_DIR, ".agentic", "gmail-token.json");
        const credPath = path.join(DATA_DIR, ".agentic", "gmail-credentials.json");
        if (fs.existsSync(tokenPath) && fs.existsSync(credPath)) {
          const { getGmailAuth } = await import("../sync/gmail-auth.js");
          const { syncGmail } = await import("../sync/gmail-sync.js");
          const auth = await getGmailAuth(credPath, tokenPath);
          await syncWithBackoff(async () => {
            const result = await syncGmail({
              slug,
              dataDir: DATA_DIR,
              auth,
              query: sources.gmail!.query!,
              since: new Date(Date.now() - 30 * 60 * 1000), // last 30 min
            });
            if (result.synced > 0) {
              logger.info("daemon", "synced emails", { slug, synced: result.synced });
            }
            // Update sync state after each successful customer sync
            const { updateSlugSyncState } = await import("../fs/sync-state.js");
            updateSlugSyncState(DATA_DIR, slug, { lastGmailSync: new Date().toISOString() });
          });
        }
      }
    } catch (err) {
      logger.error("daemon", "error syncing customer", { slug, error: (err as Error).message });
    }
  }
}

// Start transcript watcher
async function startWatcher(): Promise<void> {
  const agenticSourcesPath = path.join(DATA_DIR, ".agentic", "sources.json");
  if (!fs.existsSync(agenticSourcesPath)) return;

  try {
    const sources = JSON.parse(fs.readFileSync(agenticSourcesPath, "utf-8")) as {
      transcripts?: { paths?: string[]; extensions?: string[]; enabled?: boolean };
    };

    if (sources.transcripts?.enabled && sources.transcripts.paths?.length) {
      const { watchTranscripts, processTranscriptFileAutoMatch } =
        await import("../sync/transcript-watcher.js");
      watchTranscripts({
        paths: sources.transcripts.paths,
        extensions: sources.transcripts.extensions ?? [".txt", ".vtt"],
        dataDir: DATA_DIR,
        onFile: (filePath) => processTranscriptFileAutoMatch(filePath, DATA_DIR),
      });
      logger.info("daemon", "watching transcripts (LLM auto-match)");
    }
  } catch (err) {
    logger.error("daemon", "watcher error", { error: (err as Error).message });
  }
}

async function checkAgentWakeTriggers(): Promise<void> {
  const agentsDir = path.join(DATA_DIR, ".agentic", "agents");
  if (!fs.existsSync(agentsDir)) return;

  const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".agent.json"));

  for (const file of files) {
    try {
      const config = JSON.parse(fs.readFileSync(path.join(agentsDir, file), "utf-8") as string) as {
        slug: string;
        channel: string;
        wakeOn: string[];
        lastWake: string | null;
        telegramChatId?: string;
      };

      if (!config.wakeOn.includes("email")) continue;

      const { getLastGmailSync } = await import("../fs/sync-state.js");
      const lastSync = getLastGmailSync(DATA_DIR, config.slug);
      const lastWake = config.lastWake ? new Date(config.lastWake) : null;

      if (!lastSync) continue;
      if (lastWake && lastSync <= lastWake) continue;

      // New email since last wake — build context and send notification
      logger.info("daemon", "wake trigger", { slug: config.slug });

      const { buildContext } = await import("../core/context-builder.js");
      const context = await buildContext(DATA_DIR, config.slug).catch(() => null);
      if (!context) continue;

      if (
        config.channel === "telegram" &&
        process.env["TELEGRAM_BOT_TOKEN"] &&
        (config.telegramChatId ?? process.env["TELEGRAM_CHAT_ID"])
      ) {
        const chatId = config.telegramChatId ?? process.env["TELEGRAM_CHAT_ID"]!;
        const token = process.env["TELEGRAM_BOT_TOKEN"];
        const message = `📬 New activity: *${config.slug}*\n\n${context.slice(0, 800)}`;

        try {
          const { default: https } = await import("https");
          const body = JSON.stringify({ chat_id: chatId, text: message, parse_mode: "Markdown" });
          await new Promise<void>((resolve, reject) => {
            const req = https.request(
              `https://api.telegram.org/bot${token}/sendMessage`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Content-Length": Buffer.byteLength(body),
                },
              },
              (res) => {
                res.resume();
                resolve();
              }
            );
            req.on("error", reject);
            req.write(body);
            req.end();
          });
          logger.info("daemon", "telegram sent", { slug: config.slug });
        } catch (err) {
          logger.error("daemon", "telegram failed", { error: (err as Error).message });
        }
      }

      // Update lastWake
      config.lastWake = new Date().toISOString();
      writeJsonFile(path.join(agentsDir, file), config);
    } catch (err) {
      logger.error("daemon", "agent check error", { file, error: (err as Error).message });
    }
  }
}

/**
 * Self-healing: each cycle, clean orphaned atomic-write temp files (a crash
 * signature) and log any *failed* health checks (e.g. invalid customer data).
 * Warn-level checks (log errors, stale backups) are intentionally not re-logged
 * here to avoid a feedback loop — `dxcrm doctor` surfaces those on demand.
 */
async function runSelfHeal(): Promise<void> {
  try {
    const { runDiagnostics, cleanupTempFiles } = await import("../core/doctor.js");
    const removed = cleanupTempFiles(DATA_DIR);
    if (removed.length > 0) {
      logger.warn("daemon", "self-heal: removed orphaned temp files", { count: removed.length });
    }
    const report = await runDiagnostics(DATA_DIR);
    for (const check of report.checks) {
      if (check.status === "fail") {
        logger.error("daemon", `self-check failed: ${check.name}`, { detail: check.detail });
      }
    }
  } catch (err) {
    logger.error("daemon", "self-heal failed", { error: (err as Error).message });
  }
}

/** Take a pipeline snapshot once per day (self-populating time-travel history). */
async function takeDailySnapshot(): Promise<void> {
  try {
    const { listSnapshots, takeSnapshot } = await import("../core/snapshots.js");
    const today = new Date().toISOString().slice(0, 10);
    if (listSnapshots(DATA_DIR).some((s) => s.id === today)) return; // already taken today
    const snap = takeSnapshot(DATA_DIR, today);
    logger.info("daemon", "pipeline snapshot taken", { id: snap.id, deals: snap.deals.length });
  } catch (err) {
    logger.error("daemon", "snapshot failed", { error: (err as Error).message });
  }
}

/**
 * Poll every configured mailbox (stored OAuth accounts + env IMAP) and
 * auto-route new mail to customers by domain. The window overlaps the interval
 * so nothing is missed; dedup keeps it idempotent.
 */
async function pollMailboxes(intervalMin: number): Promise<void> {
  try {
    const { listMailboxTokens } = await import("../sync/oauth/token-store.js");
    const { imapConfigFromEnv } = await import("../sync/mailbox-config.js");
    if (listMailboxTokens(DATA_DIR).length === 0 && imapConfigFromEnv() === null) return;

    const { runMailboxPollCycle } = await import("./mailbox-poll.js");
    const since = new Date(Date.now() - (intervalMin + 5) * 60 * 1000);
    const result = await runMailboxPollCycle(DATA_DIR, since);
    if (result.synced > 0) {
      logger.info("daemon", "mailbox cycle", {
        accounts: result.accounts,
        synced: result.synced,
        unrouted: result.unrouted,
      });
    }
  } catch (err) {
    logger.error("daemon", "mailbox poll cycle failed", { error: (err as Error).message });
  }
}

// Gmail sync — interval configurable via DXCRM_DAEMON_INTERVAL (minutes, default 30)
const daemonIntervalMin = Math.max(
  1,
  parseInt(process.env["DXCRM_DAEMON_INTERVAL"] ?? "30", 10) || 30
);
new CronJob(
  `*/${daemonIntervalMin} * * * *`,
  async () => {
    await syncAllCustomers();
    await pollMailboxes(daemonIntervalMin);
    await checkAgentWakeTriggers().catch((err: unknown) => {
      logger.error("daemon", "wake trigger check failed", { error: (err as Error).message });
    });
    await runSelfHeal();
    await takeDailySnapshot();
    // Daily task queue (#46): due/overdue tasks → proactive queue → Slack/Telegram.
    // remindedOn guards against re-sending within the same day.
    {
      const { runTaskReminders } = await import("./task-reminder.js");
      await runTaskReminders(DATA_DIR).catch((err: unknown) => {
        logger.error("daemon", "task reminder check failed", { error: (err as Error).message });
      });
    }
  },
  null,
  true,
  undefined,
  null,
  false,
  undefined,
  false, // unrefTimeout — keep event loop alive
  true // waitForCompletion
);

// Scheduled backup check — hourly, runs backup if >1 day since last
new CronJob(
  "*/60 * * * *",
  async () => {
    try {
      const { runScheduledBackupIfDue } = await import("../commands/backup.js");
      await runScheduledBackupIfDue(DATA_DIR);
    } catch (err) {
      logger.error("daemon", "backup check error", { error: (err as Error).message });
    }
  },
  null,
  true,
  undefined,
  null,
  false,
  undefined,
  false, // unrefTimeout — keep event loop alive
  true // waitForCompletion
);

// Daily push subscription renewal at 06:00
new CronJob(
  "0 6 * * *",
  async () => {
    try {
      const { renewExpiringSubscriptions } = await import("../sync/push-manager.js");
      const { buildGmailRenewFn } = await import("../sync/gmail-webhook-handler.js");
      const tokenPath = path.join(DATA_DIR, ".agentic", "gmail-token.json");
      const credPath = path.join(DATA_DIR, ".agentic", "gmail-credentials.json");
      const { readSubscriptions } = await import("../sync/push-manager.js");
      const subs = await readSubscriptions(DATA_DIR);
      const gmailSubs = subs.filter((s) => s.provider === "gmail" && s.status === "active");
      if (gmailSubs.length === 0) return;
      if (!fs.existsSync(tokenPath) || !fs.existsSync(credPath)) return;
      const { getGmailAuth } = await import("../sync/gmail-auth.js");
      const auth = await getGmailAuth(credPath, tokenPath);
      const token = (auth.credentials?.access_token as string | undefined) ?? "";
      const result = await renewExpiringSubscriptions(DATA_DIR, buildGmailRenewFn(token, ""), 24);
      if (result.renewed.length > 0) {
        logger.info("push", "renewed subscriptions", { count: result.renewed.length });
      }
      if (result.errors.length > 0) {
        logger.warn("push", "renewal errors", { errors: result.errors });
      }
    } catch (err) {
      logger.error("push", "renewal failed", { error: (err as Error).message });
    }
  },
  null,
  true,
  undefined,
  null,
  false,
  undefined,
  false, // unrefTimeout — keep event loop alive
  true // waitForCompletion
);

// Daily proactive checks at 07:00 — relationship decay, deal risk, daily briefing
new CronJob(
  "0 7 * * *",
  async () => {
    try {
      const { runDailyProactiveChecks } = await import("../daemon/proactive-worker.js");
      const result = await runDailyProactiveChecks(DATA_DIR);
      logger.info("proactive", "daily check", {
        customersChecked: result.customersChecked,
        tasksEnqueued: result.tasksEnqueued,
      });
      if (result.errors.length > 0) {
        logger.warn("proactive", "errors during daily check", { errors: result.errors });
      }
      const { drainProactiveQueue } = await import("../core/notification-dispatcher.js");
      const drain = await drainProactiveQueue(DATA_DIR);
      logger.info("proactive", "dispatched tasks", { sent: drain.sent, failed: drain.failed });
      const { syncGoalProgressFromPipeline } = await import("../core/goal-engine.js");
      const goalSync = await syncGoalProgressFromPipeline(DATA_DIR);
      if (goalSync.updated.length > 0) {
        logger.info("goals", "progress synced", { updated: goalSync.updated });
      }
    } catch (err) {
      logger.error("proactive", "daily check failed", { error: (err as Error).message });
    }
  },
  null,
  true,
  undefined,
  null,
  false,
  undefined,
  false, // unrefTimeout — keep event loop alive
  true // waitForCompletion
);

// SLA breach check — daily at 08:00
new CronJob(
  "0 8 * * *",
  async () => {
    try {
      const { checkSlaBreaches } = await import("../core/sla-engine.js");
      const today = new Date().toISOString().slice(0, 10);
      const breaches = await checkSlaBreaches(DATA_DIR, today);
      if (breaches.length > 0) {
        logger.warn("tickets", "SLA breaches found", { count: breaches.length });
        for (const { slug, ticket } of breaches) {
          logger.warn("tickets", "SLA breach", {
            slug,
            ticketId: ticket.id,
            title: ticket.title,
            due: ticket.slaDue,
          });
        }
      }
    } catch (err) {
      logger.error("tickets", "SLA check failed", { error: (err as Error).message });
    }
  },
  null,
  true,
  undefined,
  null,
  false,
  undefined,
  false, // unrefTimeout — keep event loop alive
  true // waitForCompletion
);

// Email sequence cycle — every 6 hours
new CronJob(
  "0 */6 * * *",
  async () => {
    try {
      const { runSequenceCycle } = await import("../core/sequence-engine.js");
      const today = new Date().toISOString().slice(0, 10);
      const result = await runSequenceCycle(DATA_DIR, today);
      logger.info("sequences", "cycle complete", {
        sent: result.sent,
        completed: result.completed,
        errors: result.errors.length,
      });
    } catch (err) {
      logger.error("sequences", "cycle failed", { error: (err as Error).message });
    }
  },
  null,
  true,
  undefined,
  null,
  false,
  undefined,
  false, // unrefTimeout — keep event loop alive
  true // waitForCompletion
);

await startWatcher();

// Signal ready
if (process.send) process.send("ready");
logger.info("daemon", "daemon started");
