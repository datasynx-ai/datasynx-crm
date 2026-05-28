import fs from "fs";
import path from "path";

export type Role = "admin" | "manager" | "rep";

export interface RbacConfig {
  actors: Record<string, Role>;
  default?: Role;
  owned_customers?: Record<string, string[]>;
}

const ALLOWED_TOOLS: Record<Role, string[]> = {
  admin:   ["log_interaction", "update_deal", "update_customer_facts", "export_customer", "pursue_goal", "register_push_subscription"],
  manager: ["log_interaction", "update_deal", "pursue_goal"],
  rep:     ["log_interaction", "update_deal"],
};

function rbacPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "rbac.json");
}

export function getRbacConfig(dataDir: string): RbacConfig {
  const p = rbacPath(dataDir);
  if (!fs.existsSync(p)) return { actors: {} };
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8") as string) as RbacConfig;
  } catch {
    return { actors: {} };
  }
}

export function setActorRole(dataDir: string, actor: string, role: Role): void {
  const p = rbacPath(dataDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const config = getRbacConfig(dataDir);
  config.actors[actor] = role;
  fs.writeFileSync(p, JSON.stringify(config, null, 2), "utf-8");
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
  const role = getRole(dataDir, actor);
  assertCanWrite(role, tool, actor);
}

export function canSeeCustomer(dataDir: string, actor: string, slug: string): boolean {
  if (!fs.existsSync(rbacPath(dataDir))) return true; // open access
  const config = getRbacConfig(dataDir);
  const role = config.actors[actor] ?? config.default ?? "rep";
  if (role === "admin" || role === "manager") return true;
  // rep: only sees customers listed in owned_customers[actor]
  const owned = config.owned_customers;
  if (!owned) return false;
  return (owned[actor] ?? []).includes(slug);
}
