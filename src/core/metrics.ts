import { readAuditLog } from "../fs/audit-log.js";

/**
 * Command-center observability (N6-3 v1): operational metrics derived from the
 * append-only audit trail — total operations, breakdown by tool/actor, distinct
 * customers touched, and an automation rate (share performed by the system
 * actor, a proxy for autonomous/contained operations).
 */
export interface AuditMetrics {
  totalOperations: number;
  byTool: Record<string, number>;
  byActor: Record<string, number>;
  customersTouched: number;
  automationRate: number;
}

export function computeAuditMetrics(dataDir: string): AuditMetrics {
  const entries = readAuditLog(dataDir);
  const byTool: Record<string, number> = {};
  const byActor: Record<string, number> = {};
  const slugs = new Set<string>();
  let systemOps = 0;

  for (const e of entries) {
    byTool[e.tool] = (byTool[e.tool] ?? 0) + 1;
    byActor[e.actor] = (byActor[e.actor] ?? 0) + 1;
    if (e.slug) slugs.add(e.slug);
    if (e.actor === "system") systemOps++;
  }

  return {
    totalOperations: entries.length,
    byTool,
    byActor,
    customersTouched: slugs.size,
    automationRate: entries.length > 0 ? systemOps / entries.length : 0,
  };
}
