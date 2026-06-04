import { Command } from "commander";
import fs from "fs";
import path from "path";
import { success, error, info, bold } from "../ui/colors.js";
import { AgentConfigSchema, type AgentConfig } from "../schemas/agent-config.js";
import { writeJsonFile } from "../fs/json-store.js";

function agentsDir(dataDir: string): string {
  return path.join(dataDir, ".agentic", "agents");
}

function agentConfigPath(dataDir: string, slug: string): string {
  return path.join(agentsDir(dataDir), `${slug}.agent.json`);
}

export async function runAgentSpawn(
  slug: string,
  opts: { channel?: string; wakeOnEmail?: boolean; chatId?: string },
  dataDir?: string
): Promise<void> {
  const dir = dataDir ?? process.cwd();
  const customerDir = path.join(dir, "customers", slug);

  if (!fs.existsSync(customerDir)) {
    console.error(
      error(`✗ Customer '${slug}' not found. Run 'dxcrm list' to see available customers.`)
    );
    process.exit(1);
  }

  const channel = (opts.channel ?? "telegram") as "telegram";
  const wakeOn: Array<"email" | "calendar"> = opts.wakeOnEmail ? ["email"] : ["email"];

  const config: AgentConfig = AgentConfigSchema.parse({
    slug,
    channel,
    wakeOn,
    createdAt: new Date().toISOString(),
    lastWake: null,
    ...(opts.chatId !== undefined ? { telegramChatId: opts.chatId } : {}),
  });

  writeJsonFile(agentConfigPath(dir, slug), config);

  console.log(success(`✓ Agent spawned: ${bold(slug)}`));
  console.log(info(`  Channel:  ${channel}`));
  console.log(info(`  Wake on:  ${wakeOn.join(", ")}`));
  console.log(info(`  Config:   .agentic/agents/${slug}.agent.json`));

  if (channel === "telegram" && !process.env["TELEGRAM_BOT_TOKEN"]) {
    console.log(
      info(
        `\n  Note: Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars to enable Telegram messages.`
      )
    );
  }
}

export async function runAgentStatus(dataDir?: string): Promise<void> {
  const dir = dataDir ?? process.cwd();
  const dir2 = agentsDir(dir);

  if (!fs.existsSync(dir2)) {
    console.log(info("No agents configured. Run: dxcrm agent spawn <slug> --channel telegram"));
    return;
  }

  const files = fs.readdirSync(dir2).filter((f) => f.endsWith(".agent.json"));

  if (files.length === 0) {
    console.log(info("No agents configured."));
    return;
  }

  console.log(bold(`\n Agents (${files.length})\n`));

  for (const file of files) {
    try {
      const raw = JSON.parse(
        fs.readFileSync(path.join(dir2, file), "utf-8") as string
      ) as AgentConfig;
      const lastWake = raw.lastWake
        ? `last wake: ${new Date(raw.lastWake).toLocaleString()}`
        : "never woken";
      console.log(
        info(`  ${bold(raw.slug)} — ${raw.channel} · ${raw.wakeOn.join("+")} · ${lastWake}`)
      );
    } catch {
      console.log(info(`  ${file} (malformed)`));
    }
  }
  console.log("");
}

export async function runAgentRemove(slug: string, dataDir?: string): Promise<void> {
  const dir = dataDir ?? process.cwd();
  const configPath = agentConfigPath(dir, slug);

  if (!fs.existsSync(configPath)) {
    console.error(error(`✗ No agent config found for '${slug}'.`));
    process.exit(1);
  }

  fs.unlinkSync(configPath);
  console.log(success(`✓ Agent removed: ${slug}`));
}

export const agentCommand = new Command("agent").description("Manage per-customer agents");

agentCommand
  .command("spawn <slug>")
  .description("Spawn a wake-triggered agent for a customer")
  .option("--channel <channel>", "Notification channel (telegram)", "telegram")
  .option("--wake-on-email", "Wake agent on new email (default: on)")
  .option("--chat-id <chatId>", "Telegram chat ID override")
  .action((slug: string, opts: { channel?: string; wakeOnEmail?: boolean; chatId?: string }) =>
    runAgentSpawn(slug, opts, process.env["DXCRM_DATA_DIR"])
  );

agentCommand
  .command("status")
  .description("Show all configured agents")
  .action(() => runAgentStatus(process.env["DXCRM_DATA_DIR"]));

agentCommand
  .command("remove <slug>")
  .description("Remove agent config for a customer")
  .action((slug: string) => runAgentRemove(slug, process.env["DXCRM_DATA_DIR"]));
