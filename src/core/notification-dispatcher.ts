// src/core/notification-dispatcher.ts
// Drains agent-queue.json and dispatches pending tasks to Telegram, Slack, or
// marks them done for mcp_tool_response (consumed by get_proactive_briefing).
import https from "https";
import { readQueue, markTaskDone, type AgentTask } from "./proactive-agent.js";
import { logger } from "./logger.js";

// ─── Transport helpers ────────────────────────────────────────────────────────

export async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  const body = JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" });
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
}

export async function sendSlack(webhookUrl: string, text: string): Promise<void> {
  const body = JSON.stringify({ text });
  const url = new URL(webhookUrl);
  await new Promise<void>((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
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
}

// ─── Message formatting ───────────────────────────────────────────────────────

export function formatTaskMessage(task: AgentTask): string {
  const payload = task.payload as Record<string, unknown>;
  const slug = task.slug ?? "";

  switch (task.type) {
    case "daily_briefing": {
      const b = payload as { urgent?: string[]; forecast?: string; topAction?: string };
      const lines: string[] = ["📋 *Daily CRM Briefing*", ""];
      if (b.urgent?.length) {
        lines.push("🚨 *Urgent:*");
        b.urgent.slice(0, 3).forEach((u) => lines.push(`• ${u}`));
        lines.push("");
      }
      if (b.forecast) lines.push(`📊 ${b.forecast}`);
      if (b.topAction) lines.push(`\n⚡ *Top Action:* ${b.topAction}`);
      return lines.join("\n");
    }
    case "relationship_decay_alert":
      return `⚠️ *Relationship Alert: ${slug}*\n${String(payload["name"] ?? "")} — ${String(payload["daysSinceContact"] ?? "?")} days silent, grade ${String(payload["grade"] ?? "?")}`;
    case "deal_risk_alert":
      return `🔴 *Deal Risk: ${slug}*\n"${String(payload["dealName"] ?? "")}" closes in ${String(payload["daysToClose"] ?? "?")} days`;
    case "external_signal_alert":
      return `💡 *Signal: ${slug}*\n${String(payload["summary"] ?? "")}`;
    case "follow_up_nudge":
      return `📞 *Follow-up: ${slug}*\n${String(payload["message"] ?? "")}`;
    case "task_due_reminder": {
      const p = payload as {
        date?: string;
        tasks?: Array<{ title?: string; slug?: string; dueDate?: string; priority?: string }>;
      };
      const lines = [`✅ *Tasks due ${p.date ?? "today"}*`, ""];
      for (const t of (p.tasks ?? []).slice(0, 15)) {
        const cust = t.slug ? ` [${t.slug}]` : "";
        const prio = t.priority === "high" ? " ‼️" : "";
        lines.push(`• ${t.title ?? "?"}${cust} — due ${t.dueDate ?? "?"}${prio}`);
      }
      return lines.join("\n");
    }
    default:
      return `📌 CRM Task (${task.type})\n${JSON.stringify(payload).slice(0, 200)}`;
  }
}

// ─── Queue drain ──────────────────────────────────────────────────────────────

export interface DrainResult {
  sent: number;
  failed: number;
}

export async function drainProactiveQueue(dataDir: string): Promise<DrainResult> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  const chatId = process.env["TELEGRAM_CHAT_ID"];
  const slackUrl = process.env["SLACK_WEBHOOK_URL"];

  const tasks = readQueue(dataDir).filter((t) => t.status === "pending");
  let sent = 0;
  let failed = 0;

  for (const task of tasks) {
    const message = formatTaskMessage(task);
    try {
      if (task.channel === "telegram" && token && chatId) {
        await sendTelegram(token, chatId, message);
      } else if (task.channel === "slack" && slackUrl) {
        await sendSlack(slackUrl, message);
      }
      // mcp_tool_response tasks: consumed by get_proactive_briefing — just mark done
      await markTaskDone(dataDir, task.id, "dispatched");
      sent++;
    } catch (err) {
      failed++;
      logger.error("dispatch", "task failed", { task: task.id, error: (err as Error).message });
    }
  }

  return { sent, failed };
}
