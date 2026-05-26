import { Command } from "commander";
import { CAPABILITIES_TEXT } from "../mcp/capabilities.js";
import { info } from "../ui/colors.js";

export const guideCommand = new Command("guide")
  .description("Full CRM documentation in terminal")
  .action(() => {
    console.log(CAPABILITIES_TEXT);
  });

export const mcpCommand = new Command("mcp");

mcpCommand.command("docs").action(() => {
  console.log(CAPABILITIES_TEXT);
});

mcpCommand
  .command("start")
  .description("Start MCP server (stdio by default)")
  .option("--http", "Use HTTP transport instead of stdio")
  .option("--port <port>", "HTTP port (default 3847)", "3847")
  .action(async (opts: { http?: boolean; port: string }) => {
    if (opts.http) {
      const port = parseInt(opts.port, 10);
      console.error(info(`Starting MCP server in HTTP mode on port ${port}...`));
      const { startHttp } = await import("../mcp/server.js");
      await startHttp(port);
    } else {
      const { startStdio } = await import("../mcp/server.js");
      await startStdio();
    }
  });
