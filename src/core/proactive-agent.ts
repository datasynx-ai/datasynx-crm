import fs from "fs";
import path from "path";
import { withJsonFile } from "./file-lock.js";
import { computeCustomerHealth, readHealth } from "./relationship-health.js";
import { readPipeline } from "../fs/pipeline-writer.js";
import { buildSimulationInput, runSimulation } from "./revenue-simulation.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaskType =
  | "daily_briefing"
  | "relationship_decay_alert"
  | "deal_risk_alert"
  | "external_signal_alert"
  | "follow_up_nudge"
  | "goal_progress_update"
  | "pipeline_forecast_weekly"
  | "playbook_suggestion";

export type NotificationChannel = "telegram" | "slack" | "email" | "mcp_tool_response";
export type TaskPriority = "urgent" | "high" | "normal";
export type TaskStatus = "pending" | "processing" | "done" | "failed";

export interface AgentTask {
  id: string;
  type: TaskType;
  slug?: string;
  priority: TaskPriority;
  payload: unknown;
  createdAt: string;
  scheduledFor: string;
  status: TaskStatus;
  result?: string;
  channel: NotificationChannel;
}

export interface DailyBriefing {
  date: string;
  generatedAt: string;
  urgent: string[];
  opportunities: string[];
  forecast: string;
  topAction: string;
}

// ─── Queue path ───────────────────────────────────────────────────────────────

function queuePath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "agent-queue.json");
}

// ─── Queue operations ─────────────────────────────────────────────────────────

export function readQueue(dataDir: string): AgentTask[] {
  const p = queuePath(dataDir);
  if (!fs.existsSync(p)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8") as string) as unknown;
    return Array.isArray(raw) ? (raw as AgentTask[]) : [];
  } catch {
    return [];
  }
}

export async function enqueueTask(
  dataDir: string,
  task: Omit<AgentTask, "id" | "createdAt" | "status">
): Promise<AgentTask> {
  const now = new Date().toISOString();
  const newTask: AgentTask = {
    ...task,
    id: `task_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    createdAt: now,
    status: "pending",
  };

  await withJsonFile<AgentTask[]>(queuePath(dataDir), (current) => {
    const existing = Array.isArray(current) ? current : [];
    return [...existing, newTask];
  });

  return newTask;
}

export async function markTaskDone(dataDir: string, taskId: string, result?: string): Promise<void> {
  await withJsonFile<AgentTask[]>(queuePath(dataDir), (current) => {
    const tasks = Array.isArray(current) ? [...current] : [];
    const idx = tasks.findIndex((t) => t.id === taskId);
    if (idx >= 0) {
      tasks[idx] = { ...tasks[idx]!, status: "done", ...(result ? { result } : {}) };
    }
    return tasks;
  });
}

// ─── Daily briefing ───────────────────────────────────────────────────────────

export async function buildDailyBriefing(dataDir: string, today: string): Promise<DailyBriefing> {
  const customersDir = path.join(dataDir, "customers");
  const slugs = fs.existsSync(customersDir)
    ? fs.readdirSync(customersDir).filter((d) =>
        fs.statSync(path.join(customersDir, d)).isDirectory()
      )
    : [];

  const urgent: string[] = [];
  const opportunities: string[] = [];
  const todayDate = new Date(`${today}T00:00:00Z`);

  // Parallel I/O across all customers
  const customerData = await Promise.all(
    slugs.map(async (slug) => {
      const cached = readHealth(dataDir, slug);
      const health = cached ?? computeCustomerHealth(dataDir, slug, today);
      const deals = await readPipeline(dataDir, slug).catch(() => []);
      return { slug, health, deals };
    })
  );

  for (const { slug, health, deals } of customerData) {
    // Relationship decay alerts
    for (const contact of health.contacts) {
      if (contact.riskFlags.includes("NO_CONTACT_30D")) {
        urgent.push(
          `${slug}: ${contact.name} has been silent for ${contact.daysSinceContact} days — health ${contact.score}/100`
        );
      }
    }

    // Opportunities — B-grade+ relationship health with active deals
    const activeDeals = deals.filter((d) => d.stage !== "won" && d.stage !== "lost");
    if (health.overallHealth >= 65 && activeDeals.length > 0) {
      opportunities.push(
        `${slug}: relationship health ${health.overallHealth}/100 with ${activeDeals.length} active deal(s) — good time for expansion or upsell.`
      );
    }

    // Deal risk alerts
    for (const deal of deals) {
      if (deal.stage === "won" || deal.stage === "lost") continue;
      if (deal.close_date && deal.close_date.trim() !== "") {
        const daysToClose = Math.floor(
          (new Date(deal.close_date).getTime() - todayDate.getTime()) / 86_400_000
        );
        if (daysToClose <= 7 && daysToClose >= 0) {
          urgent.push(
            `${slug}: Deal "${deal.name}" closes in ${daysToClose} day(s) — ${deal.stage}`
          );
        } else if (daysToClose < 0) {
          urgent.push(
            `${slug}: Deal "${deal.name}" close date passed (${Math.abs(daysToClose)} days overdue)`
          );
        }
      }
    }
  }

  // Revenue forecast
  let forecast = "No active pipeline.";
  try {
    const simInput = await buildSimulationInput(dataDir, "quarter", today);
    if (simInput.deals.length > 0) {
      const sim = runSimulation({ ...simInput, iterations: 1000 });
      forecast = `Q forecast: P50 €${(sim.p50 / 1000).toFixed(1)}k / P90 €${(sim.p90 / 1000).toFixed(1)}k — ${simInput.deals.length} deal(s) in pipeline.`;
    }
  } catch {
    // forecast stays as default
  }

  // Top action
  const topAction =
    urgent.length > 0
      ? urgent[0]!.replace(/^[^:]+: /, "").split("—")[0]?.trim() ?? urgent[0]!
      : "Review your pipeline and schedule next customer check-ins.";

  return {
    date: today,
    generatedAt: new Date().toISOString(),
    urgent,
    opportunities,
    forecast,
    topAction,
  };
}
