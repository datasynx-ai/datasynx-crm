import { listAllTickets, upsertTicket } from "../fs/ticket-writer.js";
import { isSlaBreach } from "../core/sla-engine.js";
import { resolveAssignee } from "../core/ticket-routing.js";
import { emitEvent } from "../core/webhooks.js";
import { enqueueTask, type NotificationChannel } from "../core/proactive-agent.js";
import { writeAuditEntry } from "../fs/audit-log.js";
import { logger } from "../core/logger.js";

export interface SlaMonitorResult {
  today: string;
  warned: number;
  escalated: number;
}

function channel(): NotificationChannel {
  if (process.env["TELEGRAM_BOT_TOKEN"] && process.env["TELEGRAM_CHAT_ID"]) return "telegram";
  if (process.env["SLACK_WEBHOOK_URL"]) return "slack";
  return "mcp_tool_response";
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function notify(dataDir: string, slug: string, message: string): Promise<void> {
  await enqueueTask(dataDir, {
    type: "follow_up_nudge",
    slug,
    priority: "urgent",
    payload: { message },
    scheduledFor: new Date().toISOString(),
    channel: channel(),
  }).catch(() => undefined);
}

/**
 * SLA monitoring (#59), runs in the daemon cron:
 *  - WARNING once when an open ticket's slaDue is today/tomorrow.
 *  - ESCALATION once on breach: reassign via the routing rules (excluding the
 *    current assignee), alert Slack/Telegram, emit ticket.sla_breached
 *    (workflow-engine ready), audit.
 */
export async function runSlaMonitor(
  dataDir: string,
  today: string = new Date().toISOString().slice(0, 10)
): Promise<SlaMonitorResult> {
  const result: SlaMonitorResult = { today, warned: 0, escalated: 0 };
  const tomorrow = addDays(today, 1);

  for (const { slug, ticket } of await listAllTickets(dataDir)) {
    if (ticket.status === "resolved" || ticket.status === "closed" || !ticket.slaDue) continue;

    // Pre-breach warning (once): due today or tomorrow.
    if (
      !ticket.slaWarnedAt &&
      !isSlaBreach(ticket, today) &&
      ticket.slaDue >= today &&
      ticket.slaDue <= tomorrow
    ) {
      await notify(
        dataDir,
        slug,
        `⏳ SLA warning: ticket ${ticket.id} "${ticket.title}" (${slug}) is due ${ticket.slaDue}${ticket.assignee ? ` — assigned to ${ticket.assignee}` : ""}`
      );
      await upsertTicket(dataDir, slug, { ...ticket, slaWarnedAt: new Date().toISOString() });
      writeAuditEntry(dataDir, {
        timestamp: new Date().toISOString(),
        actor: "sla-monitor",
        tool: "sla_warning",
        slug,
        summary: `${ticket.id} due ${ticket.slaDue}`,
      });
      result.warned++;
      continue;
    }

    // Breach escalation (once): reassign + alert + event.
    if (isSlaBreach(ticket, today) && !ticket.escalatedAt) {
      const newAssignee = resolveAssignee(dataDir, {
        slug,
        priority: "urgent",
        ...(ticket.tags ? { tags: ticket.tags } : {}),
        ...(ticket.assignee ? { excludeAssignee: ticket.assignee } : {}),
      });
      const updated = {
        ...ticket,
        escalatedAt: new Date().toISOString(),
        priority: "urgent" as const,
        ...(newAssignee ? { assignee: newAssignee } : {}),
      };
      await upsertTicket(dataDir, slug, updated);
      await emitEvent(dataDir, "ticket.sla_breached", {
        slug,
        ticket: updated,
        previousAssignee: ticket.assignee,
      }).catch(() => undefined);
      await notify(
        dataDir,
        slug,
        `🚨 SLA BREACH: ticket ${ticket.id} "${ticket.title}" (${slug}) was due ${ticket.slaDue}${newAssignee ? ` — reassigned to ${newAssignee}` : ""}`
      );
      writeAuditEntry(dataDir, {
        timestamp: new Date().toISOString(),
        actor: "sla-monitor",
        tool: "sla_escalation",
        slug,
        summary: `${ticket.id} breached (due ${ticket.slaDue})${newAssignee ? ` → ${newAssignee}` : ""}`,
      });
      logger.warn("daemon", "sla breach escalated", { ticket: ticket.id, slug });
      result.escalated++;
    }
  }

  return result;
}
