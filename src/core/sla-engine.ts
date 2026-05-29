import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import type { Ticket } from "../schemas/ticket.js";

export interface SlaRule {
  priority: Ticket["priority"];
  resolveDays: number;
}

const DEFAULT_RULES: SlaRule[] = [
  { priority: "urgent", resolveDays: 1 },
  { priority: "high", resolveDays: 2 },
  { priority: "normal", resolveDays: 5 },
  { priority: "low", resolveDays: 10 },
];

export function loadSlaRules(dataDir: string): SlaRule[] {
  const p = path.join(dataDir, ".agentic", "sla-rules.yaml");
  if (!fs.existsSync(p)) return DEFAULT_RULES;
  try {
    const raw = yaml.load(fs.readFileSync(p, "utf-8") as string) as { rules?: SlaRule[] };
    return raw?.rules ?? DEFAULT_RULES;
  } catch {
    return DEFAULT_RULES;
  }
}

function addDaysToDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number) as [number, number, number];
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function calcSlaDue(createdDate: string, priority: Ticket["priority"], rules: SlaRule[]): string {
  const rule = rules.find((r) => r.priority === priority) ?? { resolveDays: 5 };
  return addDaysToDate(createdDate, rule.resolveDays);
}

export function isSlaBreach(ticket: Ticket, today: string): boolean {
  if (ticket.status === "resolved" || ticket.status === "closed") return false;
  if (!ticket.slaDue) return false;
  return ticket.slaDue < today;
}

export async function checkSlaBreaches(
  dataDir: string,
  today: string
): Promise<Array<{ slug: string; ticket: Ticket }>> {
  const { listAllTickets } = await import("../fs/ticket-writer.js");
  const all = await listAllTickets(dataDir);
  return all.filter(({ ticket }) => isSlaBreach(ticket, today));
}
