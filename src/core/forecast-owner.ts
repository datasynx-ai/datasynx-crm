import { getRbacConfig } from "./rbac.js";
import { readAuditLog } from "../fs/audit-log.js";

/** Bucket label for deals with no resolvable owner. */
export const UNASSIGNED_OWNER = "unassigned";

/**
 * slug → owning actor, inverted from RBAC `owned_customers` (first owner wins).
 * This is the customer-level ownership that also backs `customerVisibility`.
 */
export function customerOwnerMap(dataDir: string): Map<string, string> {
  const cfg = getRbacConfig(dataDir);
  const map = new Map<string, string>();
  for (const [actor, slugs] of Object.entries(cfg.owned_customers ?? {})) {
    for (const slug of slugs) if (!map.has(slug)) map.set(slug, actor);
  }
  return map;
}

/**
 * slug → most recent non-`system` actor from the audit trail. The audit log is
 * append-ordered (oldest first), so the last write per slug wins.
 */
export function lastAuditActorMap(dataDir: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of readAuditLog(dataDir)) {
    if (e.actor && e.actor !== "system") map.set(e.slug, e.actor);
  }
  return map;
}

/**
 * Resolve a deal's owner with a clear precedence (issue #51):
 *   explicit deal.owner → customer's RBAC owner → last audit actor → "unassigned".
 */
export function resolveDealOwner(
  dealOwner: string | undefined,
  slug: string,
  rbacOwners: Map<string, string>,
  auditOwners: Map<string, string>
): string {
  const explicit = dealOwner?.trim();
  if (explicit) return explicit;
  return rbacOwners.get(slug) ?? auditOwners.get(slug) ?? UNASSIGNED_OWNER;
}
