import { Command } from "commander";
import { listPlugins, getPlugin } from "../core/plugin-registry.js";
import { info, bold, error } from "../ui/colors.js";

export const pluginCommand = new Command("plugin").description("Manage dxcrm plugins");

pluginCommand
  .command("list")
  .description("List all registered plugins")
  .action(() => {
    const plugins = listPlugins();
    if (plugins.length === 0) {
      console.log(info("No plugins registered."));
      return;
    }
    console.log(bold(`\n dxcrm Plugins (${plugins.length})\n`));
    for (const p of plugins) {
      console.log(info(`  ${p.name.padEnd(20)} v${p.version}  ${p.description ?? ""}`));
    }
    console.log("");
  });

pluginCommand
  .command("info <name>")
  .description("Show info about a registered plugin")
  .action((name: string) => {
    const plugin = getPlugin(name);
    if (!plugin) {
      console.log(error(`Plugin '${name}' not found.`));
      process.exit(1);
    }
    console.log(bold(`\n Plugin: ${plugin.name}\n`));
    console.log(info(`  Version: ${plugin.version}`));
    if (plugin.description) console.log(info(`  Description: ${plugin.description}`));
    if (plugin.mcpTools?.length) {
      console.log(info(`  MCP Tools: ${plugin.mcpTools.join(", ")}`));
    }
    console.log("");
  });
