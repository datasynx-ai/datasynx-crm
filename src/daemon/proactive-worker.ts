// src/daemon/proactive-worker.ts
// Daily proactive checks: relationship decay + deal risk + daily briefing.
// Called from worker.ts CronJob at 07:00. Enqueues tasks to agent-queue.json.
// Queue draining (Telegram/Slack dispatch) is handled by G3 / notification-dispatcher.
import fs from "fs";
import path from "path";
import { computeCustomerHealth, readHealth } from "../core/relationship-health.js";
import { readPipeline } from "../fs/pipeline-writer.js";
import {
  buildDailyBriefing,
  enqueueTask,
  type NotificationChannel,
} from "../core/proactive-agent.js";
import { fetchSignalsForCustomer } from "../sync/external-signals.js";
import { runScheduledBackupIfDue } from "../commands/backup.js";

const MAX_CUSTOMERS_PER_CYCLE = 50;

function defaultChannel(): NotificationChannel {
  if (process.env["TELEGRAM_BOT_TOKEN"] && process.env["TELEGRAM_CHAT_ID"]) return "telegram";
  if (process.env["SLACK_WEBHOOK_URL"]) return "slack";
  return "mcp_tool_response";
}

export interface ProactiveCheckResult {
  today: string;
  customersChecked: number;
  tasksEnqueued: number;
  errors: string[];
}

export async function runDailyProactiveChecks(
  dataDir: string,
  today: string = new Date().toISOString().slice(0, 10)
): Promise<ProactiveCheckResult> {
  const result: ProactiveCheckResult = { today, customersChecked: 0, tasksEnqueued: 0, errors: [] };
  const channel = defaultChannel();

  const customersDir = path.join(dataDir, "customers");
  const slugs = fs.existsSync(customersDir)
    ? fs
        .readdirSync(customersDir)
        .filter((s) => {
          try {
            return fs.statSync(path.join(customersDir, s)).isDirectory();
          } catch {
            return false;
          }
        })
        .slice(0, MAX_CUSTOMERS_PER_CYCLE)
    : [];

  const todayMs = new Date(`${today}T00:00:00Z`).getTime();

  await Promise.all(
    slugs.map(async (slug) => {
      try {
        // Relationship health — use cached snapshot if fresh, compute otherwise
        const health = readHealth(dataDir, slug) ?? computeCustomerHealth(dataDir, slug, today);

        for (const contact of health.contacts) {
          const isDecayed = contact.riskFlags.includes("NO_CONTACT_30D") || contact.grade === "F";

          if (isDecayed) {
            await enqueueTask(dataDir, {
              type: "relationship_decay_alert",
              slug,
              priority: contact.grade === "F" ? "urgent" : "high",
              payload: {
                contactId: contact.contactId,
                name: contact.name,
                email: contact.email,
                daysSinceContact: contact.daysSinceContact,
                grade: contact.grade,
                riskFlags: contact.riskFlags,
              },
              scheduledFor: new Date().toISOString(),
              channel,
            });
            result.tasksEnqueued++;
          }
        }

        // Deal risk — close date within 7 days or already overdue
        const deals = await readPipeline(dataDir, slug).catch(() => []);
        for (const deal of deals) {
          if (deal.stage === "won" || deal.stage === "lost") continue;
          if (!deal.close_date?.trim()) continue;

          const daysToClose = Math.floor(
            (new Date(deal.close_date).getTime() - todayMs) / 86_400_000
          );

          if (daysToClose <= 7) {
            await enqueueTask(dataDir, {
              type: "deal_risk_alert",
              slug,
              priority: daysToClose < 0 ? "urgent" : "high",
              payload: {
                dealName: deal.name,
                stage: deal.stage,
                value: deal.value,
                closeDate: deal.close_date,
                daysToClose,
                overdue: daysToClose < 0,
              },
              scheduledFor: new Date().toISOString(),
              channel,
            });
            result.tasksEnqueued++;
          }
        }

        // External signals — read domain/name from main_facts if available
        try {
          const factsPath = path.join(dataDir, "customers", slug, "main_facts.md");
          if (fs.existsSync(factsPath)) {
            const raw = fs.readFileSync(factsPath, "utf-8");
            const domainMatch = raw.match(/^domain:\s*(.+)$/im);
            const nameMatch = raw.match(/^name:\s*(.+)$/im);
            const domain = domainMatch?.[1]?.trim();
            const companyName = nameMatch?.[1]?.trim() ?? slug;
            if (domain) {
              const signals = await fetchSignalsForCustomer(
                dataDir,
                slug,
                domain,
                companyName,
                today
              );
              for (const signal of signals) {
                if (signal.impact === "neutral") continue;
                await enqueueTask(dataDir, {
                  type: "external_signal_alert",
                  slug,
                  priority: signal.impact === "negative" ? "urgent" : "high",
                  payload: signal,
                  scheduledFor: new Date().toISOString(),
                  channel,
                });
                result.tasksEnqueued++;
              }
            }
          }
        } catch {
          // External signals are best-effort — never block the rest of the cycle
        }

        result.customersChecked++;
      } catch (err) {
        result.errors.push(`${slug}: ${(err as Error).message}`);
      }
    })
  );

  // Daily briefing — always enqueue, agents consume via get_proactive_briefing
  try {
    const briefing = await buildDailyBriefing(dataDir, today);
    await enqueueTask(dataDir, {
      type: "daily_briefing",
      priority: "normal",
      payload: briefing,
      scheduledFor: new Date().toISOString(),
      channel,
    });
    result.tasksEnqueued++;
  } catch (err) {
    result.errors.push(`daily_briefing: ${(err as Error).message}`);
  }

  // Scheduled backup — fire-and-forget, non-blocking
  runScheduledBackupIfDue(dataDir).catch(() => {
    // non-critical — proactive cycle must not fail due to backup errors
  });

  return result;
}
