import fs from "fs";
import path from "path";
import { readJsonFile, writeJsonFile } from "../fs/json-store.js";

export type Role = "admin" | "manager" | "rep";

export interface RbacConfig {
  actors: Record<string, Role>;
  default?: Role;
  owned_customers?: Record<string, string[]>;
  /** Field-level ACL: field name → roles allowed to see it. Others get it redacted. */
  field_acl?: Record<string, Role[]>;
}

// Tasks are personal follow-ups — every role manages their own (issue #46).
const TASK_TOOLS = ["create_task", "complete_task", "snooze_task"];
// Catalog is shared pricing config — manager/admin only (issue #50).
const CATALOG_TOOLS = ["create_product", "update_product"];

const ALLOWED_TOOLS: Record<Role, string[]> = {
  admin: [
    "log_interaction",
    "update_deal",
    "update_customer_facts",
    "export_customer",
    "pursue_goal",
    "register_push_subscription",
    "define_custom_object",
    "create_record",
    ...TASK_TOOLS,
    ...CATALOG_TOOLS,
  ],
  manager: [
    "log_interaction",
    "update_deal",
    "pursue_goal",
    "create_record",
    ...TASK_TOOLS,
    ...CATALOG_TOOLS,
  ],
  rep: ["log_interaction", "update_deal", "create_record", ...TASK_TOOLS],
};

function rbacPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "rbac.json");
}

export function getRbacConfig(dataDir: string): RbacConfig {
  return readJsonFile<RbacConfig>(rbacPath(dataDir), { actors: {} });
}

export function setActorRole(dataDir: string, actor: string, role: Role): void {
  const config = getRbacConfig(dataDir);
  config.actors[actor] = role;
  writeJsonFile(rbacPath(dataDir), config);
}

export function getRole(dataDir: string, actor: string): Role {
  const config = getRbacConfig(dataDir);
  return config.actors[actor] ?? config.default ?? "rep";
}

export function canWrite(role: Role, tool: string): boolean {
  return ALLOWED_TOOLS[role]?.includes(tool) ?? false;
}

export function assertCanWrite(role: Role, tool: string, actor: string): void {
  if (!canWrite(role, tool)) {
    throw new Error(`Access denied: '${actor}' (role: ${role}) cannot use tool '${tool}'`);
  }
}

export function enforceRbac(dataDir: string, tool: string): void {
  if (!fs.existsSync(rbacPath(dataDir))) return; // no rbac.json = open access
  const actor = process.env["DXCRM_ACTOR"] ?? "system";
  if (actor === "system") return; // internal system actor bypasses RBAC
  const role = getRole(dataDir, actor);
  assertCanWrite(role, tool, actor);
}

export function canSeeCustomer(dataDir: string, actor: string, slug: string): boolean {
  if (!fs.existsSync(rbacPath(dataDir))) return true; // open access
  if (actor === "system") return true; // internal system actor always has full access
  const config = getRbacConfig(dataDir);
  const role = config.actors[actor] ?? config.default ?? "rep";
  if (role === "admin" || role === "manager") return true;
  // rep: only sees customers listed in owned_customers[actor]
  const owned = config.owned_customers;
  if (!owned) return false;
  return (owned[actor] ?? []).includes(slug);
}

/**
 * Build a once-loaded predicate for which customers `actor` may see. Equivalent
 * to calling canSeeCustomer per slug, but reads/parses rbac.json a single time
 * (and uses O(1) Set membership) — for hot loops like list_customers.
 */
export function customerVisibility(dataDir: string, actor: string): (slug: string) => boolean {
  if (!fs.existsSync(rbacPath(dataDir))) return () => true; // open access
  if (actor === "system") return () => true;
  const config = getRbacConfig(dataDir);
  const role = config.actors[actor] ?? config.default ?? "rep";
  if (role === "admin" || role === "manager") return () => true;
  const owned = new Set(config.owned_customers?.[actor] ?? []);
  return (slug: string) => owned.has(slug);
}

/** Load the field-level ACL (field → allowed roles) from rbac.json. */
export function loadFieldAcl(dataDir: string): Record<string, Role[]> {
  return getRbacConfig(dataDir).field_acl ?? {};
}

/** Whether a role may see a field given the ACL (fields not in the ACL are public). */
export function canSeeField(field: string, role: Role, acl: Record<string, Role[]>): boolean {
  const allowed = acl[field];
  if (!allowed) return true;
  return allowed.includes(role);
}

/** Return a copy of `values` with fields the role may not see removed. */
export function redactFields<T extends Record<string, unknown>>(
  values: T,
  role: Role,
  acl: Record<string, Role[]>
): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (canSeeField(k, role, acl)) out[k] = v;
  }
  return out as Partial<T>;
}
