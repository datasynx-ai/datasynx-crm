import { Command } from "commander";
import { getRbacConfig, setActorRole, canWrite, type Role } from "../core/rbac.js";
import { success, error, info, bold } from "../ui/colors.js";

const ROLES: Role[] = ["admin", "manager", "rep"];

export async function runRbacSet(actor: string, role: string, dataDir?: string): Promise<void> {
  const dir = dataDir ?? process.cwd();
  if (!ROLES.includes(role as Role)) {
    console.error(error(`✗ Invalid role '${role}'. Must be: ${ROLES.join(", ")}`));
    process.exit(1);
  }
  setActorRole(dir, actor, role as Role);
  console.log(success(`✓ ${bold(actor)} → ${bold(role)}`));
}

export async function runRbacShow(dataDir?: string): Promise<void> {
  const dir = dataDir ?? process.cwd();
  const config = getRbacConfig(dir);
  const entries = Object.entries(config.actors);

  if (entries.length === 0) {
    console.log(info("No RBAC roles configured. All actors default to 'rep'."));
    return;
  }

  console.log(bold(`\n RBAC Roles\n`));
  for (const [actor, role] of entries) {
    console.log(info(`  ${bold(actor).padEnd(20)}  ${role}`));
  }
  if (config.default) {
    console.log(info(`\n  Default: ${config.default}`));
  }
  console.log("");
}

export async function runRbacCheck(actor: string, tool: string, dataDir?: string): Promise<void> {
  const dir = dataDir ?? process.cwd();
  const { getRole } = await import("../core/rbac.js");
  const role = getRole(dir, actor);
  const allowed = canWrite(role, tool);
  if (allowed) {
    console.log(success(`✓ ${actor} (${role}) CAN use '${tool}'`));
  } else {
    console.log(error(`✗ ${actor} (${role}) CANNOT use '${tool}'`));
  }
}

export const rbacCommand = new Command("rbac").description("Manage role-based access control");

rbacCommand
  .command("set <actor> <role>")
  .description(`Assign role to actor (roles: ${ROLES.join(", ")})`)
  .action((actor: string, role: string) => runRbacSet(actor, role));

rbacCommand
  .command("show")
  .description("List all RBAC role assignments")
  .action(() => runRbacShow());

rbacCommand
  .command("check <actor> <tool>")
  .description("Check if an actor can use a specific tool")
  .action((actor: string, tool: string) => runRbacCheck(actor, tool));
